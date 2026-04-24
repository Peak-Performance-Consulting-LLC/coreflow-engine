import { motion } from 'framer-motion';
import type { Variants } from 'framer-motion';
import { BadgeCheck, Bot, Sparkles, Users, ArrowRight } from 'lucide-react';
import { LogoMark } from '../ui/LogoMark';

const valueBullets = [
  {
    title: 'Capture leads automatically',
    icon: BadgeCheck,
    gradient: 'from-emerald-500/30 to-emerald-600/20',
    delay: 0.1,
  },
  {
    title: 'Let AI answer calls 24/7',
    icon: Bot,
    gradient: 'from-blue-500/30 to-cyan-600/20',
    delay: 0.2,
  },
  {
    title: 'Organize customers and follow-ups in one place',
    icon: Users,
    gradient: 'from-purple-500/30 to-pink-600/20',
    delay: 0.3,
  },
];

const smoothEase = [0.21, 0.47, 0.32, 0.98] as const;

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
      delayChildren: 0.2,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, x: -30 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: smoothEase },
  },
};

export function SignupValuePanel() {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="relative space-y-8"
    >
      {/* Animated gradient orb */}
      <motion.div
        className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-gradient-to-r from-accent-blue/20 to-purple-500/20 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[32px]">
        {[
          'left-[9%] top-[28%] from-emerald-400 to-cyan-400',
          'right-[10%] top-[16%] from-fuchsia-400 to-indigo-500',
          'right-[18%] bottom-[31%] from-amber-300 to-pink-400',
        ].map((chip, index) => (
          <motion.span
            key={chip}
            className={`absolute h-2.5 w-8 rounded-full bg-gradient-to-r ${chip} opacity-60 blur-[0.2px]`}
            animate={{
              y: [0, index % 2 === 0 ? -14 : 14, 0],
              rotate: [index * 8, index % 2 === 0 ? 18 : -18, index * 8],
              scaleX: [1, 1.35, 1],
            }}
            transition={{
              duration: 3.4 + index * 0.6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      <motion.div variants={itemVariants} className="relative">
        <LogoMark />
      </motion.div>

      <div className="space-y-4 relative">
        <motion.div
          variants={itemVariants}
          className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-indigo-700 shadow-sm backdrop-blur-sm"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </motion.div>
          Get started
        </motion.div>
        <motion.h2
          variants={itemVariants}
          className="max-w-xl font-display text-4xl font-bold leading-tight text-slate-950 2xl:text-[2.7rem]"
        >
          Set up your AI-powered CRM in minutes
        </motion.h2>
        <motion.p
          variants={itemVariants}
          className="max-w-xl text-base leading-7 text-slate-700"
        >
          Create your account once and launch a workspace designed for your business type with guided onboarding.
        </motion.p>
      </div>

      <motion.div variants={containerVariants} className="relative space-y-3.5">
        {valueBullets.map((bullet) => {
          const Icon = bullet.icon;

          return (
            <motion.div
              key={bullet.title}
              variants={itemVariants}
              whileHover={{ scale: 1.02, x: 8 }}
              transition={{ duration: 0.2 }}
              className="group relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:bg-white/75 hover:shadow-md"
            >
              <div className="relative z-10 flex items-center gap-3.5">
                <motion.div
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.3 }}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-white/80 text-indigo-700 shadow-sm backdrop-blur-sm transition-all duration-300 group-hover:scale-110"
                >
                  <Icon className="h-5 w-5" />
                </motion.div>
                <span className="text-sm font-semibold leading-6 text-slate-800 transition-transform duration-300 group-hover:translate-x-1 2xl:text-base">
                  {bullet.title}
                </span>
                <ArrowRight className="ml-auto h-5 w-5 shrink-0 text-indigo-600 opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:opacity-100" />
              </div>
              <div
                className={`absolute inset-0 bg-gradient-to-r ${bullet.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />
            </motion.div>
          );
        })}
      </motion.div>

      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.02 }}
        className="relative overflow-hidden rounded-2xl border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-sm"
      >
        <div className="relative z-10 text-sm font-medium text-slate-700">
          Built for growing service businesses.
        </div>
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-accent-blue/15 to-transparent"
          initial={{ x: "-100%" }}
          whileHover={{ x: "100%" }}
          transition={{ duration: 0.6 }}
        />
      </motion.div>
    </motion.div>
  );
}
