import { useEffect, useRef } from 'react';
import { type AppPageGuide, useAppGuideContext } from '../context/AppGuideContext';

export function useAppGuide() {
  return useAppGuideContext();
}

function areGuidesEqual(left: AppPageGuide | null, right: AppPageGuide | null) {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  if (
    left.key !== right.key ||
    left.title !== right.title ||
    left.summary !== right.summary ||
    left.nextStep !== right.nextStep ||
    left.autoStart !== right.autoStart
  ) {
    return false;
  }

  const leftHighlights = left.highlights ?? [];
  const rightHighlights = right.highlights ?? [];

  if (
    leftHighlights.length !== rightHighlights.length ||
    leftHighlights.some((highlight, index) => highlight !== rightHighlights[index])
  ) {
    return false;
  }

  if (left.steps.length !== right.steps.length) {
    return false;
  }

  return left.steps.every((step, index) => {
    const nextStep = right.steps[index];

    return (
      step.id === nextStep.id &&
      step.title === nextStep.title &&
      step.body === nextStep.body &&
      step.targetId === nextStep.targetId &&
      step.placement === nextStep.placement
    );
  });
}

export function usePageGuide(guide: AppPageGuide | null) {
  const { setPageGuide } = useAppGuideContext();
  const previousGuideRef = useRef<AppPageGuide | null>(null);

  useEffect(() => {
    if (areGuidesEqual(previousGuideRef.current, guide)) {
      return;
    }

    previousGuideRef.current = guide;
    setPageGuide(guide);
  }, [guide, setPageGuide]);

  useEffect(
    () => () => {
      previousGuideRef.current = null;
      setPageGuide(null);
    },
    [setPageGuide],
  );
}
