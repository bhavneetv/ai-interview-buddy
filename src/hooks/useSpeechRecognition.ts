import { useState, useEffect, useCallback, useRef } from 'react';

interface UseSpeechRecognitionReturn {
  transcript: string;
  isListening: boolean;
  audioLevel: number;
  startListening: () => void;
  stopListening: () => Promise<void>;
  resetTranscript: () => void;
  getTranscript: () => string;
  getCapturedAudio: () => { base64: string; mimeType: string } | null;
  isSupported: boolean;
}

const RESTART_DELAY_MS = 60;
const STOP_WAIT_TIMEOUT_MS = 700;

const appendTranscriptPart = (existing: string, incoming: string) => {
  const next = incoming.trim();
  if (!next) return existing;
  if (!existing) return next;

  const hasTrailingSpace = /\s$/.test(existing);
  const startsWithPunctuation = /^[,.;!?]/.test(next);
  return `${existing}${hasTrailingSpace || startsWithPunctuation ? '' : ' '}${next}`;
};

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const recognitionRef = useRef<any>(null);
  const shouldListenRef = useRef(false);
  const manuallyStoppingRef = useRef(false);
  const finalTranscriptRef = useRef('');
  const transcriptRef = useRef('');
  const restartTimeoutRef = useRef<number | null>(null);
  const stopResolversRef = useRef<Array<() => void>>([]);
  const hasMicPermissionRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioFrameRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const capturedAudioRef = useRef<{ base64: string; mimeType: string } | null>(null);

  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const clearRestartTimeout = () => {
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  };

  const blobToBase64 = useCallback((blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') {
          reject(new Error('Failed to read recorded audio'));
          return;
        }
        const comma = reader.result.indexOf(',');
        resolve(comma >= 0 ? reader.result.slice(comma + 1) : reader.result);
      };
      reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
      reader.readAsDataURL(blob);
    });
  }, []);

  const stopAudioRecorder = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      return;
    }

    await new Promise<void>((resolve) => {
      recorder.addEventListener('stop', () => {
        void (async () => {
          try {
            const mimeType = recorder.mimeType || 'audio/webm';
            const blob = new Blob(recordedChunksRef.current, { type: mimeType });
            if (blob.size > 0) {
              const base64 = await blobToBase64(blob);
              capturedAudioRef.current = { base64, mimeType };
            }
          } catch (error) {
            console.error('Audio recorder processing error:', error);
          } finally {
            recordedChunksRef.current = [];
            mediaRecorderRef.current = null;
            resolve();
          }
        })();
      }, { once: true });

      try {
        recorder.stop();
      } catch {
        mediaRecorderRef.current = null;
        resolve();
      }
    });
  }, [blobToBase64]);

  const startAudioRecorder = useCallback((stream: MediaStream) => {
    if (mediaRecorderRef.current) return;
    if (typeof MediaRecorder === 'undefined') return;

    const preferredTypes = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
    ];
    const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));

    try {
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (error) {
      console.error('Audio recorder start error:', error);
    }
  }, []);

  const setTranscriptValue = (value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
  };

  const resolvePendingStops = () => {
    if (stopResolversRef.current.length === 0) return;
    const resolvers = stopResolversRef.current;
    stopResolversRef.current = [];
    resolvers.forEach(resolve => resolve());
  };

  const stopAudioMeter = useCallback(async () => {
    if (audioFrameRef.current !== null) {
      window.cancelAnimationFrame(audioFrameRef.current);
      audioFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        // Ignore close races while navigating/unmounting.
      }
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  const buildAudioConstraints = useCallback((): MediaTrackConstraints => ({
    // Raw profile: avoids browser suppression removing synthetic/speaker voices.
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
    sampleRate: 48000,
  }), []);

  const startAudioMeter = useCallback(async (providedStream?: MediaStream) => {
    if (mediaStreamRef.current) return;
    if (!providedStream && !navigator.mediaDevices?.getUserMedia) return;

    try {
      const stream = providedStream ?? await navigator.mediaDevices.getUserMedia({
        audio: buildAudioConstraints(),
      });
      hasMicPermissionRef.current = true;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      const audioContext = new AudioContextClass();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      startAudioRecorder(stream);

      const buffer = new Uint8Array(analyser.fftSize);
      const tick = () => {
        if (!shouldListenRef.current || !analyserRef.current) {
          setAudioLevel(0);
          return;
        }

        analyserRef.current.getByteTimeDomainData(buffer);
        let sumSquares = 0;
        for (let i = 0; i < buffer.length; i++) {
          const normalizedSample = (buffer[i] - 128) / 128;
          sumSquares += normalizedSample * normalizedSample;
        }
        const rms = Math.sqrt(sumSquares / buffer.length);
        const boosted = Math.max(0, Math.min(1, (rms - 0.005) * 14));
        setAudioLevel(prev => prev * 0.45 + boosted * 0.55);

        audioFrameRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch (error) {
      console.error('Microphone meter error:', error);
      setAudioLevel(0);
    }
  }, [buildAudioConstraints, startAudioRecorder]);

  useEffect(() => {
    if (!isSupported) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 3;

    const scheduleRestart = () => {
      clearRestartTimeout();
      restartTimeoutRef.current = window.setTimeout(() => {
        if (!shouldListenRef.current || manuallyStoppingRef.current) return;
        try {
          recognition.start();
        } catch {
          // Browser can throw if restart races with internal state; next cycle retries.
        }
      }, RESTART_DELAY_MS);
    };

    recognition.onresult = (event: any) => {
      let finalPart = finalTranscriptRef.current;
      let interimPart = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          finalPart = appendTranscriptPart(finalPart, text);
        } else {
          interimPart = appendTranscriptPart(interimPart, text);
        }
      }

      finalTranscriptRef.current = finalPart;
      setTranscriptValue(appendTranscriptPart(finalPart, interimPart));
    };

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onend = () => {
      setIsListening(false);
      resolvePendingStops();

      if (shouldListenRef.current && !manuallyStoppingRef.current) {
        scheduleRestart();
      }

      manuallyStoppingRef.current = false;
    };

    recognition.onerror = (event: any) => {
      const error = event.error;

      if (error === 'aborted' && manuallyStoppingRef.current) {
        resolvePendingStops();
        return;
      }
      if (error === 'no-speech') {
        if (shouldListenRef.current && !manuallyStoppingRef.current) {
          scheduleRestart();
        }
        return;
      }
      if (error === 'not-allowed' || error === 'service-not-allowed' || error === 'audio-capture') {
        shouldListenRef.current = false;
        hasMicPermissionRef.current = false;
      }

      setIsListening(false);
      console.error('Speech recognition error:', error);
    };

    recognitionRef.current = recognition;

    return () => {
      shouldListenRef.current = false;
      manuallyStoppingRef.current = true;
      clearRestartTimeout();
      resolvePendingStops();
      void stopAudioRecorder();
      void stopAudioMeter();
      try {
        recognition.abort();
      } catch {
        // Ignore teardown races during unmount.
      }
    };
  }, [isSupported, stopAudioMeter, stopAudioRecorder]);

  const requestMicrophonePermission = useCallback(async (): Promise<MediaStream | null | undefined> => {
    if (!navigator.mediaDevices?.getUserMedia) return undefined;
    if (hasMicPermissionRef.current) return undefined;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: buildAudioConstraints() });
      hasMicPermissionRef.current = true;
      return stream;
    } catch (error) {
      console.error('Microphone permission error:', error);
      return null;
    }
  }, [buildAudioConstraints]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || shouldListenRef.current) return;

    void (async () => {
      const permissionStream = await requestMicrophonePermission();
      if (permissionStream === null) return;

      clearRestartTimeout();
      shouldListenRef.current = true;
      manuallyStoppingRef.current = false;
      setTranscriptValue('');
      finalTranscriptRef.current = '';
      capturedAudioRef.current = null;
      recordedChunksRef.current = [];
      await stopAudioMeter();

      try {
        recognitionRef.current.start();
        if (permissionStream) {
          void startAudioMeter(permissionStream);
        } else {
          void startAudioMeter();
        }
      } catch (error: any) {
        if (permissionStream) {
          permissionStream.getTracks().forEach(track => track.stop());
        }
        // Ignore duplicate starts; the active session keeps running.
        if (error?.name === 'InvalidStateError') {
          window.setTimeout(() => {
            if (!shouldListenRef.current) return;
            try {
              recognitionRef.current?.start();
            } catch {
              // Retry only once from this path.
            }
          }, 150);
        } else {
          shouldListenRef.current = false;
          console.error('Failed to start speech recognition:', error);
        }
      }
    })();
  }, [requestMicrophonePermission, startAudioMeter, stopAudioMeter]);

  const stopListening = useCallback(async () => {
    if (!recognitionRef.current) return;

    shouldListenRef.current = false;
    manuallyStoppingRef.current = true;
    clearRestartTimeout();
    const recorderStopTask = stopAudioRecorder();

    const waitForStop = new Promise<void>((resolve) => {
      let settled = false;
      const wrappedResolve = () => {
        if (settled) return;
        settled = true;
        stopResolversRef.current = stopResolversRef.current.filter(fn => fn !== wrappedResolve);
        resolve();
      };

      stopResolversRef.current.push(wrappedResolve);
      window.setTimeout(wrappedResolve, STOP_WAIT_TIMEOUT_MS);
    });

    try {
      recognitionRef.current.stop();
    } catch {
      resolvePendingStops();
    }
    setIsListening(false);
    await waitForStop;
    await recorderStopTask;
    await stopAudioMeter();
  }, [stopAudioMeter, stopAudioRecorder]);

  const resetTranscript = useCallback(() => {
    setTranscriptValue('');
    finalTranscriptRef.current = '';
  }, []);

  const getTranscript = useCallback(() => transcriptRef.current, []);
  const getCapturedAudio = useCallback(() => capturedAudioRef.current, []);

  return {
    transcript,
    isListening,
    audioLevel,
    startListening,
    stopListening,
    resetTranscript,
    getTranscript,
    getCapturedAudio,
    isSupported,
  };
}
