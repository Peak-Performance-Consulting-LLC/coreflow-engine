import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { crmOptions } from '../../lib/constants';
import { cn } from '../../lib/utils';
import type { CRMType } from '../../lib/types';

interface CRMSelectorProps {
  value: CRMType;
  onChange: (crmType: CRMType) => void;
  error?: string;
  title?: string;
  subtitle?: string;
  variant?: 'default' | 'launch';
}

export function CRMSelector({
  value,
  onChange,
  error,
  title = 'Choose your workspace template',
  subtitle = 'Select the setup that best matches your business',
  variant = 'default',
}: CRMSelectorProps) {
  const isLaunch = variant === 'launch';

  return (
    <div className={cn('space-y-2.5', isLaunch && 'space-y-3')}>
      <div className="flex items-center justify-between">
        <span className={cn('text-xs font-semibold text-slate-800', isLaunch && 'uppercase tracking-[0.18em] text-indigo-700')}>
          {title}
        </span>
        <span className={cn('text-xs text-slate-500', isLaunch && 'rounded-full bg-white/70 px-2 py-1 text-[10px] font-medium text-slate-600')}>
          {subtitle}
        </span>
      </div>
      <div className={cn('grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3', isLaunch && 'gap-3 xl:grid-cols-2')}>
        {crmOptions.map((option, index) => {
          const Icon = option.icon;
          const isSelected = option.value === value;

          return (
            <motion.button
              key={option.value}
              type="button"
              whileHover={isLaunch ? { y: -8, scale: 1.025, rotate: index % 2 === 0 ? -0.6 : 0.6 } : { y: -4, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              initial={isLaunch ? { opacity: 0, y: 22, rotate: index % 2 === 0 ? -2 : 2 } : { opacity: 0, y: 12 }}
              animate={
                isLaunch
                  ? {
                      opacity: 1,
                      y: [0, index % 2 === 0 ? -3 : 3, 0],
                      rotate: [0, index % 2 === 0 ? 0.45 : -0.45, 0],
                    }
                  : { opacity: 1, y: 0 }
              }
              transition={
                isLaunch
                  ? {
                      opacity: { delay: index * 0.06, duration: 0.35 },
                      y: { delay: index * 0.08, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
                      rotate: { delay: index * 0.08, duration: 2.4, repeat: Infinity, ease: 'easeInOut' },
                    }
                  : { delay: index * 0.05 }
              }
              onClick={() => onChange(option.value)}
              aria-pressed={isSelected}
              className={cn(
                'group relative overflow-hidden rounded-2xl border p-3 text-left transition',
                isLaunch && 'min-h-[112px] bg-white/75 shadow-sm backdrop-blur',
                isSelected
                  ? isLaunch
                    ? 'border-accent-blue/55 bg-white shadow-glow'
                    : 'border-accent-blue/45 bg-slate-50 shadow-glow'
                  : isLaunch
                    ? 'border-white/70 hover:border-indigo-200 hover:bg-white hover:shadow-panel'
                    : 'border-slate-300 bg-white hover:-translate-y-[2px] hover:border-indigo-200 hover:shadow-panel',
              )}
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-25', option.accent, isLaunch && 'opacity-35')} />
              {isLaunch && isSelected ? (
                <motion.span
                  className="absolute right-2 top-2 z-20 inline-flex h-7 w-7 items-center justify-center rounded-full border border-accent-blue/30 bg-white text-accent-blue shadow-sm"
                  animate={{ rotate: [0, -10, 10, 0], scale: [1, 1.1, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 1 }}
                  aria-label="Selected"
                >
                  <CheckCircle2 className="h-4 w-4" />
                </motion.span>
              ) : null}
              {isLaunch ? (
                <>
                  <motion.div
                    className="absolute -inset-10 bg-[conic-gradient(from_0deg,transparent,rgba(79,70,229,0.28),transparent,rgba(34,211,238,0.22),transparent)] opacity-0 blur-sm transition-opacity duration-300 group-hover:opacity-100"
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                  />
                  <motion.div
                    className="absolute bottom-3 right-3 h-2 w-2 rounded-full bg-indigo-400/60 shadow-[0_0_14px_rgba(99,102,241,0.5)]"
                    animate={{ scale: [0.7, 1.45, 0.7], opacity: [0.25, 0.85, 0.25] }}
                    transition={{ duration: 1.8 + index * 0.12, repeat: Infinity, ease: 'easeInOut', delay: index * 0.16 }}
                  />
                </>
              ) : null}
              <div className={cn('absolute inset-[1px] rounded-[15px]', isSelected ? 'bg-slate-50' : 'bg-white', isLaunch && 'bg-white/[0.82]')} />
              <div className={cn('relative space-y-2', isLaunch && 'flex h-full gap-3 space-y-0')}>
                <div className={cn('flex items-center justify-between', isLaunch && 'shrink-0 items-start')}>
                  <motion.div
                    animate={isLaunch && isSelected ? { rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] } : undefined}
                    transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-xl border text-accent-blue transition',
                      isLaunch && 'shadow-sm',
                      isSelected ? 'border-accent-blue/30 bg-accent-blue/10' : 'border-slate-300 bg-slate-50',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </motion.div>
                  {!isLaunch && isSelected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent-blue/30 bg-accent-blue/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-blue">
                      <CheckCircle2 className="h-3 w-3" />
                      Selected
                    </span>
                  ) : null}
                </div>
                <div className={cn('min-w-0 flex-1', isLaunch && isSelected && 'pr-6')}>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={cn('font-display text-base font-semibold text-slate-900', isLaunch && 'text-sm leading-5 pr-1')}>
                      {option.label}
                    </h3>
                  </div>
                  <p className={cn('mt-1 text-xs leading-5 text-slate-600', isLaunch && 'leading-4')}>
                    {option.description}
                  </p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
