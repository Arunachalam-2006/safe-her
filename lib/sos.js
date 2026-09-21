import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { getEmergencyContacts } from './emergencyContacts';
import { storageGet, storageSet } from './storage';
import { getExpoCurrentLocation } from './location';
import { startBackgroundLocationUpdates, stopBackgroundLocationUpdates, isBackgroundTaskRegistered } from './backgroundLocationTask';

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
    (async () => {
      const contacts = await loadContacts();
      const saved = await storageGet(SOS_SESSION_KEY, null);
      if (saved && saved.sessionId && saved.status === SOS_STATUS.ACTIVE) {
        setState((prev) => ({
          ...prev,
          status: SOS_STATUS.ACTIVE,
          sessionId: saved.sessionId,
          startedAt: saved.startedAt,
          location: saved.location || null,
          locationUpdatedAt: saved.locationUpdatedAt || null,
          trackingStatus: saved.trackingStatus || TRACKING_STATUS.UNAVAILABLE,
          contactCount: contacts.length,
          contacts,
        }));
      } else {
        setState((prev) => ({ ...prev, contactCount: contacts.length, contacts }));
      }
    })();
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
        activateInternal();
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
  }, []);

  const activateSOS = useCallback(() => {
    clearCountdownTimer();
    countdownValueRef.current = 0;
    activateInternal();
  }, [activateInternal]);

  const stopSOS = useCallback(async () => {
    clearCountdownTimer();
    countdownValueRef.current = 3;
    setState((prev) => ({ ...prev, status: SOS_STATUS.STOPPING, trackingStatus: TRACKING_STATUS.INACTIVE }));

    try {
      if (Platform.OS !== 'web') {
        await stopBackgroundLocationUpdates();
      }
    } catch {}

    await storageSet(SOS_SESSION_KEY, null);
    setState((prev) => ({
      ...prev,
      status: SOS_STATUS.STOPPED,
      sessionId: null,
      startedAt: null,
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
