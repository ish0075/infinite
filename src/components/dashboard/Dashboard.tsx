import { useEffect } from 'react';
import SystemTelemetry from './SystemTelemetry';
import NeuralInterface from './NeuralInterface';
import KnowledgeHUD from './KnowledgeHUD';
import { useDashboard } from './DashboardContext';
import type { AudioData } from '../../types/audio';

interface DashboardProps {
  audioDataRef: React.RefObject<AudioData | null>;
}

export default function Dashboard({ audioDataRef }: DashboardProps) {
  const { updateAudioAmplitude } = useDashboard();

  // Bridge audio amplitude to system telemetry
  useEffect(() => {
    let raf: number;
    const update = () => {
      const audio = audioDataRef.current;
      if (audio) {
        updateAudioAmplitude(audio.volume);
      }
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [audioDataRef, updateAudioAmplitude]);

  return (
    <>
      <SystemTelemetry />
      <KnowledgeHUD />
      <NeuralInterface audioDataRef={audioDataRef} />
    </>
  );
}
