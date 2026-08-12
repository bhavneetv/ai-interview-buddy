import { useCallback, useEffect, useState } from 'react';

export interface AppSettings {
  cameraEnabled: boolean;
  faceAttendance: boolean;
  nervousnessAlerts: boolean;
  mirrorCamera: boolean;
  voiceEnabled: boolean;
  autoStartMic: boolean;
  answerSeconds: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  cameraEnabled: true,
  faceAttendance: true,
  nervousnessAlerts: true,
  mirrorCamera: true,
  voiceEnabled: true,
  autoStartMic: true,
  answerSeconds: 60,
};

const KEY = 'ai-interview-settings';
const EVENT = 'ai-interview-settings-change';

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(next: AppSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  useEffect(() => {
    const sync = () => setSettings(loadSettings());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
  }, []);

  return { settings, update, reset };
}
