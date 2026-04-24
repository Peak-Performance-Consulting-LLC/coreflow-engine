import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { Fingerprint, KeyRound } from 'lucide-react';
import { crmOptions } from '../../lib/constants';
import { LogoMark } from '../ui/LogoMark';
import { cn } from '../../lib/utils';

const smoothEase = [0.21, 0.47, 0.32, 0.98] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.15,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.45, ease: smoothEase },
  },
};

export function SigninValuePanel() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative space-y-8"
    >
      <motion.div
        className="absolute -right-14 -top-14 h-64 w-64 rounded-full bg-gradient-to-r from-cyan-400/20 to-indigo-500/20 blur-3xl"
        animate={{
          scale: [1, 1.16, 1],
          opacity: [0.25, 0.45, 0.25],
        }}
        transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="absolute left-[12%] h-px w-36 bg-gradient-to-r from-transparent via-indigo-500/45 to-transparent"
            style={{ top: `${24 + index * 20}%` }}
            animate={{
              x: ['-35%', '220%'],
              opacity: [0, 0.8, 0],
            }}
            transition={{
              duration: 3.2 + index * 0.35,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.55,
            }}
          />
        ))}
      </div>

      <motion.div variants={itemVariants} className="relative">
        <LogoMark />
      </motion.div>

      <div className="relative space-y-4">
        <motion.div
          variants={itemVariants}
          className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-700 shadow-sm backdrop-blur-sm"
        >
          <motion.div
            animate={{ scale: [1, 1.22, 1], rotate: [0, 10, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Fingerprint className="h-3.5 w-3.5" />
          </motion.div>
          Secure access
        </motion.div>

        <motion.h2
          variants={itemVariants}
          className="max-w-xl font-display text-4xl font-bold leading-tight text-slate-950 2xl:text-[2.7rem]"
        >
          Pick up right where your workspace left off
        </motion.h2>

        <motion.p variants={itemVariants} className="max-w-xl text-base leading-7 text-slate-700">
          Sign in once and CoreFlow restores the right CRM dashboard, workspace context, and saved session.
        </motion.p>
      </div>

      <motion.div variants={containerVariants} className="relative grid gap-3.5 sm:grid-cols-2">
        {crmOptions.slice(0, 4).map((option, index) => {
          const Icon = option.icon;

          return (
            <motion.div
              key={option.value}
              variants={itemVariants}
              animate={{ y: [0, index % 2 === 0 ? -8 : 8, 0] }}
              whileHover={{ scale: 1.03, y: -6 }}
              transition={{
                y: {
                  duration: 3.8 + index * 0.35,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: index * 0.18,
                },
                scale: { duration: 0.2 },
              }}
              className="group relative overflow-hidden rounded-[24px] border border-white/70 bg-white/55 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:bg-white/75 hover:shadow-md"
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-30', option.accent)} />
              <div className="absolute inset-[1px] rounded-[23px] bg-white/70" />
              <div className="relative z-10">
                <motion.div
                  whileHover={{ rotate: 360, scale: 1.08 }}
                  transition={{ duration: 0.35 }}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/80 text-indigo-700 shadow-sm backdrop-blur-sm"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </motion.div>
                <h3 className="mt-3 font-display text-base font-semibold text-slate-900">{option.label}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-600">{option.description}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.02 }}
        className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="relative z-10 flex items-center gap-3 text-sm font-medium text-slate-700">
          <KeyRound className="h-4 w-4 text-indigo-700" />
          Your saved workspace opens after sign-in.
        </div>
      </motion.div>
    </motion.div>
  );
}
