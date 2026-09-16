import { useCallback, useEffect, useRef, useState } from 'react';

/** Safari/iOS only produces audio/mp4; Chrome and Android prefer webm/opus. */
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

export interface VoiceRecording {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

export interface UseVoiceRecorder {
  recording: boolean;
  seconds: number;
  error: string | null;
  start: () => Promise<void>;
  /** Stops and returns the clip, or null if nothing usable was captured. */
  stop: () => Promise<VoiceRecording | null>;
  /** Stops and discards — also releases the mic. */
  cancel: () => void;
}

/**
 * Turns a getUserMedia rejection into something a student can act on.
 * "Denied" and "there is no microphone" need different responses, and on iOS
 * a locked-down PWA reports a third thing again.
 */
function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access is blocked. Allow it for this site in your browser settings, then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is already in use by another app.';
  }
  if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
    return 'Voice messages need a secure (https) connection.';
  }
  return 'Could not start recording. Please try again.';
}

export function useVoiceRecorder(): UseVoiceRecorder {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const startedAt = useRef(0);
  const cancelledRef = useRef(false);

  const teardown = useCallback(() => {
    clearInterval(timerRef.current);
    // Releases the mic indicator — important on mobile.
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => () => teardown(), [teardown]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };

      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAt.current = Date.now();
      setSeconds(0);
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(
        () => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)),
        250,
      );
    } catch (e) {
      setError(micErrorMessage(e));
      teardown();
    }
  }, [teardown]);

  const stop = useCallback(async (): Promise<VoiceRecording | null> => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      teardown();
      return null;
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const mimeType = recorder.mimeType || 'audio/webm';

    const blob = await new Promise<Blob | null>(resolve => {
      recorder.onstop = () => {
        if (cancelledRef.current || chunksRef.current.length === 0) return resolve(null);
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.stop();
    });

    teardown();
    return blob ? { blob, mimeType, durationSeconds } : null;
  }, [teardown]);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    chunksRef.current = [];
    setSeconds(0);
    teardown();
  }, [teardown]);

  return { recording, seconds, error, start, stop, cancel };
}
