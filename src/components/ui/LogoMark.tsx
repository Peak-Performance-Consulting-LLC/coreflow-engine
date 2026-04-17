import { cn } from '../../lib/utils';

interface LogoMarkProps {
  className?: string;
  showSubtitle?: boolean;
  theme?: 'light' | 'dark';
}

export function LogoMark({ className, showSubtitle = true, theme = 'light' }: LogoMarkProps) {
  const isDark = theme === 'dark';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn('relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl', isDark ? 'shadow-none' : 'shadow-glow')}>
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700" />
        <div className="absolute inset-[1.5px] rounded-[10px] bg-white/10" />
        <svg
          className="relative h-5 w-5 text-white"
          viewBox="0 0 20 20"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 6.5C13 5.5 11.5 5 10 5C7.2 5 5 7.2 5 10C5 12.8 7.2 15 10 15C11.5 15 13 14.5 14 13.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div>
        <div className={cn('font-display text-[15px] font-semibold leading-tight', isDark ? 'text-white' : 'text-slate-900')}>CoreFlow</div>
        {showSubtitle ? (
          <div className={cn('text-[10px] uppercase tracking-widest', isDark ? 'text-slate-500' : 'text-slate-400')}>Shared CRM Platform</div>
        ) : null}
      </div>
    </div>
  );
}
