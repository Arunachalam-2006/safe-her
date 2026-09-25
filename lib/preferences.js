/**
 * User preferences — alert & privacy controls.
 * Persisted via the cross-platform storage layer (AsyncStorage / localStorage).
 */

import { useState, useEffect, useCallback } from 'react';
import { storageGet, storageSet } from './storage';

const KEY = 'safeher_preferences_v1';

export const DEFAULT_PREFS = {
  // Safety alerts
  safetyAlerts: true,          // master switch for in-app safety notifications
  lowLightAlerts: true,        // warn when area lighting is poor
  patrolAlerts: true,          // surface nearby police / safe-hub info
  // Privacy
  anonymousReports: true,      // strip identity from community reports
  preciseLocation: true,       // share precise (vs approximate) coordinates
  shareLocationInSOSOnly: true // only broadcast location during an active SOS
};

let cache = { ...DEFAULT_PREFS };
let loaded = false;
const listeners = new Set();

export async function loadPreferences() {
  const saved = await storageGet(KEY, null);
  if (saved && typeof saved === 'object') {
    cache = { ...DEFAULT_PREFS, ...saved };
  }
  loaded = true;
  return cache;
}

export function getPreferences() {
  return cache;
}

export async function setPreference(key, value) {
  cache = { ...cache, [key]: value };
  await storageSet(KEY, cache);
  listeners.forEach((l) => l(cache));
  return cache;
}

export function subscribePreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** React hook: returns { prefs, update(key, value), ready }. */
export function usePreferences() {
  const [prefs, setPrefs] = useState(cache);
  const [ready, setReady] = useState(loaded);

  useEffect(() => {
    let mounted = true;
    loadPreferences().then((p) => {
      if (mounted) {
        setPrefs({ ...p });
        setReady(true);
      }
    });
    const unsub = subscribePreferences((p) => setPrefs({ ...p }));
    return () => { mounted = false; unsub(); };
  }, []);

  const update = useCallback((key, value) => setPreference(key, value), []);
  return { prefs, update, ready };
}
