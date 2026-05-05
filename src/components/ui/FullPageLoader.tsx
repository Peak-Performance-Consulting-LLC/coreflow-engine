import { LoaderCircle } from 'lucide-react';
import { LogoMark } from './LogoMark';

type LoaderVariant = 'app' | 'auth';

interface FullPageLoaderProps {
  label?: string;
  variant?: LoaderVariant;
}

export function FullPageLoader({ label = 'Loading CoreFlow...', variant = 'app' }: FullPageLoaderProps) {
  if (variant === 'auth') {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-[#EEF0F7] px-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-card">
          <LogoMark />
          <div className="flex h-14 w-14 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-600">
            <LoaderCircle className="h-6 w-6 animate-spin" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-semibold text-slate-900">Preparing your workspace</h1>
            <p className="text-sm text-slate-500">{label}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4">
      <div className="pointer-events-none absolute -left-20 top-16 h-64 w-64 rounded-full bg-indigo-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-64 w-64 rounded-full bg-cyan-100/60 blur-3xl" />

      <div className="relative w-full max-w-sm rounded-2xl border border-slate-200/90 bg-white/95 px-5 py-4 shadow-md backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-600">
            <LoaderCircle className="h-4 w-4 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">CoreFlow</p>
            <p className="truncate text-sm text-slate-700">{label}</p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Syncing</span>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-400" />
        </div>
      </div>
    </div>
  );
}
