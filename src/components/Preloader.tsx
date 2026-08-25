import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import Logo from './Logo';

interface PreloaderProps {
  onComplete: () => void;
}

/**
 * Full-screen preloader.
 *
 * The DocuTalk logomark sits on a progress track and physically rolls along it
 * as the bar fills over ~2.2 s, then the whole screen fades out.
 *
 * Animation choreography:
 *   0.00 s  — logo draws itself in (GSAP stroke-dashoffset, ~0.75 s)
 *   0.55 s  — "DocuTalk AI" wordmark fades up
 *   0.70 s  — progress track appears
 *   0.80 s  — progress bar starts filling AND logo starts rolling along it
 *   2.20 s  — bar reaches 100 %, logo is at the right end
 *   2.30 s  — brief pause
 *   2.40 s  — full screen fades to ink-950, onComplete fires
 */
export default function Preloader({ onComplete }: PreloaderProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const trackRef       = useRef<HTMLDivElement>(null);
  const barRef         = useRef<HTMLDivElement>(null);
  const logoWrapRef    = useRef<HTMLDivElement>(null);
  const wordmarkRef    = useRef<HTMLDivElement>(null);
  const trackWrapRef   = useRef<HTMLDivElement>(null);

  // Has the Logo's own draw-in animation finished?
  const [logoReady, setLogoReady] = useState(false);

  // Kick off the progress / roll sequence once logo draw-in is done
  useEffect(() => {
    if (!logoReady) return;

    const prefersReduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const bar      = barRef.current;
    const logoWrap = logoWrapRef.current;
    const track    = trackRef.current;
    const wordmark = wordmarkRef.current;
    const trackWrap = trackWrapRef.current;
    const container = containerRef.current;

    if (!bar || !logoWrap || !track || !wordmark || !trackWrap || !container) return;

    if (prefersReduced) {
      // Skip straight through
      setTimeout(() => {
        gsap.to(container, { opacity: 0, duration: 0, onComplete });
      }, 100);
      return;
    }

    const trackWidth = track.offsetWidth;
    // Logo mark is 36px wide — the logo wrapper is 36px.
    // It starts at the left edge of the track (x = 0) and rolls to the right
    // edge minus its own width.
    const rollDistance = trackWidth - 36;

    const tl = gsap.timeline();

    // 1. Wordmark slides up
    tl.to(wordmark, {
      opacity: 1,
      y: 0,
      duration: 0.35,
      ease: 'power2.out',
    });

    // 2. Track wrapper fades in
    tl.to(trackWrap, {
      opacity: 1,
      duration: 0.25,
      ease: 'power2.out',
    }, '-=0.1');

    // 3. Bar fills + logo rolls simultaneously
    tl.to(bar, {
      width: '100%',
      duration: 1.5,
      ease: 'power1.inOut',
    });

    tl.to(logoWrap, {
      x: rollDistance,
      duration: 1.5,
      ease: 'power1.inOut',
      // Rotation: one full 360° per ~(trackWidth / circumference) px of travel.
      // Logo is treated as a ~36px-diameter circle → circumference ≈ 113 px.
      // Over rollDistance px: rotations = rollDistance / 113 * 360
      rotation: (rollDistance / 113) * 360,
      transformOrigin: 'center center',
    }, '<');

    // 4. Slight pause at 100%
    tl.to({}, { duration: 0.2 });

    // 5. Flash the bar to ember-500 full brightness briefly
    tl.to(bar, { backgroundColor: '#FF6A3D', duration: 0.12, ease: 'none' });
    tl.to(bar, { backgroundColor: '#E8501E', duration: 0.08, ease: 'none' });

    // 6. Fade out the whole screen
    tl.to(container, {
      opacity: 0,
      duration: 0.35,
      ease: 'power2.inOut',
      onComplete,
    });

    return () => { tl.kill(); };
  }, [logoReady, onComplete]);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-ink-950"
      aria-live="polite"
      aria-label="Loading DocuTalk AI"
    >
      {/* ── Centre stack ───────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-8 w-full max-w-xs px-6">

        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-4">
          {/* The animated logo mark */}
          <Logo
            size={56}
            animated
            onComplete={() => setLogoReady(true)}
          />

          {/* Wordmark — hidden until logo finishes, then slides up */}
          <div
            ref={wordmarkRef}
            className="opacity-0 translate-y-3 text-center"
            style={{ transform: 'translateY(12px)' }}
          >
            <span className="font-display text-2xl font-semibold tracking-tight text-parchment">
              DocuTalk
            </span>
            <span className="font-display text-2xl font-semibold tracking-tight text-ember-500 ml-1.5">
              AI
            </span>
            <p className="font-mono text-xs text-ash mt-1 tracking-widest uppercase">
              Initialising workspace
            </p>
          </div>
        </div>

        {/* Progress track + rolling logo */}
        <div
          ref={trackWrapRef}
          className="opacity-0 w-full"
        >
          {/* Logo roller — positioned above the track left edge */}
          <div className="relative h-9 mb-1">
            <div
              ref={logoWrapRef}
              className="absolute top-0 left-0 will-change-transform"
              style={{ width: 36 }}
            >
              {/* Static (non-animated) logo copy for rolling */}
              <Logo size={36} animated={false} />
            </div>
          </div>

          {/* Track */}
          <div
            ref={trackRef}
            className="relative w-full h-1 rounded-full bg-ink-700 overflow-hidden"
          >
            {/* Filling bar */}
            <div
              ref={barRef}
              className="h-full rounded-full bg-ember-600 origin-left"
              style={{ width: '0%', backgroundColor: '#E8501E' }}
            />
            {/* Subtle shimmer overlay */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background:
                  'linear-gradient(90deg, transparent 0%, rgba(255,143,99,0.25) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.6s linear infinite',
              }}
            />
          </div>
        </div>
      </div>

      {/* Bottom tagline */}
      <p className="absolute bottom-10 font-mono text-[11px] text-ash/60 tracking-wider">
        Vectorising your world
      </p>
    </div>
  );
}
