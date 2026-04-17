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
}

export function CRMSelector({
  value,
  onChange,
  error,
  title = 'Choose your workspace template',
  subtitle = 'Select the setup that best matches your business',
}: CRMSelectorProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-800">{title}</span>
        <span className="text-xs text-slate-500">{subtitle}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {crmOptions.map((option, index) => {
          const Icon = option.icon;
          const isSelected = option.value === value;

          return (
            <motion.button
              key={option.value}
              type="button"
              whileHover={{ y: -4, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onChange(option.value)}
              aria-pressed={isSelected}
              className={cn(
                'group relative overflow-hidden rounded-[26px] border p-5 text-left transition',
                isSelected
                  ? 'border-accent-blue/45 bg-slate-50 shadow-glow'
                  : 'border-slate-300 bg-white hover:-translate-y-[2px] hover:border-indigo-200 hover:shadow-panel',
              )}
            >
              <div className={cn('absolute inset-0 bg-gradient-to-br opacity-25', option.accent)} />
              <div className={cn('absolute inset-[1px] rounded-[25px]', isSelected ? 'bg-slate-50' : 'bg-white')} />
              <div className="relative space-y-3">
                <div className="flex items-center justify-between">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-2xl border text-accent-blue transition',
                      isSelected ? 'border-accent-blue/30 bg-accent-blue/10' : 'border-slate-300 bg-slate-50',
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  {isSelected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent-blue/30 bg-accent-blue/12 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-blue">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Selected
                    </span>
                  ) : null}
                </div>
                <div>
                  <h3 className="font-display text-xl font-semibold text-slate-900">{option.label}</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{option.description}</p>
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
