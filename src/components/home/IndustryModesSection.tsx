import { Building2, Fuel, Headset, House, UtensilsCrossed } from 'lucide-react';

const industryModes = [
  {
    title: 'Real Estate',
    description: 'Manage properties, clients, and qualification workflows with AI-powered lead capture.',
    icon: House,
  },
  {
    title: 'Gas Station',
    description: 'Track service requests, fuel monitoring, and recurring customer support issues.',
    icon: Fuel,
  },
  {
    title: 'Restaurants',
    description: 'Handle reservations, inbound orders, and customer service follow-ups from one queue.',
    icon: UtensilsCrossed,
  },
  {
    title: 'Retail',
    description: 'Route product inquiries, returns, and store operations into one shared workspace.',
    icon: Building2,
  },
  {
    title: 'Service Teams',
    description: 'Manage dispatch calls, call outcomes, and field updates without switching tools.',
    icon: Headset,
  },
];

export function IndustryModesSection() {
  return (
    <section id="industries" className="section-shell pt-16">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Industry Modes</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-slate-900">
            Tailored workspaces for every industry
          </h2>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {industryModes.map((mode) => {
            const Icon = mode.icon;
            return (
              <article
                key={mode.title}
                className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-indigo-600">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">{mode.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-6 text-slate-600">{mode.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
