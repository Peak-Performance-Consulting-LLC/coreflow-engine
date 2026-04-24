import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { Tour, type StepType } from '@reactour/tour';
import { useLocation } from 'react-router-dom';
import { GuideTourContent } from '../components/guidance/GuideTourContent';
import { useAuth } from '../hooks/useAuth';

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

interface StoredGuidePreference {
  cardDismissed?: boolean;
  walkthroughCompleted?: boolean;
  autoStarted?: boolean;
  updatedAt?: string;
}

interface AppGuideContextValue {
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

const GUIDE_STORAGE_PREFIX = 'coreflow.app-guide';

const AppGuideContext = createContext<AppGuideContextValue | undefined>(undefined);

function buildStorageKey(scope: string, guideKey: string) {
  return `${GUIDE_STORAGE_PREFIX}.${scope}.${guideKey}`;
}

function readStoredPreference(scope: string, guideKey: string): StoredGuidePreference {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(buildStorageKey(scope, guideKey));
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as StoredGuidePreference;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredPreference(scope: string, guideKey: string, preference: StoredGuidePreference) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    buildStorageKey(scope, guideKey),
    JSON.stringify({
      ...preference,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function AppGuideProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, workspace } = useAuth();
  const [currentGuide, setCurrentGuide] = useState<AppPageGuide | null>(null);
  const [preference, setPreference] = useState<StoredGuidePreference>({});
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [tourActionsDisabled, setTourActionsDisabled] = useState(false);
  const autoStartTimerRef = useRef<number | null>(null);

  const storageScope = useMemo(() => {
    const workspaceScope = workspace?.id ?? 'public';
    const userScope = user?.id ?? 'anonymous';
    return `${userScope}.${workspaceScope}`;
  }, [user?.id, workspace?.id]);

  useEffect(() => {
    setCurrentGuide(null);
    setWalkthroughOpen(false);
    setCurrentStepIndex(0);
  }, [location.pathname]);

  useEffect(() => {
    if (!currentGuide) {
      setPreference({});
      return;
    }

    setPreference(readStoredPreference(storageScope, currentGuide.key));
  }, [currentGuide, storageScope]);

  useEffect(() => {
    if (autoStartTimerRef.current !== null) {
      window.clearTimeout(autoStartTimerRef.current);
      autoStartTimerRef.current = null;
    }

    if (!currentGuide || currentGuide.steps.length === 0 || currentGuide.autoStart === 'off') {
      return;
    }

    if (walkthroughOpen || preference.autoStarted || preference.walkthroughCompleted) {
      return;
    }

    autoStartTimerRef.current = window.setTimeout(() => {
      setCurrentStepIndex(0);
      setWalkthroughOpen(true);
      const nextPreference = { ...preference, autoStarted: true };
      setPreference(nextPreference);
      writeStoredPreference(storageScope, currentGuide.key, nextPreference);
    }, 450);

    return () => {
      if (autoStartTimerRef.current !== null) {
        window.clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
    };
  }, [currentGuide, preference, storageScope, walkthroughOpen]);

  const persistPreference = useCallback(
    (nextPreference: StoredGuidePreference | ((current: StoredGuidePreference) => StoredGuidePreference)) => {
      if (!currentGuide) {
        return;
      }

      setPreference((current) => {
        const resolved = typeof nextPreference === 'function' ? nextPreference(current) : nextPreference;
        writeStoredPreference(storageScope, currentGuide.key, resolved);
        return resolved;
      });
    },
    [currentGuide, storageScope],
  );

  const startWalkthrough = useCallback(
    (stepIndex = 0) => {
      if (!currentGuide || currentGuide.steps.length === 0) {
        return;
      }

      const safeStepIndex = Math.max(
        0,
        Math.min(stepIndex, currentGuide.steps.length - 1),
      );

      setCurrentStepIndex(safeStepIndex);
      setWalkthroughOpen(true);
      persistPreference((current) => ({ ...current, autoStarted: true, cardDismissed: true }));
    },
    [currentGuide, persistPreference],
  );

  const closeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    if (currentGuide) {
      persistPreference((current) => ({
        ...current,
        cardDismissed: true,
        autoStarted: true,
      }));
    }
  }, [currentGuide, persistPreference]);

  const markWalkthroughComplete = useCallback(() => {
    setWalkthroughOpen(false);
    if (currentGuide) {
      persistPreference((current) => ({
        ...current,
        walkthroughCompleted: true,
        autoStarted: true,
        cardDismissed: true,
      }));
    }
  }, [currentGuide, persistPreference]);

  const nextStep = useCallback(() => {
    if (!currentGuide) {
      return;
    }

    setCurrentStepIndex((current) => {
      if (current >= currentGuide.steps.length - 1) {
        setWalkthroughOpen(false);
        persistPreference((preferenceState) => ({
          ...preferenceState,
          walkthroughCompleted: true,
          autoStarted: true,
        }));
        return current;
      }

      return current + 1;
    });
  }, [currentGuide, persistPreference]);

  const previousStep = useCallback(() => {
    setCurrentStepIndex((current) => Math.max(0, current - 1));
  }, []);

  const dismissCard = useCallback(() => {
    if (!currentGuide) {
      return;
    }

    persistPreference((current) => ({ ...current, cardDismissed: true, autoStarted: true }));
  }, [currentGuide, persistPreference]);

  const value = useMemo<AppGuideContextValue>(
    () => ({
      currentGuide,
      currentStep: currentGuide?.steps[currentStepIndex] ?? null,
      currentStepIndex,
      totalSteps: currentGuide?.steps.length ?? 0,
      walkthroughOpen,
      cardDismissed: Boolean(preference.cardDismissed),
      walkthroughCompleted: Boolean(preference.walkthroughCompleted),
      setPageGuide: setCurrentGuide,
      startWalkthrough,
      closeWalkthrough,
      nextStep,
      previousStep,
      markWalkthroughComplete,
      dismissCard,
    }),
    [
      closeWalkthrough,
      currentGuide,
      currentStepIndex,
      dismissCard,
      markWalkthroughComplete,
      nextStep,
      preference.cardDismissed,
      preference.walkthroughCompleted,
      previousStep,
      startWalkthrough,
      walkthroughOpen,
    ],
  );

  const tourSteps = useMemo<StepType[]>(
    () =>
      currentGuide?.steps.map((step) => ({
        selector: step.targetId ? `[data-guide-id="${step.targetId}"]` : 'body',
        content: step.body,
        position: step.placement === 'center' ? 'center' : step.placement,
      })) ?? [],
    [currentGuide],
  );

  const handleTourOpenChange = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextOpen) => {
      const resolvedOpen = typeof nextOpen === 'function' ? nextOpen(walkthroughOpen) : nextOpen;

      if (resolvedOpen) {
        setWalkthroughOpen(true);
        return;
      }

      closeWalkthrough();
    },
    [closeWalkthrough, walkthroughOpen],
  );

  const handleTourStepChange = useCallback<Dispatch<SetStateAction<number>>>(
    (nextStep) => {
      if (!currentGuide || currentGuide.steps.length === 0) {
        setCurrentStepIndex(0);
        return;
      }

      setCurrentStepIndex((current) => {
        const resolvedStep = typeof nextStep === 'function' ? nextStep(current) : nextStep;

        return Math.max(0, Math.min(resolvedStep, currentGuide.steps.length - 1));
      });
    },
    [currentGuide],
  );

  return (
    <AppGuideContext.Provider value={value}>
      {children}
      {walkthroughOpen && tourSteps.length > 0 ? (
        <Tour
          steps={tourSteps}
          isOpen
          setIsOpen={handleTourOpenChange}
          currentStep={currentStepIndex}
          setCurrentStep={handleTourStepChange}
          disabledActions={tourActionsDisabled}
          setDisabledActions={setTourActionsDisabled}
          disableInteraction
          showNavigation={false}
          showPrevNextButtons={false}
          showCloseButton={false}
          showBadge={false}
          showDots={false}
          scrollSmooth
          padding={{
            mask: 8,
            popover: [16, 16],
            wrapper: 0,
          }}
          onClickMask={() => {
            closeWalkthrough();
          }}
          styles={{
            popover: (base) => ({
              ...base,
              zIndex: 130,
              padding: 0,
              backgroundColor: 'transparent',
              boxShadow: 'none',
              maxWidth: 'min(520px, calc(100vw - 2rem))',
              width: '100%',
              overflow: 'visible',
            }),
            maskWrapper: (base) => ({
              ...base,
              zIndex: 120,
            }),
            maskArea: (base) => ({
              ...base,
              fill: 'rgba(15,23,42,0.32)',
            }),
            highlightedArea: (base) => ({
              ...base,
              stroke: '#818cf8',
              strokeWidth: 2,
              fill: 'transparent',
              rx: 24,
            }),
          }}
          ContentComponent={GuideTourContent}
        />
      ) : null}
    </AppGuideContext.Provider>
  );
}

export function useAppGuideContext() {
  const context = useContext(AppGuideContext);

  if (!context) {
    throw new Error('useAppGuideContext must be used within an AppGuideProvider.');
  }

  return context;
}
