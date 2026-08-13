import { useCallback, useEffect, useRef, useState } from 'react';
import { getFaceClassifier, getCv } from '@/lib/opencv';

export interface FaceBox { x: number; y: number; w: number; h: number } // normalized 0-1

export interface FaceMetrics {
  facePresent: boolean;
  attendancePercent: number;   // % of samples where a face was detected
  nervousness: number;         // 0-100
  confidence: number;          // 0-100
  eyeContact: number;          // 0-100 (how centered the face is)
  movement: number;            // 0-100 raw motion
  awayEvents: number;          // how many times the candidate left the frame
  samples: number;
  box: FaceBox | null;         // face bounding box for the on-screen focus square
  engine: 'opencv' | 'native' | 'heuristic';
}

const EMPTY: FaceMetrics = {
  facePresent: false, attendancePercent: 0, nervousness: 0, confidence: 0,
  eyeContact: 0, movement: 0, awayEvents: 0, samples: 0, box: null, engine: 'heuristic',
};

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/**
 * In-browser face monitoring.
 * Primary detector is OpenCV.js (Haar cascade) which gives a real bounding box,
 * with the native FaceDetector API and a skin-tone heuristic as fallbacks.
 */
export function useFaceMonitor(enabled: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cvCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<any>(null);
  const cascadeRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);

  const statsRef = useRef({ present: 0, total: 0, away: 0, wasPresent: true });
  const lastCentroid = useRef<{ x: number; y: number } | null>(null);
  const motionEma = useRef(0);
  const smoothBox = useRef<FaceBox | null>(null);

  const [metrics, setMetrics] = useState<FaceMetrics>(EMPTY);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current) { window.clearTimeout(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    smoothBox.current = null;
    setActive(false);
  }, []);


  const sample = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
    canvas.width = 96; canvas.height = 72;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let count = 0, sx = 0, sy = 0;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const isSkin = r > 70 && g > 40 && b > 20 && r > g && r > b && (max - min) > 12 && Math.abs(r - g) > 10;
      if (isSkin) {
        const px = (i / 4) % canvas.width;
        const py = Math.floor((i / 4) / canvas.width);
        count++; sx += px; sy += py;
      }
    }

    const ratio = count / (canvas.width * canvas.height);
    let present = ratio > 0.025;
    let cx = count ? sx / count / canvas.width : 0.5;
    let cy = count ? sy / count / canvas.height : 0.5;
    let box: FaceBox | null = null;
    let engine: FaceMetrics['engine'] = 'heuristic';

    // 1) OpenCV.js Haar cascade — gives an accurate square around the face.
    const cv = getCv();
    if (cv && cascadeRef.current) {
      const work = cvCanvasRef.current ?? (cvCanvasRef.current = document.createElement('canvas'));
      work.width = 240; work.height = 180;
      const wctx = work.getContext('2d', { willReadFrequently: true });
      if (wctx) {
        wctx.drawImage(video, 0, 0, work.width, work.height);
        let src: any, gray: any, faces: any;
        try {
          src = cv.imread(work);
          gray = new cv.Mat();
          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.equalizeHist(gray, gray);
          faces = new cv.RectVector();
          cascadeRef.current.detectMultiScale(gray, faces, 1.15, 4, 0, new cv.Size(40, 40));
          engine = 'opencv';
          if (faces.size() > 0) {
            let best = faces.get(0);
            for (let i = 1; i < faces.size(); i++) {
              const f = faces.get(i);
              if (f.width * f.height > best.width * best.height) best = f;
            }
            present = true;
            box = { x: best.x / work.width, y: best.y / work.height, w: best.width / work.width, h: best.height / work.height };
            cx = box.x + box.w / 2;
            cy = box.y + box.h / 2;
          } else {
            present = false;
          }
        } catch { engine = 'heuristic'; }
        finally {
          src?.delete?.(); gray?.delete?.(); faces?.delete?.();
        }
      }
    } else if (detectorRef.current) {
      // 2) Native FaceDetector API
      try {
        const detected = await detectorRef.current.detect(video);
        engine = 'native';
        if (detected?.length) {
          const b = detected[0].boundingBox;
          const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
          present = true;
          box = { x: b.x / vw, y: b.y / vh, w: b.width / vw, h: b.height / vh };
          cx = box.x + box.w / 2;
          cy = box.y + box.h / 2;
        } else {
          present = false;
        }
      } catch { /* fall back to heuristic */ }
    }

    // 3) Heuristic box from the skin-tone centroid
    if (present && !box) {
      const size = clamp(Math.sqrt(ratio) * 1.9, 0.18, 0.8);
      box = { x: clamp(cx - size / 2, 0, 1), y: clamp(cy - size / 2, 0, 1), w: size, h: size };
    }

    // Smooth the square so it glides instead of jittering
    if (box) {
      const prev = smoothBox.current;
      smoothBox.current = prev
        ? {
            x: prev.x + (box.x - prev.x) * 0.35,
            y: prev.y + (box.y - prev.y) * 0.35,
            w: prev.w + (box.w - prev.w) * 0.35,
            h: prev.h + (box.h - prev.h) * 0.35,
          }
        : box;
    } else {
      smoothBox.current = null;
    }

    // Motion between samples (proxy for fidgeting / restlessness)
    let move = 0;
    if (present && lastCentroid.current) {
      const dx = cx - lastCentroid.current.x;
      const dy = cy - lastCentroid.current.y;
      move = clamp(Math.sqrt(dx * dx + dy * dy) * 600);
    }
    if (present) lastCentroid.current = { x: cx, y: cy };
    motionEma.current = motionEma.current * 0.75 + move * 0.25;

    const s = statsRef.current;
    s.total += 1;
    if (present) s.present += 1;
    if (!present && s.wasPresent) s.away += 1;
    s.wasPresent = present;

    const centerOffset = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.45) ** 2);
    const eyeContact = present ? clamp(100 - centerOffset * 220) : 0;
    const attendancePercent = Math.round((s.present / s.total) * 100);
    const nervousness = present
      ? Math.round(clamp(motionEma.current * 1.3 + (100 - eyeContact) * 0.45))
      : 0;
    const confidence = present
      ? Math.round(clamp(100 - nervousness * 0.7 + (eyeContact - 50) * 0.3))
      : 0;

    setMetrics({
      facePresent: present,
      attendancePercent,
      nervousness,
      confidence,
      eyeContact: Math.round(eyeContact),
      movement: Math.round(motionEma.current),
      awayEvents: s.away,
      samples: s.total,
      box: smoothBox.current,
      engine,
    });
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      const FD = (window as any).FaceDetector;
      if (FD && !detectorRef.current) {
        try { detectorRef.current = new FD({ fastMode: true, maxDetectedFaces: 1 }); } catch { /* unsupported */ }
      }
      // Load OpenCV in the background; detection upgrades itself once ready.
      void getFaceClassifier().then(c => { if (c) cascadeRef.current = c; });
      setActive(true);

      const loop = async () => {
        await sample();
        rafRef.current = window.setTimeout(loop, 400);
      };
      loop();
    } catch (e: any) {
      setError(e?.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera unavailable');
      setActive(false);
    }
  }, [sample]);


  useEffect(() => {
    if (enabled) void start();
    else stop();
    return stop;
  }, [enabled, start, stop]);

  return { videoRef, metrics, active, error, restart: start, stop };
}
