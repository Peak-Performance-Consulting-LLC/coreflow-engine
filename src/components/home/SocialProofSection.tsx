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
    <section id="proof" className="section-shell pt-16">
      <LandingReveal className="relative overflow-hidden rounded-3xl border border-slate-300/60 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-5 shadow-[0_24px_54px_rgba(15,23,42,0.35)] sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_8%_14%,rgba(99,102,241,0.35),transparent_34%),radial-gradient(circle_at_92%_82%,rgba(56,189,248,0.18),transparent_38%)]" />

        <LandingStagger className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4" stagger={0.09}>
          {stats.map((stat, index) => (
            <LandingRevealItem key={stat.label} direction="up" distance={18}>
              <article
                className={`group rounded-2xl bg-white/10 p-4 backdrop-blur transition duration-200 hover:-translate-y-1 hover:bg-white/15 ${
                  index < stats.length - 1 ? 'border border-slate-600/40 lg:border-r lg:border-slate-500/55' : 'border border-slate-600/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-[2.05rem] font-semibold leading-none tracking-[-0.02em] text-white">{stat.value}</p>
                  <div className="rounded-lg border border-indigo-200/35 bg-indigo-300/10 p-1.5 text-indigo-100">
                    <Activity className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-200">{stat.label}</p>
                <div className="mt-3 flex items-end gap-1">
                  {[38, 52, 44, 58, 49, 62].map((h, sparkIndex) => (
                    <span
                      key={sparkIndex}
                      className="inline-block w-1.5 rounded-full bg-gradient-to-t from-indigo-300/30 to-cyan-200/90"
                      style={{ height: `${h / 4}px` }}
                    />
                  ))}
                </div>
              </article>
            </LandingRevealItem>
          ))}
        </LandingStagger>

        <div className="relative mt-6 border-t border-slate-600/40 pt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">Trusted Across Industries</p>
          <LandingStagger className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4" stagger={0.06}>
            {industries.map((item) => {
              const Icon = item.icon;
              return (
                <LandingRevealItem key={item.label} direction="up" distance={14}>
                  <div
                    className="flex items-center gap-2 rounded-full border border-slate-500/60 bg-white/10 px-3 py-2 text-sm font-medium text-slate-100"
                  >
                    <Icon className="h-4 w-4 text-indigo-200" />
                    <span>{item.label}</span>
                  </div>
                </LandingRevealItem>
              );
            })}
          </LandingStagger>
        </div>
      </LandingReveal>
    </section>
  );
}
