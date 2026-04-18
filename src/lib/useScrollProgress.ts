import { useRef, useEffect } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollState {
  progress: number;
  velocity: number;
}

export function useScrollProgress() {
  const stateRef = useRef<ScrollState>({ progress: 0, velocity: 0 });

  useEffect(() => {
    const st = ScrollTrigger.create({
      trigger: document.body,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0.5,
      onUpdate: (self) => {
        stateRef.current.progress = self.progress;
        stateRef.current.velocity = self.getVelocity?.() || 0;
      },
    });

    return () => {
      st.kill();
    };
  }, []);

  return stateRef;
}
