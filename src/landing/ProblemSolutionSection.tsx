import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Database, Search, MessageSquare, ArrowRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const problems = [
  'Your Postgres database has answers buried in rows — no one knows how to query it.',
  'PDFs, reports, and docs pile up. Grepping is slow. Ctrl+F misses context.',
  'Asking your BI team takes days. You need the answer in seconds.',
];

const steps = [
  {
    step: '01',
    icon: Database,
    title: 'Connect a source',
    body: 'Paste your Postgres connection string or upload PDFs, DOCX, and TXT files. DocuTalk ingests both in the same workspace.',
  },
  {
    step: '02',
    icon: Search,
    title: 'Auto-vectorize',
    body: 'Content is chunked, embedded with your chosen model, and stored in Supabase pgvector. No manual indexing — it stays in sync.',
  },
  {
    step: '03',
    icon: MessageSquare,
    title: 'Chat with citations',
    body: 'Ask in plain English. DocuTalk retrieves the exact chunks that answer your question and shows you the source — row, page, table.',
  },
];

export default function ProblemSolutionSection() {
  const sectionRef    = useRef<HTMLElement>(null);
  const pinContRef    = useRef<HTMLDivElement>(null);
  const problemRef    = useRef<HTMLDivElement>(null);
  const solutionRef   = useRef<HTMLDivElement>(null);
  const connectorRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const pinCont  = pinContRef.current;
    if (!section || !pinCont) return;

    const prefersReduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      // No pinning — just show everything static
      gsap.set([problemRef.current, connectorRef.current, solutionRef.current], {
        opacity: 1, y: 0,
      });
      return;
    }

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      // Mobile: simple fade-ins, no pinning
      const items = [problemRef.current, connectorRef.current, solutionRef.current];
      items.forEach((el) => {
        if (!el) return;
        gsap.fromTo(el,
          { opacity: 0, y: 30 },
          {
            opacity: 1, y: 0,
            duration: 0.6,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: el,
              start: 'top 80%',
              toggleActions: 'play none none none',
            },
          }
        );
      });
      return;
    }

    // Desktop: pinned scrub
    gsap.set([connectorRef.current, solutionRef.current], { opacity: 0, y: 40 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: pinCont,
        start: 'top top',
        end: '+=200%',
        pin: true,
        scrub: 1,
        anticipatePin: 1,
      },
    });

    // Problem panel is already visible at start
    // 0–33%: hold on problem
    tl.to({}, { duration: 1 });

    // 33–66%: connector / transition fades in
    tl.to(connectorRef.current, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: 'power2.out',
    });

    // Also fade out problem text as solution comes in
    tl.to(problemRef.current, {
      opacity: 0,
      y: -30,
      duration: 0.8,
      ease: 'power2.in',
    }, '<');

    // 66–100%: solution panel slides in
    tl.to(solutionRef.current, {
      opacity: 1,
      y: 0,
      duration: 1.5,
      ease: 'power2.out',
    }, '-=0.5');

    tl.to(connectorRef.current, {
      opacity: 0,
      duration: 0.5,
    }, '<');

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section ref={sectionRef} id="problem-solution" className="relative z-0 bg-ink-950">
      {/* Graph-paper grid backdrop */}
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      <div ref={pinContRef} className="relative min-h-screen flex items-center justify-center px-6 py-24 overflow-hidden">

        {/* Background noise texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'200\' height=\'200\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
          }}
        />

        {/* ── Problem panel ─────────────────────────────────────────── */}
        <div
          ref={problemRef}
          className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        >
          <p className="font-mono text-xs text-ember-500 tracking-[0.2em] uppercase mb-6">
            The problem
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-parchment max-w-2xl leading-tight mb-10">
            Your data can't speak for itself. Yet.
          </h2>
          <div className="flex flex-col gap-4 max-w-lg w-full">
            {problems.map((p, i) => (
              <div
                key={i}
                className="flex items-start gap-4 p-4 rounded-xl bg-ink-800 border border-ink-700 text-left"
              >
                <span className="font-mono text-xs text-ember-500 mt-0.5 shrink-0 w-5">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="font-sans text-sm text-parchment-300 leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Connector / transition visual ────────────────────────── */}
        <div
          ref={connectorRef}
          className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
        >
          <div className="flex flex-col items-center gap-5">
            <div className="w-px h-16 bg-gradient-to-b from-transparent via-ember-500 to-transparent" />
            <div className="w-14 h-14 rounded-full bg-ember-500/10 border border-ember-500/40 flex items-center justify-center glow-ember">
              <ArrowRight className="w-6 h-6 text-ember-400 rotate-90" />
            </div>
            <div className="w-px h-16 bg-gradient-to-b from-ember-500 via-ember-500/20 to-transparent" />
            <p className="font-mono text-sm text-ember-400">Introducing DocuTalk AI</p>
          </div>
        </div>

        {/* ── Solution panel ────────────────────────────────────────── */}
        <div
          ref={solutionRef}
          className="absolute inset-0 flex flex-col items-center justify-center px-6"
        >
          <p className="font-mono text-xs text-ember-500 tracking-[0.2em] uppercase mb-6 text-center">
            The solution
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-parchment max-w-2xl leading-tight mb-10 text-center">
            Three steps from raw data to answers.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-3xl w-full">
            {steps.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.step}
                  className="relative p-5 rounded-2xl bg-ink-800 border-t-2 border-t-ember-500 border border-ink-700 group"
                >
                  <span className="font-mono text-[10px] text-ash mb-3 block">{s.step}</span>
                  <Icon className="w-6 h-6 text-ember-400 mb-3" />
                  <h3 className="font-sans font-medium text-parchment text-base mb-2">{s.title}</h3>
                  <p className="font-sans text-sm text-ash leading-relaxed">{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
