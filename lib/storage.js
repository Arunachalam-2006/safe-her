import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const inMemory = {};

function isWeb() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage;
}

export async function storageGet(key, fallback = null) {
  try {
    if (isWeb()) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    return fallback;
  }
}

export async function storageSet(key, value) {
  try {
    const serialized = JSON.stringify(value);
    if (isWeb()) {
      if (value === null || value === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, serialized);
      }
    } else {
      if (value === null || value === undefined) {
        await AsyncStorage.removeItem(key);
      } else {
        await AsyncStorage.setItem(key, serialized);
      }
    }
    return true;
  } catch (err) {
    return false;
  }
}

export async function storageRemove(key) {
  return storageSet(key, null);
}

export function storageSyncGet(key, fallback = null) {
  try {
    if (isWeb()) {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    }
    return inMemory[key] ?? fallback;
  } catch {
    return fallback;
  }
}
