import { Bot, Download, ListChecks, PhoneCall, ShieldCheck, Table2 } from 'lucide-react';

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
    <section id="features" className="section-shell pt-14">
      <div className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Core Features</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-slate-900">CoreFlow&apos;s modern operational tools</h2>
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article key={feature.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
