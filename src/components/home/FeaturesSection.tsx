import { Bot, Download, ListChecks, PhoneCall, ShieldCheck, Table2 } from 'lucide-react';
import { LandingReveal, LandingRevealItem, LandingStagger } from './LandingReveal';

const features = [
  {
    title: 'Unified Records Queue',
    description: 'Centralized records, contacts, and operational status in one searchable view.',
    icon: ListChecks,
  },
  {
    title: 'CSV Imports and Mapping',
    description: 'Bulk import and map fields with intelligent matching and validation.',
    icon: Download,
  },
  {
    title: 'Voice Number Provisioning',
    description: 'Provision and manage numbers from a dedicated voice workspace.',
    icon: PhoneCall,
  },
  {
    title: 'AI Assistant Configuration',
    description: 'Configure assistants, field mappings, and call bindings in one flow.',
    icon: Bot,
  },
  {
    title: 'Call Ops Review Queue',
    description: 'Review call outcomes, retry actions, and handle exceptions quickly.',
    icon: Table2,
  },
  {
    title: 'Role-based Workspace Control',
    description: 'Define owner permissions and secure team access by workspace role.',
    icon: ShieldCheck,
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="bg-white pt-20">
      <div className="section-shell">
        <LandingReveal className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">Feature Stack</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
            Purpose-built for teams that execute fast without losing control
          </h2>
        </LandingReveal>

        <LandingStagger className="mt-9 grid gap-4 md:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <LandingRevealItem key={feature.title}>
                <article className="group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition duration-200 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_24px_50px_rgba(49,46,129,0.14)]">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 opacity-0 transition duration-200 group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-700 transition duration-200 group-hover:bg-indigo-600 group-hover:text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Layer {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-5 text-base font-semibold text-slate-950">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
                </article>
              </LandingRevealItem>
            );
          })}
        </LandingStagger>
      </div>
    </section>
  );
}
