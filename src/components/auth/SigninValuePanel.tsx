import { ShieldCheck, KeyRound } from 'lucide-react';
import { crmOptions } from '../../lib/constants';
import { LogoMark } from '../ui/LogoMark';

export function SigninValuePanel() {
  return (
    <div className="flex h-full w-full max-w-[620px] flex-col">
      <div className="space-y-6">
        <div className="inline-flex">
          <LogoMark theme="dark" />
        </div>

        <div className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/18 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
          <ShieldCheck className="h-3 w-3" />
          Secure access
        </div>

        <div className="space-y-3">
          <h2 className="font-display text-[3.3rem] font-semibold leading-[1.1] tracking-tight text-white">
            Pick up right where your workspace left off
          </h2>
          <p className="max-w-[580px] text-lg leading-8 text-white/85">
            Sign in once and CoreFlow restores the right CRM dashboard, workspace context, and saved session.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        {crmOptions.slice(0, 4).map((option) => {
          const Icon = option.icon;

          return (
            <div
              key={option.value}
              className="rounded-2xl border border-white/30 bg-white/16 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-[14px]"
            >
              <div className="space-y-3">
                <div className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/30 bg-white/20 text-white">
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <h3 className="font-display text-xl font-semibold leading-tight text-white">{option.label}</h3>
                <p className="text-sm leading-5 text-white/85">{option.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-auto rounded-xl border border-white/30 bg-white/16 p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] backdrop-blur-[14px]">
        <div className="flex items-center gap-3 text-sm font-medium text-white">
          <KeyRound className="h-4 w-4 text-white" />
          Your saved workspace opens after sign-in.
        </div>
      </div>
    </div>
  );
}
