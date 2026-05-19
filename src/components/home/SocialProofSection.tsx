import { Activity, Building2, Factory, Hotel, Store } from 'lucide-react';
import { LandingReveal, LandingRevealItem, LandingStagger } from './LandingReveal';

const stats = [
  { label: 'Calls Routed Monthly', value: '1.8M+' },
  { label: 'Average Response Time', value: '< 30 sec' },
  { label: 'Workflow Uptime', value: '99.99%' },
  { label: 'Teams Onboarded', value: '420+' },
];

const industries = [
  { label: 'Real Estate', icon: Building2 },
  { label: 'Restaurants', icon: Hotel },
  { label: 'Retail', icon: Store },
  { label: 'Field Services', icon: Factory },
];

export function SocialProofSection() {
  return (
    <section id="proof" className="relative bg-white pt-8 sm:pt-10 lg:pt-12">
      <div className="section-shell">
        <LandingReveal className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_56px_rgba(15,23,42,0.18)]">
          <LandingStagger
            className="grid divide-y divide-slate-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4"
            stagger={0.09}
          >
            {stats.map((stat) => (
              <LandingRevealItem key={stat.label} direction="up" distance={18}>
                <article className="group p-5 transition duration-200 hover:bg-slate-50">
                  <div className="flex items-center justify-between">
                    <p className="text-[1.9rem] font-semibold leading-none text-slate-950">{stat.value}</p>
                    <div className="rounded-lg border border-indigo-100 bg-indigo-50 p-1.5 text-indigo-700">
                      <Activity className="h-3.5 w-3.5" />
                    </div>
                  </div>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
                  <div className="mt-3 flex items-end gap-1">
                    {[38, 52, 44, 58, 49, 62].map((h, sparkIndex) => (
                      <span
                        key={sparkIndex}
                        className="inline-block w-1.5 rounded-full bg-gradient-to-t from-indigo-200 to-cyan-400"
                        style={{ height: `${h / 4}px` }}
                      />
                    ))}
                  </div>
                </article>
              </LandingRevealItem>
            ))}
          </LandingStagger>

          <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Trusted Across Industries</p>
            <LandingStagger className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" stagger={0.06}>
              {industries.map((item) => {
                const Icon = item.icon;
                return (
                  <LandingRevealItem key={item.label} direction="up" distance={14}>
                    <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                      <Icon className="h-4 w-4 text-indigo-600" />
                      <span>{item.label}</span>
                    </div>
                  </LandingRevealItem>
                );
              })}
            </LandingStagger>
          </div>
        </LandingReveal>
      </div>
    </section>
  );
}
