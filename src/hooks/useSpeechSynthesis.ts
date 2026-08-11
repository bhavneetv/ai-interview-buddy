import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Remembers (per page load) whether the server TTS endpoint is usable.
let serverTtsAvailable: boolean | null = null;

export function useSpeechSynthesis() {
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const playbackTokenRef = useRef(0);
  const unlockedAudioRef = useRef<HTMLAudioElement | null>(null);


  const resolvePreferredVoice = useCallback(() => {
    const voices = window.speechSynthesis.getVoices();
    return voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
      || voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en'))
      || voices.find(v => v.lang.startsWith('en'))
      || null;
  }, []);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;

    preferredVoiceRef.current = resolvePreferredVoice();
    const onVoicesChanged = () => {
      preferredVoiceRef.current = resolvePreferredVoice();
    };

    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
    };
  }, [resolvePreferredVoice]);

  const cleanupAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    playbackTokenRef.current += 1;
    cleanupAudio();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, [cleanupAudio]);

  const speakWithBrowserFallback = useCallback((content: string, onEnd?: () => void) => {
    if (!('speechSynthesis' in window)) {
      onEnd?.();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    if (!preferredVoiceRef.current) {
      preferredVoiceRef.current = resolvePreferredVoice();
    }
    if (preferredVoiceRef.current) {
      utterance.voice = preferredVoiceRef.current;
      utterance.lang = preferredVoiceRef.current.lang;
    } else {
      utterance.lang = 'en-US';
    }

    if (onEnd) {
      let handled = false;
      const done = () => {
        if (handled) return;
        handled = true;
        onEnd();
      };
      utterance.onend = done;
      utterance.onerror = done;
    }

    window.speechSynthesis.speak(utterance);
  }, [resolvePreferredVoice]);

  // Unlock audio playback on the first user interaction (required on mobile).
  useEffect(() => {
    const unlock = () => {
      try {
        if ('speechSynthesis' in window) {
          const warmup = new SpeechSynthesisUtterance(' ');
          warmup.volume = 0;
          window.speechSynthesis.speak(warmup);
          window.speechSynthesis.resume();
        }
        if (!unlockedAudioRef.current) {
          const silent = new Audio(
            'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA//////////////////////////////////////////8AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAAgAAAAnGMHkkIAAAAAAAAAAAAAAAAAAAA',
          );
          silent.volume = 0;
          unlockedAudioRef.current = silent;
          void silent.play().catch(() => undefined);
        }
      } catch {
        /* ignore */
      }
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    const content = text.trim();
    if (!content) {
      onEnd?.();
      return;
    }

    const token = playbackTokenRef.current + 1;
    playbackTokenRef.current = token;
    cleanupAudio();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    // Server voice already known to be unavailable → speak immediately in-browser.
    if (serverTtsAvailable === false) {
      speakWithBrowserFallback(content, onEnd);
      return;
    }

    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-analyze', {
          body: {
            type: 'text_to_speech',
            text: content,
          },
        });

        if (token !== playbackTokenRef.current) return;
        if (error || data?.error || !data?.audioBase64) {
          serverTtsAvailable = false;
          speakWithBrowserFallback(content, onEnd);
          return;
        }
        serverTtsAvailable = true;

        const binary = atob(String(data.audioBase64));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        const mimeType = String(data?.mimeType || 'audio/mpeg');
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;

        const audio = new Audio(url);
        audio.preload = 'auto';
        audioRef.current = audio;
        let finished = false;
        audio.onended = () => {
          if (token !== playbackTokenRef.current || finished) return;
          finished = true;
          cleanupAudio();
          onEnd?.();
        };
        audio.onerror = () => {
          if (token !== playbackTokenRef.current || finished) return;
          finished = true;
          cleanupAudio();
          speakWithBrowserFallback(content, onEnd);
        };

        try {
          await audio.play();
        } catch {
          // Autoplay blocked → speak with the browser voice instead.
          if (token !== playbackTokenRef.current || finished) return;
          finished = true;
          cleanupAudio();
          speakWithBrowserFallback(content, onEnd);
        }
      } catch {
        if (token !== playbackTokenRef.current) return;
        serverTtsAvailable = false;
        cleanupAudio();
        speakWithBrowserFallback(content, onEnd);
      }
    })();
  }, [cleanupAudio, speakWithBrowserFallback]);

  useEffect(() => () => {
    stop();
  }, [stop]);

  return { speak, stop };

}
