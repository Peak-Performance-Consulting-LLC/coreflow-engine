import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { crmOptions } from '../../lib/constants';
import { AnimatedBackground } from '../ui/AnimatedBackground';
import { LogoMark } from '../ui/LogoMark';
import { cn } from '../../lib/utils';

interface AuthLayoutProps {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
  leftPanel?: ReactNode;
  rightPanelClassName?: string;
}

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  leftPanel,
  rightPanelClassName,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <AnimatedBackground />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1480px] items-center px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid w-full items-start gap-6 xl:grid-cols-[1fr_1fr] 2xl:gap-8">
          <motion.aside
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="hidden self-start rounded-[32px] border border-slate-300 bg-white p-8 shadow-panel xl:sticky xl:top-8 xl:flex xl:flex-col"
          >
            {leftPanel ?? (
              <>
                <div className="space-y-10">
                  <LogoMark />
                  <div className="space-y-4">
                    <div className="inline-flex rounded-full border border-accent-blue/25 bg-accent-blue/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-accent-blue">
                      Shared onboarding flow
                    </div>
                    <h2 className="font-display text-4xl font-semibold leading-tight text-slate-900">
                      Premium entry into a multi-industry CRM platform.
                    </h2>
                    <p className="max-w-xl text-base leading-8 text-slate-700">
                      Sign in or create your account, launch your workspace, and route into the dashboard that matches
                      your selected CRM mode.
                    </p>
                  </div>
                </div>

                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  {crmOptions.slice(0, 4).map((option) => {
                    const Icon = option.icon;

                    return (
                      <div key={option.value} className="rounded-[24px] border border-slate-300 bg-white p-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-300 bg-slate-50 text-accent-blue">
                          <Icon className="h-4 w-4" />
                        </div>
                        <h3 className="mt-4 font-display text-lg text-slate-900">{option.label}</h3>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{option.description}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </motion.aside>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={cn(
              'surface-panel relative overflow-hidden px-5 py-8 sm:px-8 sm:py-10 lg:px-10 lg:py-11',
              rightPanelClassName,
            )}
          >
            <div className="absolute inset-0 bg-hero-radial opacity-70" />
            <div className="relative space-y-8">
              <div className="xl:hidden">
                <LogoMark />
              </div>
              <div className="space-y-4">
                <div className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-700">
                  {eyebrow}
                </div>
                <div>
                  <h1 className="font-display text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl xl:text-[3.4rem]">
                    {title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-base leading-8 text-slate-600">{description}</p>
                </div>
              </div>
              {children}
              <div className="border-t border-slate-300 pt-6 text-sm text-slate-600">{footer}</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
