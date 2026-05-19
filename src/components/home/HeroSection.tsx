import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, ChevronDown, Clock3, PlayCircle, RefreshCw, Search, Users, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';

const heroHeadline = 'Run revenue operations, records, and inbound AI voice from one command center.';

const priorityCards = [
  {
    title: '38 records need attention',
    detail: 'Review overdue, unassigned, and stale records so the queue keeps moving.',
    cta: 'Review queue',
    icon: Clock3,
    tone: 'pink',
  },
  {
    title: '38 records need attention',
    detail: 'Prioritize overdue, unassigned, and stale records to keep momentum.',
    cta: 'Open queue',
    icon: Clock3,
    tone: 'pink',
  },
  {
    title: 'Workflow setup is in place',
    detail: 'Review stage health and process consistency across the workspace.',
    cta: 'Review setup',
    icon: Workflow,
    tone: 'amber',
  },
];

const reportCards = [
  {
    filter: 'Records assigned to me',
    action: 'New',
    description: 'No recent records are assigned to you yet.',
    bullets: ['0 follow-ups due today', '0 overdue items in your queue', 'No recent closed records yet'],
    icon: Clock3,
    tone: 'blue',
  },
  {
    filter: 'Real Estate Pipeline',
    action: 'Open',
    description: 'Monitor the main workspace flow and keep stalled stages visible.',
    bullets: ['19 live records in the current queue', '19 records stuck in New Inquiry', '1 active stages with records'],
    icon: Workflow,
    tone: 'orange',
  },
  {
    filter: '2 workspace members',
    action: 'Open',
    description: 'See how ownership, assistants, and shared queue work are spreading across the workspace.',
    bullets: ['0 records currently have an owner', '19 records still need assignment', '1 assistants ready for workspace support'],
    icon: Users,
    tone: 'purple',
  },
];

const toneClasses = {
  amber: 'bg-amber-500',
  blue: 'bg-blue-400',
  orange: 'bg-orange-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-600',
};

function useTypewriterText(text: string) {
  const [typedText, setTypedText] = useState('');

  useEffect(() => {
    let index = 0;
    let direction: 'typing' | 'deleting' = 'typing';
    let timeoutId: number;

    const tick = () => {
      if (direction === 'typing') {
        index += 1;
        setTypedText(text.slice(0, index));

        if (index === text.length) {
          direction = 'deleting';
          timeoutId = window.setTimeout(tick, 1350);
          return;
        }

        timeoutId = window.setTimeout(tick, 70);
        return;
      }

      index -= 1;
      setTypedText(text.slice(0, index));

      if (index === 0) {
        direction = 'typing';
        timeoutId = window.setTimeout(tick, 550);
        return;
      }

      timeoutId = window.setTimeout(tick, 42);
    };

    timeoutId = window.setTimeout(tick, 450);

    return () => window.clearTimeout(timeoutId);
  }, [text]);

  return typedText;
}

function MiniGridIllustration({ tone }: { tone: keyof typeof toneClasses }) {
  return (
    <div className="relative mx-auto flex h-14 w-14 items-center justify-center sm:h-16 sm:w-16">
      <span className={`absolute inset-2 rounded-full opacity-55 ${toneClasses[tone]}`} />
      <span className="relative grid grid-cols-4 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_10px_24px_rgba(15,23,42,0.12)]">
        {Array.from({ length: 12 }).map((_, index) => {
          const activeIndexes =
            tone === 'blue' ? [0, 5, 10] : tone === 'orange' ? [0, 5, 10] : [0, 5, 10];

          return (
            <span
              key={index}
              className={`h-2 w-2 rounded-[0.18rem] ${activeIndexes.includes(index) ? toneClasses[tone] : 'bg-slate-100'}`}
            />
          );
        })}
      </span>
    </div>
  );
}

function HeroDashboardMockup() {
  return (
    <motion.div
      animate={{ y: [0, -9, 0], rotateX: [1.6, 0, 1.6] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      whileHover={{ y: -5, scale: 1.01 }}
      className="relative ml-auto w-full max-w-[calc(100vw-2rem)] overflow-hidden rounded-[1.15rem] border border-white/20 bg-white/[0.12] p-1.5 shadow-[0_28px_70px_rgba(0,0,0,0.38)] backdrop-blur-xl [transform-style:preserve-3d] sm:p-2 lg:max-w-[43rem] xl:max-w-[48rem]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(129,140,248,0.25),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(56,189,248,0.16),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />

      <div className="relative overflow-hidden rounded-[1rem] border border-white/20 bg-[#f3f3f3] shadow-[0_16px_34px_rgba(2,6,23,0.32)]">
        <div className="max-h-[27.5rem] overflow-hidden bg-[#f3f3f3] p-2 sm:p-2.5">
          <section className="rounded-xl border border-[#d5e3f5] bg-[linear-gradient(135deg,#f8fbff_0%,#eef5ff_58%,#ffffff_100%)] p-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)]">
            <div className="flex items-center gap-2 text-[#4778d3]">
              <span className="h-2 w-2 rounded-full bg-[#4778d3]" />
              <span className="text-[10px] font-semibold sm:text-[11px]">Workspace overview</span>
            </div>

            <div className="mt-2.5 grid gap-2.5 xl:grid-cols-[0.54fr_1.46fr]">
              <div className="space-y-2">
                <h3 className="max-w-[9rem] text-[1.45rem] font-light leading-[1.02] tracking-tight text-[#16325c] sm:text-[1.65rem]">
                  Welcome back, Morgan
                </h3>
                <p className="text-[10px] text-slate-600">Here&apos;s what needs your attention today.</p>
                <a className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#1b5fbd]" href="#features">
                  View all actions
                  <ArrowRight className="h-3 w-3" />
                </a>
                <div className="flex flex-wrap gap-1.5">
                  {['Open records', 'Create record', 'Form Builder'].map((action, index) => (
                    <span
                      key={action}
                      className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${
                        index === 0 ? 'border-[#2e5fb8] bg-white text-[#174b99]' : 'border-slate-200 bg-white text-[#16325c]'
                      }`}
                    >
                      {action}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {priorityCards.map((card) => {
                    const Icon = card.icon;
                    const tone = card.tone as keyof typeof toneClasses;

                    return (
                      <article
                        key={card.cta}
                        className="min-h-[7.5rem] rounded-lg border border-[#dbe4f2] bg-white p-2.5 shadow-[0_8px_18px_rgba(15,23,42,0.07)]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${toneClasses[tone]}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </span>
                          <span className="text-lg font-light leading-none text-[#4778d3]">x</span>
                        </div>
                        <p className="mt-2 text-[11px] font-semibold leading-4 text-[#16325c]">{card.title}</p>
                        <p className="mt-1 text-[9px] leading-3.5 text-slate-600">{card.detail}</p>
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold text-[#4778d3]">
                          {card.cta}
                          <ArrowRight className="h-2.5 w-2.5" />
                        </span>
                      </article>
                    );
                  })}
                </div>
                <p className="mt-1.5 hidden text-[9px] text-slate-500 sm:block">3 priority cards remaining</p>
              </div>
            </div>
          </section>

          <section className="mt-2.5 grid gap-2.5 lg:grid-cols-3">
            {reportCards.map((card) => {
              const Icon = card.icon;
              const tone = card.tone as keyof typeof toneClasses;

              return (
                <article
                  key={card.filter}
                  className="flex min-h-[11.5rem] flex-col rounded-xl border border-[#d8dde6] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.1)]"
                >
                  <div className="flex items-center gap-1.5 p-2.5">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white ${toneClasses[tone]}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-[#c9cfd8] bg-white px-2 py-1 text-[9px] text-slate-600">
                      <span className="truncate">{card.filter}</span>
                      <Search className="ml-auto h-2.5 w-2.5 shrink-0 text-slate-400" />
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] font-semibold text-[#0176d3]">
                      {card.action}
                    </span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-200 text-[#4778d3]">
                      <ChevronDown className="h-3 w-3" />
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col items-center justify-center px-3 pb-3 text-center">
                    <MiniGridIllustration tone={tone} />
                    <p className="mt-2 text-[10px] leading-4 text-slate-700">{card.description}</p>
                    <div className="mt-2 space-y-0.5 text-left">
                      {card.bullets.map((bullet) => (
                        <p key={bullet} className="flex items-start gap-1.5 text-[9px] leading-3.5 text-slate-600">
                          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${toneClasses[tone]}`} />
                          <span>{bullet}</span>
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 border-t border-slate-200 px-2.5 py-1.5 text-[9px] text-slate-500">
                    <span className="font-semibold text-[#0176d3]">View report</span>
                    <span className="ml-auto">As of today at 5:05 pm</span>
                    <RefreshCw className="h-3 w-3 text-[#0176d3]" />
                  </div>
                </article>
              );
            })}
          </section>
        </div>
      </div>

    </motion.div>
  );
}

export function HeroSection() {
  const typedHeadline = useTypewriterText(heroHeadline);

  return (
    <section className="relative -mt-20 overflow-hidden bg-slate-950 pt-24 text-white md:pt-28">
      <img
        src="/images/coreflow-hero-command-center.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,12,30,0.76)_0%,rgba(15,23,42,0.5)_43%,rgba(15,23,42,0.12)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_35%,rgba(99,102,241,0.14),transparent_34%),linear-gradient(180deg,rgba(5,12,30,0)_0%,rgba(5,12,30,0.58)_100%)]" />
      <div className="hero-grain pointer-events-none absolute inset-0 opacity-[0.16]" />

      <div className="section-shell relative pb-12 pt-10 sm:pt-12 lg:pb-16">
        <div className="grid min-w-0 items-center gap-7 lg:grid-cols-[0.9fr_1.1fr] xl:grid-cols-[0.84fr_1.16fr]">
          <div className="relative min-w-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
            <p className="inline-flex items-center rounded-full border border-indigo-200/30 bg-white/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-100 shadow-sm backdrop-blur">
              Sovereign CRM + Voice Operations
            </p>
            <h1
              className="relative mt-4 max-w-[21rem] break-words font-display text-[2rem] font-semibold leading-[1.06] text-white sm:max-w-2xl sm:text-[2.9rem] lg:text-[3rem] xl:text-[3.35rem]"
              aria-label={heroHeadline}
            >
              <span className="invisible" aria-hidden="true">
                {heroHeadline}
              </span>
              <span className="absolute inset-0" aria-hidden="true">
                {typedHeadline}
                <span className="ml-1 inline-block h-[0.9em] w-[0.07em] translate-y-[0.08em] animate-pulse bg-white" />
              </span>
            </h1>
            <p className="mt-4 max-w-[21.5rem] text-sm leading-7 text-slate-200 sm:max-w-[32rem] sm:text-base">
              CoreFlow unifies team workflows, call intelligence, and lead execution in a single system built for
              high-volume service businesses.
            </p>

            <div className="mt-6 flex max-w-[21.5rem] flex-col gap-2.5 sm:max-w-none sm:flex-row">
              <Link
                to="/signup"
                className="group inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 px-5 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(79,70,229,0.42)] ring-1 ring-indigo-200/45 transition duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:via-indigo-700 hover:to-blue-700"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                to="/signin"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(2,6,23,0.24)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-indigo-200/60 hover:bg-white/15"
              >
                <PlayCircle className="h-4 w-4" />
                Book Demo
              </Link>
            </div>

            <div className="mt-6 flex max-w-[21.5rem] flex-wrap items-center gap-2 text-sm text-slate-200 sm:max-w-none">
              <span className="font-semibold text-white">Trusted by operators in:</span>
              {['Real Estate', 'Home Services', 'Retail Ops', 'Restaurants'].map((industry) => (
                <span
                  key={industry}
                  className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-medium text-slate-100 shadow-sm backdrop-blur"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>

          <div className="min-w-0 max-w-[calc(100vw-2rem)] lg:max-w-none">
            <HeroDashboardMockup />
          </div>
        </div>
      </div>
    </section>
  );
}
