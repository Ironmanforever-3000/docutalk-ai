import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Database, FileText, Send } from 'lucide-react';
import Logo from '../components/Logo';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: string[];
}

const DEMO_EXCHANGE: ChatMessage[] = [
  {
    id: 'u1',
    role: 'user',
    content: 'What were the top 5 products by revenue in Q4?',
  },
  {
    id: 'a1',
    role: 'assistant',
    content:
      'Based on the orders table, the top 5 products by Q4 revenue were: Apex Pro ($2.4M), Core Suite ($1.9M), Edge Lite ($1.1M), Relay Hub ($0.8M), and Signal Max ($0.6M). This aligns with the forecast on page 7 of your Q4 report, which projected Apex Pro at the top.',
    citations: ['sales_db → orders · rows 1480–1520', 'Q4_Report.pdf · p. 7'],
  },
  {
    id: 'u2',
    role: 'user',
    content: 'Which region had the highest Apex Pro sales?',
  },
  {
    id: 'a2',
    role: 'assistant',
    content:
      'APAC led Apex Pro sales at $1.1M, followed by EMEA at $0.8M and AMER at $0.5M. The Q4 report attributes the APAC spike to the Singapore partner launch in October.',
    citations: ['sales_db → orders · rows 1480–1488', 'Q4_Report.pdf · p. 12'],
  },
];

function TypingIndicator() {
  return (
    <div className="flex gap-1 px-4 py-3 bg-ink-800 border border-ink-700 rounded-xl rounded-tl-sm w-fit">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-ash"
          animate={{ scale: [0.6, 1, 0.6], opacity: [0.4, 1, 0.4] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

function StreamedText({ text }: { text: string }) {
  const [displayed, setDisplayed] = useState('');

  useEffect(() => {
    setDisplayed('');
    let i = 0;
    const interval = setInterval(() => {
      i += 3; // reveal 3 chars at a time for speed
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 18);
    return () => clearInterval(interval);
  }, [text]);

  return (
    <span className="font-sans text-sm text-parchment leading-relaxed">
      {displayed}
      {displayed.length < text.length && (
        <span className="inline-block w-0.5 h-3.5 bg-ember-400 ml-0.5 animate-blink align-middle" />
      )}
    </span>
  );
}

export default function DemoSection() {
  const [activeSource, setActiveSource] = useState<'postgres' | 'pdf'>('postgres');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [step, setStep] = useState(0); // which exchange we're on
  const [isTyping, setIsTyping] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [autoPlayed, setAutoPlayed] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Auto-play on first scroll into view
  useEffect(() => {
    if (autoPlayed) return;
    const section = sectionRef.current;
    if (!section) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAutoPlayed(true);
          observer.disconnect();
          runExchange(0);
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [autoPlayed]);

  const runExchange = async (exchangeIndex: number) => {
    if (exchangeIndex * 2 >= DEMO_EXCHANGE.length) return;

    const userMsg = DEMO_EXCHANGE[exchangeIndex * 2];
    const aiMsg   = DEMO_EXCHANGE[exchangeIndex * 2 + 1];
    if (!userMsg || !aiMsg) return;

    // Show user message
    await new Promise<void>((res) => setTimeout(res, exchangeIndex === 0 ? 600 : 400));
    setMessages((prev) => [...prev, userMsg]);

    // Typing indicator
    await new Promise<void>((res) => setTimeout(res, 700));
    setIsTyping(true);

    // Wait for "typing"
    await new Promise<void>((res) => setTimeout(res, 1200));
    setIsTyping(false);

    // Show AI response (StreamedText handles the word-by-word)
    setMessages((prev) => [...prev, aiMsg]);
    setStep(exchangeIndex + 1);
  };

  const handleSend = () => {
    if (step < DEMO_EXCHANGE.length / 2) {
      runExchange(step);
    }
    setInputVal('');
  };

  const handleReset = () => {
    setMessages([]);
    setStep(0);
    setAutoPlayed(false);
  };

  return (
    <section
      ref={sectionRef}
      id="demo"
      className="relative z-0 bg-ink-900 px-6 py-28 border-t border-ink-700"
    >
      {/* Graph-paper grid backdrop */}
      <div className="grid-bg grid-bg-fade pointer-events-none absolute inset-0 -z-10" />
      {/* Section header */}
      <div className="max-w-4xl mx-auto text-center mb-12">
        <p className="font-mono text-xs text-ember-500 tracking-[0.2em] uppercase mb-4">
          Live preview
        </p>
        <h2 className="font-display text-4xl sm:text-5xl font-semibold text-parchment leading-tight">
          Watch it answer from your data.
        </h2>
        <p className="font-sans text-base text-ash mt-4 max-w-xl mx-auto">
          This is a simulated demo — the same flow your users experience with real connected sources.
        </p>
      </div>

      {/* Demo UI */}
      <div className="max-w-4xl mx-auto">
        <div className="glass-card rounded-2xl overflow-hidden border border-ink-700 glow-ember">
          {/* Window chrome */}
          <div className="flex items-center gap-2 px-5 py-3 bg-ink-900 border-b border-ink-700">
            <span className="w-2.5 h-2.5 rounded-full bg-[#FF5F57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28C840]" />
            <span className="ml-4 font-mono text-xs text-ash">docutalk.ai / workspace / demo</span>
            <button
              onClick={handleReset}
              className="ml-auto font-mono text-[10px] text-ash hover:text-ember-400 transition-colors focus-ember px-2 py-0.5 rounded border border-ink-700 hover:border-ember-500/40"
            >
              replay ↺
            </button>
          </div>

          <div className="flex h-[520px]">
            {/* Left panel: sources */}
            <div className="hidden md:flex flex-col w-56 border-r border-ink-700 bg-ink-950/60 p-4 gap-2">
              <p className="font-mono text-[10px] text-ash uppercase tracking-widest mb-2">
                Sources
              </p>

              {/* Postgres */}
              <motion.button
                id="demo-source-postgres"
                onClick={() => setActiveSource('postgres')}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors duration-200 focus-ember w-full ${
                  activeSource === 'postgres'
                    ? 'bg-ember-500/10 border-ember-500/40'
                    : 'bg-ink-800 border-ink-700 hover:border-ink-600'
                }`}
                whileTap={{ scale: 0.97 }}
              >
                <Database className="w-4 h-4 text-ember-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-parchment truncate">sales_db</p>
                  <p className="font-mono text-[10px] text-ash">14 tables</p>
                </div>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              </motion.button>

              {/* PDF */}
              <motion.button
                id="demo-source-pdf"
                onClick={() => setActiveSource('pdf')}
                className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-left transition-colors duration-200 focus-ember w-full ${
                  activeSource === 'pdf'
                    ? 'bg-ember-500/10 border-ember-500/40'
                    : 'bg-ink-800 border-ink-700 hover:border-ink-600'
                }`}
                whileTap={{ scale: 0.97 }}
              >
                <FileText className="w-4 h-4 text-ember-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-mono text-xs text-parchment truncate">Q4_Report.pdf</p>
                  <p className="font-mono text-[10px] text-ash">24 pages</p>
                </div>
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
              </motion.button>

              {/* Source detail */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeSource}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 p-3 rounded-lg bg-ink-900 border border-ink-700"
                >
                  {activeSource === 'postgres' ? (
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] text-ash mb-2">Schema</p>
                      {['orders', 'products', 'customers', 'line_items'].map((t) => (
                        <p key={t} className="font-mono text-[10px] text-parchment-300">
                          <span className="text-ember-500">▸</span> {t}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="font-mono text-[10px] text-ash mb-2">Chunks</p>
                      <p className="font-mono text-[10px] text-parchment-300">
                        <span className="text-ember-500">▸</span> 847 embedded
                      </p>
                      <p className="font-mono text-[10px] text-parchment-300">
                        <span className="text-ember-500">▸</span> 24 pages
                      </p>
                      <p className="font-mono text-[10px] text-parchment-300">
                        <span className="text-ember-500">▸</span> dim 1536
                      </p>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              <div className="mt-auto pt-3 border-t border-ink-700">
                <p className="font-mono text-[10px] text-ash">
                  <span className="text-ember-400">1,847</span> total chunks
                </p>
              </div>
            </div>

            {/* Right: chat */}
            <div className="flex-1 flex flex-col">
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 hide-scrollbar">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                    <Logo size={36} animated={false} />
                    <p className="font-sans text-sm text-ash max-w-xs">
                      Ask anything about your connected sources — the demo will play automatically.
                    </p>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                    >
                      {msg.role === 'assistant' && (
                        <Logo size={20} animated={false} className="shrink-0 mt-1" />
                      )}
                      <div className={`space-y-2 ${msg.role === 'user' ? 'items-end flex flex-col max-w-xs' : 'max-w-md'}`}>
                        <div
                          className={`px-4 py-3 rounded-xl ${
                            msg.role === 'user'
                              ? 'bg-ember-600/20 border border-ember-600/30 rounded-tr-sm'
                              : 'bg-ink-800 border border-ink-700 rounded-tl-sm'
                          }`}
                        >
                          {msg.role === 'assistant' ? (
                            <StreamedText text={msg.content} />
                          ) : (
                            <p className="font-sans text-sm text-parchment">{msg.content}</p>
                          )}
                        </div>
                        {msg.citations && (
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map((c) => (
                              <span
                                key={c}
                                className="font-mono text-[10px] text-ash bg-ink-900 border border-ink-700 px-2 py-0.5 rounded-full"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="w-6 h-6 rounded-full bg-parchment-300/20 border border-parchment-300/20 shrink-0 mt-1 flex items-center justify-center">
                          <span className="font-mono text-[9px] text-ash">U</span>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isTyping && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-3"
                  >
                    <Logo size={20} animated={false} className="shrink-0 mt-1" />
                    <TypingIndicator />
                  </motion.div>
                )}

                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-ink-700 p-4">
                <div className="flex items-center gap-3 bg-ink-900 border border-ink-700 rounded-xl px-4 py-3 focus-within:border-ember-500/60 transition-colors">
                  <input
                    id="demo-chat-input"
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={
                      step >= DEMO_EXCHANGE.length / 2
                        ? 'Demo complete — click replay ↺ to restart'
                        : 'Ask a question about your data…'
                    }
                    disabled={step >= DEMO_EXCHANGE.length / 2}
                    className="flex-1 bg-transparent font-sans text-sm text-parchment placeholder:text-ash focus:outline-none"
                  />
                  <motion.button
                    id="demo-send-btn"
                    onClick={handleSend}
                    disabled={step >= DEMO_EXCHANGE.length / 2}
                    className="w-8 h-8 rounded-lg bg-ember-500 hover:bg-ember-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors focus-ember"
                    whileTap={{ scale: 0.92 }}
                  >
                    <Send className="w-3.5 h-3.5 text-ink-950" />
                  </motion.button>
                </div>
                <p className="font-mono text-[10px] text-ash mt-2 text-center">
                  Simulated demo · no real API calls
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
