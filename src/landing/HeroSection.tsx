import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ArrowRight, Database, FileText } from 'lucide-react';
import Logo from '../components/Logo';

interface HeroSectionProps {
  onGetStarted: () => void;
}

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  const sectionRef  = useRef<HTMLElement>(null);
  const eyebrowRef  = useRef<HTMLParagraphElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadRef  = useRef<HTMLParagraphElement>(null);
  const ctasRef     = useRef<HTMLDivElement>(null);
  const visualRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;

    const prefersReduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Initial hidden state for all non-logo elements
    const targets = [
      eyebrowRef.current,
      headlineRef.current,
      subheadRef.current,
      ctasRef.current,
      visualRef.current,
    ].filter(Boolean);

    if (prefersReduced) {
      gsap.set(targets, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(targets, { opacity: 0, y: 24 });

    // Entrance timeline — triggered after Preloader fires onComplete
    // (LandingPage passes `preloaderDone` prop so we start after it)
    const tl = gsap.timeline({ delay: 0.1 });

    tl.to(eyebrowRef.current, {
      opacity: 1, y: 0,
      duration: 0.4,
      ease: 'power2.out',
    });

    tl.to(headlineRef.current, {
      opacity: 1, y: 0,
      duration: 0.55,
      ease: 'power2.out',
    }, '-=0.15');

    tl.to(subheadRef.current, {
      opacity: 1, y: 0,
      duration: 0.4,
      ease: 'power2.out',
    }, '-=0.2');

    tl.to(ctasRef.current, {
      opacity: 1, y: 0,
      duration: 0.35,
      ease: 'power2.out',
    }, '-=0.15');

    tl.to(visualRef.current, {
      opacity: 1, y: 0,
      duration: 0.55,
      ease: 'power2.out',
    }, '-=0.25');

    return () => { tl.kill(); };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-28 pb-20 overflow-hidden"
    >
      {/* Background graph-paper grid */}
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0" />
      {/* Ember radial spotlight behind the badge (logo + eyebrow) */}
      <div
        className="pointer-events-none absolute top-[10%] left-1/2 -translate-x-1/2 w-[900px] h-[520px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,106,61,0.18) 0%, transparent 60%)',
        }}
      />

      {/* ── Copy stack ─────────────────────────────────────────────── */}
      <div className="relative z-10 max-w-3xl w-full flex flex-col items-center text-center gap-6">

        {/* Logo mark — animated draw-in */}
        <Logo size={52} animated className="mb-2" />

        {/* Eyebrow */}
        <p
          ref={eyebrowRef}
          className="font-mono text-xs text-ash tracking-[0.2em] uppercase"
        >
          // RAG &bull; Postgres &bull; Documents &bull; Supabase pgvector
        </p>

        {/* Headline */}
        <h1
          ref={headlineRef}
          className="font-display text-5xl sm:text-6xl md:text-7xl font-semibold leading-[1.05] text-parchment"
        >
          Your data,{' '}
          <span className="text-gradient-ember">fluent</span>
          {' '}at last.
        </h1>

        {/* Subhead */}
        <p
          ref={subheadRef}
          className="font-sans text-lg text-ash max-w-xl leading-relaxed"
        >
          Connect a Postgres database or upload documents. DocuTalk vectorizes
          your content and lets you have an exact, cited conversation with it —
          no hallucinations from thin air.
        </p>

        {/* CTAs */}
        <div ref={ctasRef} className="flex flex-wrap items-center justify-center gap-4 mt-2">
          <button
            id="hero-cta-primary"
            onClick={onGetStarted}
            className="group inline-flex items-center gap-2 bg-ember-500 hover:bg-ember-600 text-ink-950 font-sans font-medium text-sm px-7 py-3.5 rounded-lg transition-colors duration-200 focus-ember"
          >
            Start for free
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
          <a
            href="#demo"
            id="hero-cta-secondary"
            className="inline-flex items-center gap-2 border border-ink-700 hover:border-parchment-300/30 text-parchment-300 hover:text-parchment font-sans font-medium text-sm px-7 py-3.5 rounded-lg transition-colors duration-200 focus-ember"
          >
            See it in action
          </a>
        </div>

        {/* Social proof micro-line */}
        <p className="font-mono text-[11px] text-ash/60 tracking-wide">
          No credit card &middot; connects in under 2 minutes
        </p>
      </div>

      {/* ── Hero visual — mocked data panel ──────────────────────── */}
      <div
        ref={visualRef}
        className="relative z-10 mt-16 w-full max-w-4xl"
      >
        <div className="glass-card rounded-2xl overflow-hidden border border-ink-700 glow-ember">
          {/* Top bar */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-ink-700 bg-ink-900/50">
            <span className="w-2.5 h-2.5 rounded-full bg-ink-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-ink-700" />
            <span className="w-2.5 h-2.5 rounded-full bg-ink-700" />
            <span className="ml-4 font-mono text-xs text-ash">DocuTalk AI — workspace</span>
          </div>

          <div className="flex min-h-[340px]">
            {/* Left: data source panel */}
            <div className="hidden sm:flex flex-col w-56 border-r border-ink-700 bg-ink-900/30 p-4 gap-3">
              <p className="font-mono text-[10px] text-ash uppercase tracking-widest mb-1">
                Sources
              </p>

              {/* Postgres source */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-ink-800 border border-ink-700">
                <Database className="w-4 h-4 text-ember-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-parchment truncate">sales_db</p>
                  <p className="font-mono text-[10px] text-ash truncate">Postgres · 14 tables</p>
                </div>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              </div>

              {/* PDF source */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-ink-800 border border-ink-700">
                <FileText className="w-4 h-4 text-ember-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-parchment truncate">Q4_Report.pdf</p>
                  <p className="font-mono text-[10px] text-ash truncate">PDF · 24 pages</p>
                </div>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              </div>

              {/* Stats */}
              <div className="mt-auto pt-3 border-t border-ink-700">
                <p className="font-mono text-[10px] text-ash">
                  <span className="text-ember-400">1,847</span> chunks indexed
                </p>
                <p className="font-mono text-[10px] text-ash mt-0.5">
                  pgvector · dim 1536
                </p>
              </div>
            </div>

            {/* Right: chat panel */}
            <div className="flex-1 flex flex-col p-5 gap-4">
              {/* AI message */}
              <div className="flex gap-3">
                <Logo size={22} animated={false} className="shrink-0 mt-0.5" />
                <div className="bg-ink-800 border border-ink-700 rounded-xl rounded-tl-sm px-4 py-3 max-w-md">
                  <p className="font-sans text-sm text-parchment leading-relaxed">
                    I can see <strong className="text-ember-400">14 tables</strong> in{' '}
                    <code className="font-mono text-xs text-ember-400 bg-ink-700 px-1 py-0.5 rounded">sales_db</code>{' '}
                    and your Q4 report. What would you like to know?
                  </p>
                </div>
              </div>

              {/* User message */}
              <div className="flex gap-3 justify-end">
                <div className="bg-ember-600/20 border border-ember-600/30 rounded-xl rounded-tr-sm px-4 py-3 max-w-sm">
                  <p className="font-sans text-sm text-parchment">
                    What were the top 5 products by revenue in Q4?
                  </p>
                </div>
                <div className="w-6 h-6 rounded-full bg-parchment-300/20 border border-parchment-300/20 shrink-0 mt-0.5 flex items-center justify-center">
                  <span className="font-mono text-[9px] text-ash">U</span>
                </div>
              </div>

              {/* AI response with citations */}
              <div className="flex gap-3">
                <Logo size={22} animated={false} className="shrink-0 mt-0.5" />
                <div className="space-y-2 max-w-md">
                  <div className="bg-ink-800 border border-ink-700 rounded-xl rounded-tl-sm px-4 py-3">
                    <p className="font-sans text-sm text-parchment leading-relaxed">
                      Based on the <code className="font-mono text-xs text-ember-400 bg-ink-700 px-1 py-0.5 rounded">orders</code> table,
                      the top product was <strong className="text-parchment">Apex Pro</strong> at{' '}
                      <strong className="text-ember-400">$2.4M</strong> — consistent with
                      the growth mentioned on page 7 of your Q4 report.
                    </p>
                  </div>
                  {/* Citation chips */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="font-mono text-[10px] text-ash bg-ink-800 border border-ink-700 px-2 py-0.5 rounded-full">
                      sales_db → orders · row 1482
                    </span>
                    <span className="font-mono text-[10px] text-ash bg-ink-800 border border-ink-700 px-2 py-0.5 rounded-full">
                      Q4_Report.pdf · p. 7
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Subtle ember reflection below the card */}
        <div
          className="mx-auto mt-2 w-4/5 h-8 rounded-full pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse, rgba(255,106,61,0.12) 0%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
      </div>
    </section>
  );
}
