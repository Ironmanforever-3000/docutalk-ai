import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, ArrowRight, Zap } from 'lucide-react';

interface Plan {
  id: 'starter' | 'pro' | 'team';
  name: string;
  price: string;
  period: string;
  description: string;
  highlight?: boolean;
  features: string[];
  cta: string;
}

const PLANS: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For individuals exploring RAG on their own data.',
    features: [
      'Up to 3 data sources',
      '50 MB document storage',
      '500 chat queries / month',
      'Supabase pgvector integration',
      'PDF & DOCX upload',
      'Community support',
    ],
    cta: 'Start free',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$29',
    period: '/mo',
    description: 'For teams that need more data, more queries, more control.',
    highlight: true,
    features: [
      'Unlimited data sources',
      '5 GB document storage',
      'Unlimited chat queries',
      'Postgres live sync',
      'Custom embedding models',
      'Citation export (CSV/JSON)',
      'Priority email support',
    ],
    cta: 'Start Pro trial',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$99',
    period: '/mo',
    description: 'For organisations with multiple workspaces and strict access control.',
    features: [
      'Everything in Pro',
      'Scoped RAG projects',
      'SSO / SAML',
      'Row-level security passthrough',
      'Audit log',
      'SLA-backed uptime',
      'Dedicated Slack channel',
    ],
    cta: 'Talk to sales',
  },
];

export default function PricingSection({ onGetStarted }: { onGetStarted: () => void }) {
  const [selected, setSelected] = useState<Plan['id']>('pro');

  const activePlan = PLANS.find((p) => p.id === selected)!;

  return (
    <section id="pricing" className="relative z-0 bg-ink-950 px-6 py-28 border-t border-ink-700">
      {/* Graph-paper grid backdrop */}
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {/* Header */}
      <div className="max-w-3xl mx-auto text-center mb-14">
        <p className="font-mono text-xs text-ember-500 tracking-[0.2em] uppercase mb-4">Pricing</p>
        <h2 className="font-display text-4xl sm:text-5xl font-semibold text-parchment leading-tight">
          Simple plans. No surprises.
        </h2>
        <p className="font-sans text-base text-ash mt-4 max-w-lg mx-auto">
          Start free, upgrade when your data does.
        </p>
      </div>

      {/* Tab switcher with Motion layoutId pill */}
      <div className="flex justify-center mb-10">
        <div
          className="relative flex items-center bg-ink-800 border border-ink-700 rounded-xl p-1 gap-0.5"
          role="tablist"
          aria-label="Pricing plans"
        >
          {PLANS.map((plan) => (
            <button
              key={plan.id}
              id={`pricing-tab-${plan.id}`}
              role="tab"
              aria-selected={selected === plan.id}
              onClick={() => setSelected(plan.id)}
              className={`relative z-10 px-5 py-2.5 rounded-lg font-sans text-sm transition-colors duration-200 focus-ember ${
                selected === plan.id ? 'text-ink-950 font-medium' : 'text-ash hover:text-parchment-300'
              }`}
            >
              {/* Sliding pill */}
              {selected === plan.id && (
                <motion.span
                  layoutId="pricing-pill"
                  className="absolute inset-0 bg-ember-500 rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  style={{ zIndex: -1 }}
                />
              )}
              {plan.name}
              {plan.highlight && (
                <span className="ml-1.5 font-mono text-[9px] bg-ink-950/30 text-ink-950 px-1.5 py-0.5 rounded-full">
                  Popular
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Active plan detail */}
      <AnimatePresence mode="wait">
        <motion.div
          key={selected}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="max-w-xl mx-auto"
        >
          <div
            className={`relative rounded-2xl p-8 border ${
              activePlan.highlight
                ? 'bg-ink-800 border-ember-500/50 glow-ember'
                : 'bg-ink-800 border-ink-700'
            }`}
          >
            {activePlan.highlight && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="inline-flex items-center gap-1.5 bg-ember-500 text-ink-950 font-mono text-[11px] font-medium px-3 py-1 rounded-full">
                  <Zap className="w-3 h-3" />
                  Most popular
                </span>
              </div>
            )}

            {/* Price */}
            <div className="flex items-baseline gap-1 mb-2">
              <span className="font-display text-5xl font-semibold text-parchment">
                {activePlan.price}
              </span>
              {activePlan.period && (
                <span className="font-sans text-lg text-ash">{activePlan.period}</span>
              )}
            </div>

            <p className="font-sans text-sm text-ash mb-6">{activePlan.description}</p>

            {/* Features */}
            <ul className="space-y-3 mb-8">
              {activePlan.features.map((f) => (
                <li key={f} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-ember-400 shrink-0 mt-0.5" />
                  <span className="font-sans text-sm text-parchment-300">{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              id={`pricing-cta-${selected}`}
              onClick={onGetStarted}
              className={`group w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-sans font-medium text-sm transition-colors duration-200 focus-ember ${
                activePlan.highlight
                  ? 'bg-ember-500 hover:bg-ember-600 text-ink-950'
                  : 'bg-ink-700 hover:bg-ink-600 text-parchment border border-ink-600 hover:border-ink-500'
              }`}
            >
              {activePlan.cta}
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* All plans grid (sm and up — quick comparison) */}
      <div className="hidden sm:grid grid-cols-3 gap-4 max-w-3xl mx-auto mt-8">
        {PLANS.map((plan) => (
          <button
            key={plan.id}
            id={`pricing-card-${plan.id}`}
            onClick={() => setSelected(plan.id)}
            className={`relative p-4 rounded-xl border text-left transition-all duration-200 focus-ember ${
              selected === plan.id
                ? 'border-ember-500/60 bg-ember-500/5'
                : 'border-ink-700 bg-ink-800 hover:border-ink-600'
            }`}
          >
            <p className="font-sans font-medium text-parchment text-sm mb-0.5">{plan.name}</p>
            <p className="font-mono text-xs text-ash">
              {plan.price}
              {plan.period}
            </p>
          </button>
        ))}
      </div>

      {/* Footer note */}
      <p className="font-mono text-[11px] text-ash text-center mt-8">
        All plans include Supabase pgvector storage &middot; No credit card to start
      </p>
    </section>
  );
}
