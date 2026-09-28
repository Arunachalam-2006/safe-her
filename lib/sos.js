import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { getEmergencyContacts } from './emergencyContacts';
import { storageGet, storageSet, storageRemove } from './storage';
import { getExpoCurrentLocation } from './location';
import { apiFetch } from './config';
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
  LATEST_LOCATION_KEY,
  TASK_STATE_KEY,
} from './backgroundLocationTask';

/**
 * Push an active SOS to the safety engine so officers can see it.
 *
 * Added because SOS was previously entirely local: `lib/sos.js` contained no
 * network call whatsoever, so `POST /government/sos` was never called and the
 * officer dashboard could never receive a real alert. Best-effort by design —
 * a failure here must not stop the local SOS from running.
 */
async function transmitSOSAlert(sessionId, location, contactCount) {
  const response = await apiFetch('/government/sos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      lat: location.latitude,
      lng: location.longitude,
      accuracy: location.accuracy ?? null,
      contact_count: contactCount,
      status: 'ACTIVE',
      notes: 'Emergency SOS activated by the citizen app',
    }),
    timeoutMs: 6000,
  });
  if (!response.ok) {
    throw new Error(`SOS uplink failed (${response.status})`);
  }
  return response.json();
}

export const SOS_STATUS = {
  IDLE: 'IDLE',
  CONFIRMING: 'CONFIRMING',
  COUNTDOWN: 'COUNTDOWN',
  ACTIVATING: 'ACTIVATING',
  ACTIVE: 'ACTIVE',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  ERROR: 'ERROR',
};

export const LOCATION_STATUS = {
  UNKNOWN: 'UNKNOWN',
  REQUESTING: 'REQUESTING',
  AVAILABLE: 'AVAILABLE',
  UNAVAILABLE: 'UNAVAILABLE',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
};

export const TRACKING_STATUS = {
  INACTIVE: 'INACTIVE',
  STARTING: 'STARTING',
  ACTIVE: 'ACTIVE',
  UNAVAILABLE: 'UNAVAILABLE',
};

const SOS_SESSION_KEY = 'safeher_sos_active_session_v1';

/**
 * A restored SOS session is auto-resolved after this long. Without an expiry a
 * session left ACTIVE stayed ACTIVE across every app restart indefinitely, and
 * the only way to clear it was to open the SOS panel.
 */
const SOS_MAX_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

const initialState = {
  status: SOS_STATUS.IDLE,
  countdownValue: 3,
  countdownRunning: false,
  sessionId: null,
  startedAt: null,
  location: null,
  locationStatus: LOCATION_STATUS.UNKNOWN,
  locationUpdatedAt: null,
  trackingStatus: TRACKING_STATUS.INACTIVE,
  contactCount: 0,
  contacts: [],
  error: null,
  shareStatus: null,
};

const SOSContext = createContext({
  ...initialState,
  requestSOS: () => {},
  cancelConfirmation: () => {},
  startCountdown: () => {},
  cancelCountdown: () => {},
  activateSOS: () => {},
  stopSOS: () => {},
  dismissStopped: () => {},
  setShareStatus: () => {},
});

export function SOSProvider({ children }) {
  const [state, setState] = useState(initialState);
  const countdownTimerRef = useRef(null);
  const countdownValueRef = useRef(3);
  // Mirrors of state so the stop/activate callbacks (which must not re-create
  // on every state change) can read the current session id and contact count.
  const stateRef = useRef(state);
  const contactCountRef = useRef(0);
  // Lets the countdown timer (declared above) reach activateInternal (declared
  // below) without a temporal-dead-zone reference.
  const activateInternalRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
    contactCountRef.current = state.contactCount ?? 0;
  }, [state]);

  const clearCountdownTimer = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  };

  const loadContacts = useCallback(async () => {
    try {
      const list = await getEmergencyContacts();
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const contacts = await loadContacts();
      const saved = await storageGet(SOS_SESSION_KEY, null);
      if (cancelled) return;

      if (saved && saved.sessionId && saved.status === SOS_STATUS.ACTIVE) {
        // An ACTIVE session used to be restored forever: no expiry, no max
        // duration, and background tracking was never re-registered even
        // though the OS may have dropped the task. A session that is older than
        // SOS_MAX_DURATION_MS is treated as finished and cleared.
        const age = Date.now() - (saved.startedAt || 0);
        if (age > SOS_MAX_DURATION_MS) {
          await storageSet(SOS_SESSION_KEY, null);
          try {
            await storageRemove(LATEST_LOCATION_KEY);
            await storageRemove(TASK_STATE_KEY);
          } catch {}
          // Tell the engine the stale alert is over.
          try {
            await apiFetch(`/government/sos/${encodeURIComponent(saved.sessionId)}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'RESOLVED',
                notes: 'Auto-resolved: session exceeded the maximum duration',
              }),
              timeoutMs: 5000,
            });
          } catch {
            /* best effort */
          }
          setState((prev) => ({ ...prev, contactCount: contacts.length, contacts }));
          return;
        }

        setState((prev) => ({
          ...prev,
          status: SOS_STATUS.ACTIVE,
          sessionId: saved.sessionId,
          startedAt: saved.startedAt,
          location: saved.location || null,
          locationUpdatedAt: saved.locationUpdatedAt || null,
          // Never claim tracking is active purely because a flag was persisted
          // earlier - the OS may have killed the task since then.
          trackingStatus: TRACKING_STATUS.UNAVAILABLE,
          contactCount: contacts.length,
          contacts,
        }));

        // Re-register the background task so a restored session actually tracks.
        try {
          if (Platform.OS !== 'web') {
            await startBackgroundLocationUpdates();
          }
        } catch {
          /* best effort */
        }
      } else {
        setState((prev) => ({ ...prev, contactCount: contacts.length, contacts }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadContacts]);

  const refreshContactCount = useCallback(async () => {
    const contacts = await loadContacts();
    setState((prev) => ({ ...prev, contactCount: contacts.length, contacts }));
  }, [loadContacts]);

  const requestSOS = useCallback(() => {
    countdownValueRef.current = 3;
    clearCountdownTimer();
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.CONFIRMING,
      countdownValue: 3,
      countdownRunning: false,
      error: null,
      shareStatus: null,
    }));
  }, []);

  const cancelConfirmation = useCallback(() => {
    clearCountdownTimer();
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.IDLE,
      countdownValue: 3,
      countdownRunning: false,
      error: null,
    }));
  }, []);

  const startCountdown = useCallback(async () => {
    const contacts = await loadContacts();
    if (contacts.length === 0) {
      setState((prev) => ({
        ...prev,
        status: SOS_STATUS.ERROR,
        error: 'Add at least one emergency contact before activating SOS.',
      }));
      return;
    }

    countdownValueRef.current = 3;
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.COUNTDOWN,
      countdownValue: 3,
      countdownRunning: true,
      contactCount: contacts.length,
      contacts,
      error: null,
    }));

    clearCountdownTimer();
    countdownTimerRef.current = setInterval(() => {
      countdownValueRef.current -= 1;
      if (countdownValueRef.current <= 0) {
        clearCountdownTimer();
        // Deferred through the ref: `activateInternal` is a `const` declared
        // BELOW this callback. Referencing it directly relied on the countdown
        // never firing before the component finished rendering, which is a
        // temporal-dead-zone hazard ESLint flags as a real error.
        activateInternalRef.current?.();
      } else {
        setState((prev) => ({ ...prev, countdownValue: countdownValueRef.current }));
      }
    }, 1000);
  }, [loadContacts]);

  const cancelCountdown = useCallback(() => {
    clearCountdownTimer();
    countdownValueRef.current = 3;
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.CONFIRMING,
      countdownValue: 3,
      countdownRunning: false,
    }));
  }, []);

  const activateInternal = useCallback(async () => {
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.ACTIVATING,
      locationStatus: LOCATION_STATUS.REQUESTING,
      trackingStatus: TRACKING_STATUS.STARTING,
      countdownRunning: false,
    }));

    let locResult = null;
    try {
      const res = await getExpoCurrentLocation();
      if (res && res.ok) {
        locResult = { latitude: res.latitude, longitude: res.longitude, accuracy: res.accuracy };
        setState((prev) => ({
          ...prev,
          location: locResult,
          locationStatus: LOCATION_STATUS.AVAILABLE,
          locationUpdatedAt: Date.now(),
        }));
      } else {
        setState((prev) => ({
          ...prev,
          locationStatus: res?.permissionDenied ? LOCATION_STATUS.PERMISSION_DENIED : LOCATION_STATUS.UNAVAILABLE,
          error: res?.message || 'Location unavailable. Alert will include last known coordinates if available.',
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        locationStatus: LOCATION_STATUS.UNAVAILABLE,
      }));
    }

    let trackingStarted = false;
    try {
      if (Platform.OS !== 'web') {
        trackingStarted = await startBackgroundLocationUpdates();
      }
    } catch (err) {
      trackingStarted = false;
    }

    const sessionId = `sos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      sessionId,
      status: SOS_STATUS.ACTIVE,
      startedAt: Date.now(),
      location: locResult,
      locationUpdatedAt: Date.now(),
      trackingStatus: trackingStarted ? TRACKING_STATUS.ACTIVE : TRACKING_STATUS.UNAVAILABLE,
    };
    await storageSet(SOS_SESSION_KEY, session);

    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.ACTIVE,
      sessionId,
      startedAt: session.startedAt,
      trackingStatus: trackingStarted ? TRACKING_STATUS.ACTIVE : TRACKING_STATUS.UNAVAILABLE,
    }));

    // Report the alert to the engine so the officer dashboard can see it.
    // Previously SOS was 100% local: the file made no network call at all, so
    // `POST /government/sos` was never invoked and the officer SOS feed could
    // never contain a real distress alert. This is a best-effort call: a
    // failure here must never prevent the local SOS from working.
    try {
      if (locResult) {
        await transmitSOSAlert(sessionId, locResult, contactCountRef?.current ?? 0);
      }
    } catch {
      /* best effort - the local SOS is already running */
    }
  }, []);

  // Publish for the countdown timer, which is defined above this callback.
  useEffect(() => {
    activateInternalRef.current = activateInternal;
  }, [activateInternal]);

  const activateSOS = useCallback(() => {
    clearCountdownTimer();
    countdownValueRef.current = 0;
    activateInternalRef.current?.();
  }, []);

  const stopSOS = useCallback(async () => {
    clearCountdownTimer();
    countdownValueRef.current = 3;
    setState((prev) => ({ ...prev, status: SOS_STATUS.STOPPING, trackingStatus: TRACKING_STATUS.INACTIVE }));

    try {
      if (Platform.OS !== 'web') {
        await stopBackgroundLocationUpdates();
      }
    } catch {}

    // Resolve the alert server-side so an officer is not left with a CRITICAL
    // banner for an emergency that has ended.
    const activeId = stateRef.current.sessionId;
    if (activeId) {
      try {
        await apiFetch(`/government/sos/${encodeURIComponent(activeId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'RESOLVED', notes: 'Resolved from the citizen app' }),
          timeoutMs: 5000,
        });
      } catch {
        /* best effort */
      }
    }

    await storageSet(SOS_SESSION_KEY, null);
    // GPS history (speed, heading, altitude) was left in AsyncStorage forever
    // after an emergency ended. Clear it with the session.
    try {
      await storageRemove(LATEST_LOCATION_KEY);
    } catch {}
    try {
      await storageRemove(TASK_STATE_KEY);
    } catch {}

    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.STOPPED,
      sessionId: null,
      startedAt: null,
      location: null,
      locationUpdatedAt: null,
      countdownValue: 3,
      countdownRunning: false,
      shareStatus: null,
    }));
  }, []);

  const dismissStopped = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.IDLE,
      error: null,
      location: null,
      locationStatus: LOCATION_STATUS.UNKNOWN,
      locationUpdatedAt: null,
      trackingStatus: TRACKING_STATUS.INACTIVE,
    }));
  }, []);

  const setShareStatus = useCallback((status) => {
    setState((prev) => ({ ...prev, shareStatus: status }));
  }, []);

  useEffect(() => {
    return () => clearCountdownTimer();
  }, []);

  const value = {
    ...state,
    requestSOS,
    cancelConfirmation,
    startCountdown,
    cancelCountdown,
    activateSOS,
    stopSOS,
    dismissStopped,
    setShareStatus,
    refreshContactCount,
  };

  return <SOSContext.Provider value={value}>{children}</SOSContext.Provider>;
}

export function useSOS() {
  const ctx = useContext(SOSContext);
  if (!ctx) throw new Error('useSOS must be used within SOSProvider');
  return ctx;
}

export function isSOSActive(status) {
  return status === SOS_STATUS.ACTIVATING || status === SOS_STATUS.ACTIVE || status === SOS_STATUS.STOPPING;
}
