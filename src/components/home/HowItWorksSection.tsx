import { ArrowRight, Bot, Database, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { LandingReveal } from './LandingReveal';

const steps = [
  {
    id: '01',
    title: 'Connect your workspace',
    description: 'Set up your CRM mode, import data, and map core fields in a guided onboarding flow.',
    icon: Database,
  },
  {
    id: '02',
    title: 'Activate AI call workflows',
    description: 'Provision numbers, configure assistants, and route call outcomes into structured records.',
    icon: Bot,
  },
  {
    id: '03',
    title: 'Automate and scale',
    description: 'Track conversion metrics, queue follow-ups, and run reliable ops playbooks across teams.',
    icon: Workflow,
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-white pt-20">
      <div className="section-shell">
        <div className="relative overflow-hidden rounded-[2rem] bg-slate-950 p-6 shadow-[0_28px_80px_rgba(15,23,42,0.32)] sm:p-8 lg:p-10">
          <img
            src="/images/coreflow-network-map.svg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-30"
            aria-hidden="true"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.72)_0%,rgba(15,23,42,0.95)_100%)]" />

          <LandingReveal className="relative mx-auto max-w-3xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-200">How It Works</p>
            <h2 className="mt-2 font-display text-3xl font-semibold text-white sm:text-4xl">
              Launch in days with a workflow-first setup
            </h2>
          </LandingReveal>

          <div className="relative mt-10 grid gap-5 lg:grid-cols-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <LandingReveal key={step.title} delay={0.05 * index}>
                  <article className="group relative h-full rounded-2xl border border-white/10 bg-white/[0.08] p-5 shadow-[0_18px_48px_rgba(2,6,23,0.3)] backdrop-blur transition duration-200 hover:-translate-y-1 hover:bg-white/[0.12]">
                    {index < steps.length - 1 ? (
                      <div className="pointer-events-none absolute left-[calc(100%-0.25rem)] top-10 hidden h-px w-5 bg-gradient-to-r from-indigo-300/80 to-cyan-300/20 lg:block" />
                    ) : null}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-[0_10px_24px_rgba(99,102,241,0.3)]">
                        <Icon className="h-5 w-5" />
                      </div>
                      <p className="rounded-full border border-indigo-200/25 bg-indigo-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-100">
                        Step {step.id}
                      </p>
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-white">{step.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{step.description}</p>
                  </article>
                </LandingReveal>
              );
            })}
          </div>

          <LandingReveal delay={0.12} className="relative mt-6">
            <aside className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.08] p-5 backdrop-blur md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Execution Snapshot</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    { metric: 'Onboarding Time', value: '3-5 days' },
                    { metric: 'Workflow Coverage', value: '95%' },
                    { metric: 'Setup Success Rate', value: '99.1%' },
                  ].map((item) => (
                    <div key={item.metric} className="rounded-xl border border-white/10 bg-slate-950/45 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-400">{item.metric}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <Link
                to="/voice/ops"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                Explore Voice Ops
                <ArrowRight className="h-4 w-4" />
              </Link>
            </aside>
          </LandingReveal>
        </div>
      </div>
    </section>
  );
}
