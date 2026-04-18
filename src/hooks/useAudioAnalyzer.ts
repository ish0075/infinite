import { useRef, useCallback, useState, useEffect } from 'react';
import type { AudioData } from '../types/audio';

const FFT_SIZE = 512; // 256 frequency bins — good balance of detail vs performance
const SMOOTHING_FACTOR = 0.35; // Responsive but not jittery (~220ms settle time)

// ─── Frequency Bin Boundaries (for 44.1kHz sample rate, FFT_SIZE=512) ───
// Each bin = sampleRate / FFT_SIZE ≈ 86.13 Hz
const BASS_BINS = { start: 0, end: 6 };      // 0–517Hz (voice fundamental)
const MID_BINS = { start: 6, end: 24 };      // 517–2068Hz (speech clarity)
const TREBLE_BINS = { start: 24, end: 128 }; // 2068–11025Hz (presence)

export function useAudioAnalyzer() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);

  // Smoothed values (persist between frames)
  const smoothBassRef = useRef(0);
  const smoothMidRef = useRef(0);
  const smoothTrebleRef = useRef(0);
  const smoothVolumeRef = useRef(0);

  const [isActive, setIsActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioDataRef = useRef<AudioData>({
    frequency: new Uint8Array(FFT_SIZE / 2),
    timeDomain: new Uint8Array(FFT_SIZE / 2),
    bass: 0,
    mid: 0,
    treble: 0,
    volume: 0,
    isActive: false,
  });

  // ─── Compute energy in a bin range (0-1 normalized) ───
  const computeEnergy = useCallback((data: Uint8Array, start: number, end: number): number => {
    let sum = 0;
    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(data.length, end);
    for (let i = clampedStart; i < clampedEnd; i++) {
      sum += data[i];
    }
    const avg = sum / (clampedEnd - clampedStart);
    return avg / 255; // Normalize 0-1
  }, []);

  // ─── Apply exponential smoothing ───
  const smooth = useCallback((current: number, target: number): number => {
    return current + (target - current) * SMOOTHING_FACTOR;
  }, []);

  // ─── The analysis loop (runs outside React) ───
  const analyze = useCallback(() => {
    if (!analyserRef.current) return;

    const freqData = audioDataRef.current.frequency;
    const timeData = audioDataRef.current.timeDomain;

    analyserRef.current.getByteFrequencyData(freqData as any);
    analyserRef.current.getByteTimeDomainData(timeData as any);

    // Compute raw energy per band
    const rawBass = computeEnergy(freqData, BASS_BINS.start, BASS_BINS.end);
    const rawMid = computeEnergy(freqData, MID_BINS.start, MID_BINS.end);
    const rawTreble = computeEnergy(freqData, TREBLE_BINS.start, TREBLE_BINS.end);
    const rawVolume = computeEnergy(freqData, 0, freqData.length);

    // Smooth for organic movement
    smoothBassRef.current = smooth(smoothBassRef.current, rawBass);
    smoothMidRef.current = smooth(smoothMidRef.current, rawMid);
    smoothTrebleRef.current = smooth(smoothTrebleRef.current, rawTreble);
    smoothVolumeRef.current = smooth(smoothVolumeRef.current, rawVolume);

    // Update the ref (VoiceOrb reads this directly in useFrame)
    audioDataRef.current.bass = smoothBassRef.current;
    audioDataRef.current.mid = smoothMidRef.current;
    audioDataRef.current.treble = smoothTrebleRef.current;
    audioDataRef.current.volume = smoothVolumeRef.current;
    audioDataRef.current.isActive = true;

    rafRef.current = requestAnimationFrame(analyze);
  }, [computeEnergy, smooth]);

  // ─── Start: Capture microphone ───
  const start = useCallback(async () => {
    if (isActive) return;
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // CRITICAL: Explicit resume required after user gesture
      // getUserMedia async may break the gesture chain on some browsers
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.4; // Hardware smoothing
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      // Resize arrays to match bin count
      const binCount = analyser.frequencyBinCount;
      audioDataRef.current.frequency = new Uint8Array(binCount);
      audioDataRef.current.timeDomain = new Uint8Array(binCount);

      // Verify the context actually started
      if (ctx.state !== 'running') {
        throw new Error(`AudioContext failed to start: ${ctx.state}`);
      }

      setIsActive(true);
      rafRef.current = requestAnimationFrame(analyze);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error accessing microphone';
      setError(msg);
      console.error('[AudioAnalyzer]', msg);
    }
  }, [isActive, analyze]);

  // ─── Stop: Release all resources ───
  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }

    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch {}
      sourceRef.current = null;
    }

    if (analyserRef.current) {
      try { analyserRef.current.disconnect(); } catch {}
      analyserRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch {}
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Reset smoothed values
    smoothBassRef.current = 0;
    smoothMidRef.current = 0;
    smoothTrebleRef.current = 0;
    smoothVolumeRef.current = 0;

    audioDataRef.current.isActive = false;
    audioDataRef.current.bass = 0;
    audioDataRef.current.mid = 0;
    audioDataRef.current.treble = 0;
    audioDataRef.current.volume = 0;

    setIsActive(false);
  }, []);

  // ─── Cleanup on unmount ───
  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    audioDataRef,
    isActive,
    error,
    start,
    stop,
  };
}
