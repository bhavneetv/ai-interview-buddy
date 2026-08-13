// Lazy loader for OpenCV.js + the frontal-face Haar cascade.
// Everything degrades gracefully: if the CDN is unreachable the caller falls
// back to its own heuristic detector.

const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';
const CASCADE_URL =
  'https://cdn.jsdelivr.net/gh/opencv/opencv@4.x/data/haarcascades/haarcascade_frontalface_default.xml';
const CASCADE_PATH = 'haarcascade_frontalface_default.xml';

let loadPromise: Promise<any> | null = null;
let classifier: any = null;

function loadScript(): Promise<any> {
  return new Promise((resolve, reject) => {
    const cv = (window as any).cv;
    if (cv?.CascadeClassifier) return resolve(cv);

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_URL}"]`);
    const script = existing ?? document.createElement('script');
    const onReady = () => {
      const instance = (window as any).cv;
      if (!instance) return reject(new Error('opencv missing'));
      if (instance.then) {
        instance.then((mod: any) => { (window as any).cv = mod; resolve(mod); }).catch(reject);
      } else if (instance.getBuildInformation) {
        resolve(instance);
      } else {
        instance.onRuntimeInitialized = () => resolve(instance);
      }
    };

    script.onload = onReady;
    script.onerror = () => reject(new Error('opencv failed to load'));
    if (!existing) {
      script.src = OPENCV_URL;
      script.async = true;
      document.head.appendChild(script);
    } else if ((window as any).cv) {
      onReady();
    }
  });
}

/** Returns a ready-to-use CascadeClassifier, or null when OpenCV is unavailable. */
export async function getFaceClassifier(): Promise<any | null> {
  if (classifier) return classifier;
  if (!loadPromise) {
    loadPromise = (async () => {
      const cv = await loadScript();
      const res = await fetch(CASCADE_URL);
      if (!res.ok) throw new Error('cascade fetch failed');
      const buffer = new Uint8Array(await res.arrayBuffer());
      try { cv.FS_unlink(CASCADE_PATH); } catch { /* not created yet */ }
      cv.FS_createDataFile('/', CASCADE_PATH, buffer, true, false, false);
      const cascade = new cv.CascadeClassifier();
      if (!cascade.load(CASCADE_PATH)) throw new Error('cascade load failed');
      classifier = cascade;
      return cascade;
    })();
  }
  try {
    return await loadPromise;
  } catch {
    return null;
  }
}

export function getCv(): any | null {
  const cv = (window as any).cv;
  return cv?.CascadeClassifier ? cv : null;
}
