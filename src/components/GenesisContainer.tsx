import { useRef, useEffect, useState, ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollState {
  progress: number;
  velocity: number;
}

interface GenesisContainerProps {
  children: (scrollState: React.MutableRefObject<ScrollState>) => ReactNode;
}

export default function GenesisContainer({ children }: GenesisContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollState = useRef<ScrollState>({ progress: 0, velocity: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.8,
        onUpdate: (self) => {
          scrollState.current.progress = self.progress;
          scrollState.current.velocity = self.getVelocity() / 1000;
        },
      });
    });

    return () => {
      ctx.revert();
    };
  }, []);

  return (
    <>
      {/* Fixed 3D Canvas Layer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 1,
        }}
      >
        {mounted && children(scrollState)}
      </div>

      {/* Scroll Driver: 600vh for long, deliberate scroll journey */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          zIndex: 2,
          height: '600vh',
          pointerEvents: 'none',
        }}
      >
        {/* Act Markers — invisible, semantic */}
        <div data-act="I" style={{ position: 'absolute', top: '0vh' }} />
        <div data-act="II" style={{ position: 'absolute', top: '33vh' }} />
        <div data-act="III" style={{ position: 'absolute', top: '66vh' }} />

        {/* Minimal UI overlay — optional narrative markers */}
        <ActIndicator progressRef={scrollState} />
      </div>
    </>
  );
}

function ActIndicator({ progressRef }: { progressRef: React.MutableRefObject<ScrollState> }) {
  const [label, setLabel] = useState('ACT I — THE VOID');
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    let raf: number;
    const update = () => {
      const p = progressRef.current.progress;
      let next = labelRef.current;
      if (p < 0.35) next = 'ACT I — THE VOID';
      else if (p < 0.60) next = 'ACT II — THE BIG BANG';
      else next = 'ACT III — SINGULARITY';
      if (next !== labelRef.current) setLabel(next);
      raf = requestAnimationFrame(update);
    };
    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [progressRef]);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '2rem',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'monospace',
        fontSize: '11px',
        letterSpacing: '0.3em',
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        pointerEvents: 'none',
        zIndex: 10,
        transition: 'opacity 0.5s ease',
      }}
    >
      {label}
    </div>
  );
}
