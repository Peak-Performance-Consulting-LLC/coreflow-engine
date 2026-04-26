import type { ReactNode } from 'react';

export type AppGuidePlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

export interface AppGuideStep {
  id: string;
  title: string;
  body: string;
  targetId?: string;
  placement?: AppGuidePlacement;
}

export interface AppPageGuide {
  key: string;
  title: string;
  summary: string;
  nextStep: string;
  highlights?: string[];
  steps: AppGuideStep[];
  autoStart?: 'off' | 'once';
}

export interface AppGuideContextValue {
  currentGuide: AppPageGuide | null;
  currentStep: AppGuideStep | null;
  currentStepIndex: number;
  totalSteps: number;
  walkthroughOpen: boolean;
  cardDismissed: boolean;
  walkthroughCompleted: boolean;
  setPageGuide: (guide: AppPageGuide | null) => void;
  startWalkthrough: (stepIndex?: number) => void;
  closeWalkthrough: () => void;
  nextStep: () => void;
  previousStep: () => void;
  markWalkthroughComplete: () => void;
  dismissCard: () => void;
}

const NOOP = () => undefined;

const EMPTY_GUIDE_CONTEXT: AppGuideContextValue = {
  currentGuide: null,
  currentStep: null,
  currentStepIndex: 0,
  totalSteps: 0,
  walkthroughOpen: false,
  cardDismissed: true,
  walkthroughCompleted: true,
  setPageGuide: NOOP,
  startWalkthrough: NOOP,
  closeWalkthrough: NOOP,
  nextStep: NOOP,
  previousStep: NOOP,
  markWalkthroughComplete: NOOP,
  dismissCard: NOOP,
};

export function AppGuideProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useAppGuideContext() {
  return EMPTY_GUIDE_CONTEXT;
}
