import { BookOpenText, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useAppGuide } from '../../hooks/useAppGuide';

export function GuideLauncherButton() {
  const { currentGuide, walkthroughCompleted, startWalkthrough } = useAppGuide();

  if (!currentGuide) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 sm:bottom-6 sm:right-6">
      <motion.button
        type="button"
        data-guide-id="global-guide-launcher"
        initial={{ opacity: 0, y: 18, scale: 0.96, filter: 'blur(6px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: 12, scale: 0.96, filter: 'blur(5px)' }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        whileHover={{ y: -2, scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => startWalkthrough(0)}
        className="pointer-events-auto inline-flex min-w-[200px] max-w-[232px] items-center gap-2.5 rounded-full border border-indigo-200/80 bg-white/95 px-2.5 py-2 pr-3 text-left shadow-[0_18px_38px_rgba(99,102,241,0.14)] backdrop-blur-[18px] transition hover:shadow-[0_24px_44px_rgba(99,102,241,0.18)] sm:min-w-[216px] sm:max-w-[244px]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 via-indigo-500 to-sky-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.18)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-semibold uppercase tracking-[0.22em] text-indigo-700">Guide</span>
          <span className="mt-0.5 block max-w-[138px] truncate text-[0.85rem] leading-tight tracking-[-0.015em] text-slate-900 sm:max-w-[150px] sm:text-[0.9rem]">
            {walkthroughCompleted ? currentGuide.title : currentGuide.title}
          </span>
          <span className="mt-0.5 block text-[11px] text-slate-500">
            {walkthroughCompleted ? 'Replay tour' : 'Open page guide'}
          </span>
        </span>
        <BookOpenText className="hidden h-3.5 w-3.5 shrink-0 text-slate-400 sm:block" />
      </motion.button>
    </div>,
    document.body,
  );
}
