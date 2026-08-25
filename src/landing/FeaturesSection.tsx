import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Database, RefreshCw, MessageSquare, Shield, Zap, GitBranch } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const features = [
  {
    eyebrow: '01 / Connect',
    icon: Database,
    title: 'Any source, one workspace',
    body: 'Paste a Postgres connection string and DocuTalk inspects your schema — tables, columns, foreign keys — automatically. Or drag in a PDF, DOCX, or TXT. Both live in the same indexed workspace.',
    tags: ['Postgres', 'PDF', 'DOCX', 'TXT'],
  },
  {
    eyebrow: '02 / Vectorize',
    icon: RefreshCw,
    title: 'Auto-sync & embed',
    body: 'Content is chunked with context-aware splitting, embedded through your configured model, and written to Supabase pgvector. New rows, new pages — the index stays current without manual re-runs.',
    tags: ['pgvector', 'dim 1536', 'Auto-sync'],
  },
  {
    eyebrow: '03 / Chat',
    icon: MessageSquare,
    title: 'Cited answers, not guesses',
    body: 'Every response shows the exact source chunks it drew from — the Postgres table and row range, or the PDF page number. If DocuTalk doesn\'t know, it says so instead of fabricating.',
    tags: ['Citations', 'No hallucinations', 'Source-grounded'],
  },
  {
    eyebrow: '04 / Projects',
    icon: GitBranch,
    title: 'Scoped RAG projects',
    body: 'Organise sources into projects so your sales team only queries the CRM database while your ops team works with logistics docs. Permissions and context stay separated.',
    tags: ['Projects', 'Scoped context'],
  },
  {
    eyebrow: '05 / Speed',
    icon: Zap,
    title: 'Sub-second retrieval',
    body: 'Approximate nearest-neighbour search on pgvector returns relevant chunks in milliseconds, regardless of whether your Postgres has 100 rows or 10 million.',
    tags: ['ANN search', 'pgvector index'],
  },
  {
    eyebrow: '06 / Security',
    icon: Shield,
    title: 'Your data stays yours',
    body: 'Credentials never leave your Supabase project. DocuTalk operates on vector embeddings, not raw data dumps. Row-level security on your source database is always honoured.',
    tags: ['RLS', 'Supabase', 'Encrypted'],
  },
];

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const cardsRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const cards   = cardsRef.current;
    if (!section || !cards) return;

    const prefersReduced =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const cardEls = Array.from(cards.querySelectorAll<HTMLElement>('[data-card]'));
    if (prefersReduced) {
      gsap.set(cardEls, { opacity: 1, y: 0 });
      return;
    }

    gsap.set(cardEls, { opacity: 0, y: 40 });

    ScrollTrigger.batch(cardEls, {
      start: 'top 85%',
      onEnter: (batch) => {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.55,
          ease: 'power2.out',
          stagger: 0.1,
        });
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="features"
      className="relative z-0 bg-ink-950 px-6 py-28"
    >
      {/* Graph-paper grid backdrop */}
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {/* Section header */}
      <div className="max-w-4xl mx-auto text-center mb-16">
        <p className="font-mono text-xs text-ember-500 tracking-[0.2em] uppercase mb-4">
          What DocuTalk does
        </p>
        <h2 className="font-display text-4xl sm:text-5xl font-semibold text-parchment leading-tight">
          Built for data that doesn't answer emails.
        </h2>
        <p className="font-sans text-base text-ash mt-4 max-w-xl mx-auto">
          Every feature is a direct response to how RAG actually breaks in production — not a checklist of buzzwords.
        </p>
      </div>

      {/* Card grid */}
      <div
        ref={cardsRef}
        className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {features.map((f, i) => {
          const Icon = f.icon;
          return (
            <div
              key={i}
              data-card
              className="group relative flex flex-col p-6 rounded-2xl bg-ink-800 border border-ink-700 hover:border-ink-600 transition-colors duration-300 overflow-hidden"
            >
              {/* Top ember bar */}
              <div className="absolute top-0 left-6 right-6 h-px bg-ember-500/40 group-hover:bg-ember-500/70 transition-colors duration-300" />

              <p className="font-mono text-[10px] text-ash uppercase tracking-widest mb-4">
                {f.eyebrow}
              </p>

              <Icon className="w-6 h-6 text-ember-400 mb-4" />

              <h3 className="font-sans font-medium text-parchment text-lg mb-2 leading-snug">
                {f.title}
              </h3>

              <p className="font-sans text-sm text-ash leading-relaxed flex-1">
                {f.body}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-5">
                {f.tags.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[10px] text-ash bg-ink-900 border border-ink-700 px-2 py-0.5 rounded-full"
                  >
                    {t}
                  </span>
                ))}
              </div>

              {/* Hover ember glow */}
              <div className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                style={{
                  background: 'radial-gradient(ellipse at 50% 0%, rgba(255,106,61,0.05) 0%, transparent 60%)',
                }}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
