import { BookOpenText, Sparkles, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppGuide } from '../../hooks/useAppGuide';
import { Button } from '../ui/Button';

interface GuideHelperCardProps {
  variant?: 'workspace' | 'auth';
}

export function GuideHelperCard({ variant = 'workspace' }: GuideHelperCardProps) {
  const {
    currentGuide,
    cardDismissed,
    walkthroughOpen,
    walkthroughCompleted,
    startWalkthrough,
    dismissCard,
  } = useAppGuide();

  if (!currentGuide || cardDismissed || walkthroughOpen) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentGuide.key}
        initial={{ opacity: 0, y: -18, scale: 0.985, filter: 'blur(8px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -14, scale: 0.985, filter: 'blur(6px)' }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className={`pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 ${
          variant === 'auth' ? 'top-6 sm:top-8' : 'top-20 sm:top-24'
        }`}
      >
        <div className="pointer-events-auto w-full max-w-[760px]">
          <div className="relative overflow-hidden rounded-[34px] border border-slate-200/85 bg-white/95 p-5 shadow-[0_20px_55px_rgba(99,102,241,0.12)] backdrop-blur-[18px] sm:p-6">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.08),transparent_34%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.08),transparent_32%)]" />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3.5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/80 bg-white px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-700 shadow-[0_8px_18px_rgba(99,102,241,0.05)]">
                    <Sparkles className="h-4 w-4" />
                    Page guide
                  </div>
                  <div className="space-y-2.5">
                    <h2 className="font-display text-[2.15rem] leading-[1.02] tracking-[-0.03em] text-slate-950 sm:text-[2.7rem]">
                      {currentGuide.title}
                    </h2>
                    <p className="max-w-2xl text-[1.05rem] leading-8 text-slate-600">{currentGuide.summary}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissCard}
                  className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] border border-slate-200 bg-white/96 text-slate-500 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition hover:bg-slate-50 hover:text-slate-800"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-6 rounded-[28px] border border-indigo-100/80 bg-white/90 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-indigo-600">What to do next</div>
                <p className="mt-3 text-[1.2rem] leading-9 tracking-[-0.015em] text-slate-700">{currentGuide.nextStep}</p>
              </div>

              {currentGuide.highlights?.length ? (
                <div className="mt-4.5 flex flex-wrap gap-2.5">
                  {currentGuide.highlights.map((highlight) => (
                    <span
                      key={highlight}
                      className="rounded-full border border-slate-200 bg-white/90 px-3.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600"
                    >
                      {highlight}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  className="h-13 rounded-[20px] bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 px-7 text-base shadow-[0_14px_28px_rgba(99,102,241,0.18)] hover:from-indigo-700 hover:via-indigo-600 hover:to-sky-600"
                  onClick={() => startWalkthrough(0)}
                >
                  <BookOpenText className="h-5 w-5" />
                  {walkthroughCompleted ? 'Replay Tour' : 'Start Tour'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="h-13 rounded-[20px] border-slate-200 bg-white/90 px-7 text-base"
                  onClick={dismissCard}
                >
                  Hide for now
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
