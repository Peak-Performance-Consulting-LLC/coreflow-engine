// AuthLayout.tsx
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import type { Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { crmOptions } from '../../lib/constants';
import { GuideHelperCard } from '../guidance/GuideHelperCard';
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

const smoothEase = [0.21, 0.47, 0.32, 0.98] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: smoothEase },
  },
};

export function AuthLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  leftPanel,
  rightPanelClassName,
}: AuthLayoutProps) {
  const { scrollY } = useScroll();
  const leftPanelFollowY = useSpring(useTransform(scrollY, [0, 900], [0, 96]), {
    stiffness: 90,
    damping: 22,
    mass: 0.4,
  });

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <AnimatedBackground />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1480px] items-center px-6 py-8 sm:px-8 lg:px-10">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          className="grid w-full items-start gap-8 xl:grid-cols-[1fr_1fr] 2xl:gap-10"
        >
          <motion.aside
            variants={itemVariants}
            className="hidden self-start rounded-[40px] border border-white/30 bg-white/15 backdrop-blur-xl shadow-2xl xl:sticky xl:top-6 xl:flex xl:max-h-[calc(100vh-3rem)] xl:flex-col xl:overflow-hidden"
            style={{
              y: leftPanelFollowY,
              background: 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.08) 100%)',
            }}
          >
            <div className="absolute inset-0 rounded-[40px] bg-gradient-to-br from-accent-blue/10 to-transparent" />
            {leftPanel ? (
              <div className="relative p-7 sm:p-8 lg:p-9 2xl:p-10">
                {leftPanel}
              </div>
            ) : (
              <div className="relative p-10 lg:p-12">
                <motion.div variants={itemVariants} className="space-y-12">
                  <LogoMark />
                  <div className="space-y-5">
                    <motion.div
                      variants={itemVariants}
                      className="inline-flex rounded-full border border-accent-blue/40 bg-accent-blue/25 px-5 py-1.5 text-xs font-semibold uppercase tracking-[0.28em] text-accent-blue backdrop-blur-sm"
                    >
                      Shared onboarding flow
                    </motion.div>
                    <motion.h2
                      variants={itemVariants}
                      className="font-display text-4xl font-semibold leading-tight text-white"
                    >
                      Premium entry into a multi-industry CRM platform.
                    </motion.h2>
                    <motion.p
                      variants={itemVariants}
                      className="max-w-xl text-base leading-8 text-white/90"
                    >
                      Sign in or create your account, launch your workspace, and route into the dashboard that matches
                      your selected CRM mode.
                    </motion.p>
                  </div>
                </motion.div>

                <motion.div
                  variants={containerVariants}
                  className="mt-12 grid gap-5 sm:grid-cols-2"
                >
                  {crmOptions.slice(0, 4).map((option) => {
                    const Icon = option.icon;

                    return (
                      <motion.div
                        key={option.value}
                        variants={itemVariants}
                        whileHover={{ scale: 1.02, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="group relative overflow-hidden rounded-[28px] border border-white/25 bg-white/15 p-5 backdrop-blur-sm transition-all duration-300 hover:bg-white/25"
                      >
                        <div className="relative z-10">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/30 bg-white/25 text-accent-blue backdrop-blur-sm group-hover:scale-110 transition-transform duration-300">
                            <Icon className="h-5 w-5" />
                          </div>
                          <h3 className="mt-4 font-display text-lg font-semibold text-white">{option.label}</h3>
                          <p className="mt-1.5 text-sm leading-6 text-white/80">{option.description}</p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-r from-accent-blue/0 to-accent-blue/15 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      </motion.div>
                    );
                  })}
                </motion.div>
              </div>
            )}
          </motion.aside>

          <motion.div
            variants={itemVariants}
            className={cn(
              'surface-panel relative overflow-hidden rounded-[32px] border border-white/25 bg-white shadow-2xl',
              rightPanelClassName,
            )}
          >
            <motion.div
              className="absolute inset-0 bg-gradient-to-br from-accent-blue/[0.08] via-transparent to-purple-500/[0.08]"
              animate={{
                opacity: [0.4, 0.7, 0.4],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-gradient-to-br from-accent-blue/15 to-purple-500/15 blur-3xl" />
            <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-gradient-to-tr from-cyan-500/15 to-accent-blue/15 blur-3xl" />
            <div className="relative p-5 sm:p-7 md:p-8 lg:p-8">
              <motion.div variants={containerVariants} className="relative space-y-4">
                <motion.div variants={itemVariants} className="xl:hidden">
                  <LogoMark />
                </motion.div>
                <div className="space-y-3">
                  <motion.div
                    variants={itemVariants}
                    className="inline-flex rounded-full border border-slate-200 bg-white/90 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-700 backdrop-blur-sm shadow-sm"
                  >
                    {eyebrow}
                  </motion.div>
                  <div>
                    <motion.h1
                      variants={itemVariants}
                      className="font-display bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-4xl lg:text-5xl xl:text-[3.1rem]"
                    >
                      {title}
                    </motion.h1>
                    <motion.p
                      variants={itemVariants}
                      className="mt-2 max-w-2xl text-base leading-7 text-slate-700"
                    >
                      {description}
                    </motion.p>
                  </div>
                </div>
                {children}
                <motion.div
                  variants={itemVariants}
                  className="border-t border-slate-200 pt-3 text-xs leading-5 text-slate-600"
                >
                  {footer}
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
