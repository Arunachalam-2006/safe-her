import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { storageGet, storageSet } from './storage';

/**
 * First-run onboarding state.
 *
 * Persisted through the shared `lib/storage` helper so it works with
 * AsyncStorage on native and localStorage on web.
 */
const ONBOARDING_KEY = 'safeher_onboarding_completed_v1';

export async function readOnboardingCompleted() {
  const stored = await storageGet(ONBOARDING_KEY, false);
  return stored === true;
}

export async function writeOnboardingCompleted(value = true) {
  await storageSet(ONBOARDING_KEY, value === true);
  return value === true;
}

const OnboardingContext = createContext({
  ready: false,
  completed: false,
  markComplete: async () => false,
  reset: async () => false,
});

export function OnboardingProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let active = true;

    readOnboardingCompleted()
      .then((value) => {
        if (!active) return;
        setCompleted(value);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        setCompleted(false);
        setReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  // Optimistic update so the root gate can route away immediately, then persist.
  const markComplete = useCallback(async () => {
    setCompleted(true);
    setReady(true);
    await writeOnboardingCompleted(true);
    return true;
  }, []);

  const reset = useCallback(async () => {
    setCompleted(false);
    await writeOnboardingCompleted(false);
    return false;
  }, []);

  const value = useMemo(
    () => ({ ready, completed, markComplete, reset }),
    [ready, completed, markComplete, reset]
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
