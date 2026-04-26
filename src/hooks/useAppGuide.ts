import { useEffect } from 'react';
import { type AppPageGuide, useAppGuideContext } from '../context/AppGuideContext';

export function useAppGuide() {
  return useAppGuideContext();
}

export function usePageGuide(_guide: AppPageGuide | null) {
  useEffect(() => undefined, []);
}
