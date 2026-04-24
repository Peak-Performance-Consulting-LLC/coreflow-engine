import { type PopoverContentProps } from '@reactour/tour';
import { ArrowLeft, ArrowRight, CheckCircle2, X } from 'lucide-react';
import { useAppGuide } from '../../hooks/useAppGuide';
import { Button } from '../ui/Button';

export function GuideTourContent(_: PopoverContentProps) {
  const {
    currentGuide,
    currentStep,
    currentStepIndex,
    totalSteps,
    closeWalkthrough,
    nextStep,
    previousStep,
    markWalkthroughComplete,
  } = useAppGuide();

  if (!currentGuide || !currentStep) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-5 shadow-[0_26px_80px_rgba(15,23,42,0.24)] ring-1 ring-black/5 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.06),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(59,130,246,0.05),transparent_38%)]" />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-3">
            <div className="inline-flex rounded-full border border-indigo-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.28em] text-indigo-700">
              Step guide
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {currentGuide.title}
              </div>
              <h3 className="mt-2 font-display text-[2rem] leading-[1.02] tracking-[-0.03em] text-slate-950">
                {currentStep.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={closeWalkthrough}
            className="inline-flex h-12 w-12 items-center justify-center rounded-[20px] border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close walkthrough"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-[1.02rem] leading-8 text-slate-700">{currentStep.body}</p>

        <div className="mt-5 flex items-center gap-2">
          {Array.from({ length: totalSteps }, (_, index) => (
            <span
              key={`${currentGuide.key}-step-${index + 1}`}
              className={`h-2 rounded-full transition-all ${
                index === currentStepIndex ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200'
              }`}
            />
          ))}
          <span className="ml-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
            {currentStepIndex + 1} of {totalSteps}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={previousStep}
              disabled={currentStepIndex === 0}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            {currentStepIndex === totalSteps - 1 ? (
              <Button type="button" size="sm" onClick={markWalkthroughComplete}>
                <CheckCircle2 className="h-4 w-4" />
                Finish
              </Button>
            ) : (
              <Button type="button" size="sm" onClick={nextStep}>
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={closeWalkthrough}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            Close walkthrough
          </button>
        </div>
      </div>
    </div>
  );
}
