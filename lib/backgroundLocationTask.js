import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { storageGet, storageSet } from './storage';

export const BACKGROUND_LOCATION_TASK = 'safeher-sos-background-location';
const LATEST_LOCATION_KEY = 'safeher_sos_latest_location_v1';
const TASK_STATE_KEY = 'safeher_sos_bg_task_state_v1';

let cachedLatest = null;

try {
  TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      return;
    }
    if (data) {
      const { locations } = data;
      if (locations && Array.isArray(locations) && locations.length > 0) {
        const raw = locations[locations.length - 1];
        const record = {
          latitude: raw.coords.latitude,
          longitude: raw.coords.longitude,
          accuracy: raw.coords.accuracy,
          altitude: raw.coords.altitude ?? null,
          speed: raw.coords.speed ?? null,
          heading: raw.coords.heading ?? null,
          timestamp: raw.timestamp || Date.now(),
        };
        cachedLatest = record;
        try {
          await storageSet(LATEST_LOCATION_KEY, record);
        } catch {}
      }
    }
  });
} catch (err) {
  // Task already defined — safe to ignore on reloads
}

export function isBackgroundTaskRegistered() {
  try {
    if (Platform.OS === 'web') return false;
    return TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK);
  } catch {
    return false;
  }
}

export async function startBackgroundLocationUpdates() {
  if (Platform.OS === 'web') return false;

  try {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;

    let hasBg = false;
    try {
      const bg = await Location.getBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        hasBg = true;
      } else {
        const req = await Location.requestBackgroundPermissionsAsync();
        hasBg = req.status === 'granted';
      }
    } catch {
      hasBg = false;
    }

    const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (alreadyRunning) return true;

    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 10000,
      distanceInterval: 10,
      foregroundService: {
        notificationTitle: 'Safe-Her SOS Active',
        notificationBody: 'Emergency location tracking is running.',
        notificationColor: '#EC4899',
        killServiceOnDestroy: false,
      },
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.OtherNavigation,
    });

    try {
      await storageSet(TASK_STATE_KEY, { running: true, startedAt: Date.now() });
    } catch {}
    return true;
  } catch (err) {
    return false;
  }
}

export async function stopBackgroundLocationUpdates() {
  if (Platform.OS === 'web') return;
  try {
    const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false);
    if (running) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch {}
  try {
    await storageSet(TASK_STATE_KEY, { running: false, stoppedAt: Date.now() });
  } catch {}
}

export async function getLatestTrackedLocation() {
  if (cachedLatest) return cachedLatest;
  const stored = await storageGet(LATEST_LOCATION_KEY, null);
  cachedLatest = stored;
  return stored;
}

export async function setLatestTrackedLocation(record) {
  if (!record) return;
  cachedLatest = record;
  try {
    await storageSet(LATEST_LOCATION_KEY, record);
  } catch {}
}
