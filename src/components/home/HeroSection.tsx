import { motion } from 'framer-motion';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingReveal } from './LandingReveal';

export function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-14 md:pt-24">
      <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-[26rem] w-[95%] max-w-6xl rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.32),rgba(79,70,229,0))]" />
      <div className="pointer-events-none absolute left-[-4%] top-24 h-[19rem] w-[19rem] rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-4%] top-32 h-[20rem] w-[20rem] rounded-full bg-indigo-300/48 blur-3xl" />
      <div className="pointer-events-none absolute left-[9%] top-[16%] h-[16rem] w-[16rem] rounded-full bg-violet-300/25 blur-[90px]" />
      <div className="pointer-events-none absolute right-[8%] top-[20%] h-[18rem] w-[18rem] rounded-full bg-indigo-400/30 blur-[95px]" />
      <div className="hero-grain pointer-events-none absolute inset-0 opacity-[0.22]" />

      <div className="section-shell relative">
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          <LandingReveal className="relative">
            <div className="pointer-events-none absolute -left-5 top-10 h-44 w-44 rounded-full bg-indigo-300/30 blur-3xl" />
            <p className="inline-flex items-center rounded-full border border-indigo-300/70 bg-indigo-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-800">
              Sovereign CRM + Voice Operations
            </p>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-slate-900 sm:text-5xl lg:text-6xl">
              Run revenue operations, records, and inbound AI voice from one command center.
            </h1>
            <p className="mt-6 max-w-[36rem] text-base leading-8 text-slate-700/95 sm:text-[1.06rem]">
              CoreFlow unifies team workflows, call intelligence, and lead execution in a single system built for
              high-volume service businesses.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/signup"
                className="group inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 px-6 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(49,46,129,0.48)] ring-1 ring-indigo-300/45 transition duration-200 hover:-translate-y-0.5 hover:from-indigo-800 hover:via-indigo-700 hover:to-blue-700 hover:shadow-[0_22px_42px_rgba(49,46,129,0.56)]"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                to="/signin"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-400/65 bg-slate-950/90 px-6 text-sm font-semibold text-white shadow-[0_8px_22px_rgba(15,23,42,0.25)] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-indigo-300/60 hover:bg-slate-900 hover:shadow-[0_14px_28px_rgba(79,70,229,0.24)]"
              >
                <PlayCircle className="h-4 w-4" />
                Book Demo
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2.5 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Trusted by operators in:</span>
              {['Real Estate', 'Home Services', 'Retail Ops', 'Restaurants'].map((industry) => (
                <span
                  key={industry}
                  className="rounded-full border border-slate-300/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm backdrop-blur"
                >
                  {industry}
                </span>
              ))}
            </div>
          </LandingReveal>

          <LandingReveal delay={0.08}>
            <motion.div
              animate={{ y: [0, -9, 0], rotateX: [1.6, 0, 1.6] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              whileHover={{ y: -5, scale: 1.01 }}
              className="relative overflow-hidden rounded-[1.75rem] border border-slate-700/25 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-4 shadow-[0_30px_78px_rgba(15,23,42,0.46)] [transform-style:preserve-3d] sm:p-5"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(129,140,248,0.45),transparent_40%),radial-gradient(circle_at_85%_80%,rgba(56,189,248,0.2),transparent_45%)]" />
              <div className="pointer-events-none absolute inset-x-8 top-0 h-[1px] bg-gradient-to-r from-transparent via-white/70 to-transparent" />
              <div className="relative overflow-hidden rounded-2xl border border-slate-500/30 bg-white/95 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.4)]">
                <div className="mb-3 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    app.coreflow.ai
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">Operations Command</p>
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                    Live
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Calls Processed', value: '12.4k' },
                    { label: 'Qualified Leads', value: '2,189' },
                    { label: 'Response SLA', value: '98.2%' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
                      <p className="mt-1 text-xl font-semibold text-slate-950">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Live Queue</p>
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                      24 Active
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {[
                      { caller: 'A. Johnson', intent: 'New Lead', status: 'Qualified' },
                      { caller: 'L. Chen', intent: 'Support', status: 'In Review' },
                      { caller: 'R. Patel', intent: 'Booking', status: 'Closed' },
                    ].map((row) => (
                      <div
                        key={row.caller}
                        className="grid grid-cols-[1fr_0.8fr_0.72fr] items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-2"
                      >
                        <p className="truncate text-[11px] font-medium text-slate-700">{row.caller}</p>
                        <p className="truncate text-[11px] text-slate-600">{row.intent}</p>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-center text-[10px] font-semibold text-emerald-700">
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute -right-3 -top-3 hidden rounded-xl border border-indigo-200/60 bg-white/90 px-3 py-2 text-xs font-semibold text-indigo-800 shadow-md sm:block">
                AI Workflow Automation
              </div>
            </motion.div>
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}
