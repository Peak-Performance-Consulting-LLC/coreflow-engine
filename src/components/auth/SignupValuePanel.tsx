import { BadgeCheck, Bot, Sparkles, Users } from 'lucide-react';
import { LogoMark } from '../ui/LogoMark';

const valueBullets = [
  {
    title: 'Capture leads automatically',
    icon: BadgeCheck,
  },
  {
    title: 'Let AI answer calls 24/7',
    icon: Bot,
  },
  {
    title: 'Organize customers and follow-ups in one place',
    icon: Users,
  },
];

export function SignupValuePanel() {
  return (
    <div className="space-y-8">
      <LogoMark />

      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-accent-blue">
          <Sparkles className="h-3.5 w-3.5" />
          Get started
        </div>
        <h2 className="max-w-xl font-display text-4xl font-semibold leading-tight text-slate-900">
          Set up your AI-powered CRM in minutes
        </h2>
        <p className="max-w-xl text-base leading-8 text-slate-700">
          Create your account once and launch a workspace designed for your business type with guided onboarding.
        </p>
      </div>

      <div className="space-y-3">
        {valueBullets.map((bullet) => {
          const Icon = bullet.icon;

          return (
            <div
              key={bullet.title}
              className="flex items-center gap-3 rounded-2xl border border-slate-300 bg-white px-4 py-3"
            >
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-accent-blue">
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-sm font-medium text-slate-800">{bullet.title}</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Built for growing service businesses.
      </div>
    </div>
  );
}
