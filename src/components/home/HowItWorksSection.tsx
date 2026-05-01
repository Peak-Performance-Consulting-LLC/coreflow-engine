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
    <section id="how-it-works" className="section-shell pt-20">
      <LandingReveal className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">How It Works</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
          Launch in days with a workflow-first setup
        </h2>
      </LandingReveal>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative space-y-4 before:absolute before:bottom-8 before:left-[21px] before:top-8 before:w-px before:bg-gradient-to-b before:from-indigo-300 before:via-indigo-200 before:to-cyan-200">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <LandingReveal key={step.title} delay={0.05 * index}>
                <article className="group rounded-2xl border border-slate-300/70 bg-gradient-to-b from-white to-slate-100/70 p-5 shadow-[0_14px_34px_rgba(15,23,42,0.12)] transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-[0_20px_36px_rgba(49,46,129,0.15)]">
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="relative z-[1] flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-600 text-white shadow-sm transition duration-200 group-hover:shadow-[0_0_0_6px_rgba(99,102,241,0.12)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-indigo-700">
                        Step {step.id}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold text-slate-900">{step.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                    </div>
                  </div>
                </article>
              </LandingReveal>
            );
          })}
        </div>

        <LandingReveal delay={0.12}>
          <aside className="rounded-2xl border border-slate-600/40 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 shadow-[0_24px_58px_rgba(15,23,42,0.42)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Execution Snapshot</p>
            <div className="mt-5 space-y-3">
              {[
                { metric: 'Onboarding Time', value: '3-5 days' },
                { metric: 'Workflow Coverage', value: '95%' },
                { metric: 'Setup Success Rate', value: '99.1%' },
              ].map((item) => (
                <div key={item.metric} className="rounded-xl border border-slate-600/40 bg-white/10 p-3 backdrop-blur">
                  <p className="text-xs uppercase tracking-wide text-slate-300">{item.metric}</p>
                  <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                </div>
              ))}
            </div>
            <Link
              to="/voice/ops"
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              Explore Voice Ops
              <ArrowRight className="h-4 w-4" />
            </Link>
          </aside>
        </LandingReveal>
      </div>
    </section>
  );
}
