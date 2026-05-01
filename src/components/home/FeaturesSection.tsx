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
    <section id="features" className="section-shell pt-20">
      <LandingReveal className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">Feature Stack</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-slate-950 sm:text-4xl">
          Purpose-built for teams that execute fast without losing control
        </h2>
      </LandingReveal>

      <LandingStagger className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3" stagger={0.1}>
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <LandingRevealItem key={feature.title}>
              <article className="group h-full rounded-2xl border border-slate-300/70 bg-gradient-to-b from-white to-indigo-50/50 p-5 shadow-[0_15px_36px_rgba(15,23,42,0.12)] transition duration-200 hover:-translate-y-1 hover:border-indigo-300 hover:shadow-[0_22px_40px_rgba(49,46,129,0.2)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-sm shadow-indigo-200 transition duration-200 group-hover:shadow-[0_0_0_6px_rgba(99,102,241,0.16)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-slate-950">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-700">{feature.description}</p>
              </article>
            </LandingRevealItem>
          );
        })}
      </LandingStagger>
    </section>
  );
}
