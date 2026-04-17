import { LoaderCircle } from 'lucide-react';
import { LogoMark } from './LogoMark';

export function FullPageLoader({ label = 'Loading CoreFlow...' }: { label?: string }) {
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
