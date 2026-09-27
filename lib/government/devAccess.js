/**
 * DEVELOPER-ONLY role override.
 *
 * Purpose
 * -------
 * While the Supabase `profiles` table has not been created yet there is no way
 * to grant an `account_type`, so the officer dashboard cannot be reached.
 * This module lets a developer preview the officer UI in development without
 * weakening anything.
 *
 * Safety rules baked in
 * ---------------------
 *  1. `isDevAccessEnabled()` is false in every production build, so the value
 *     can never affect a released app.
 *  2. It never writes to the database and never touches a real user record.
 *  3. It is a single module + a single floating control, so removing the bypass
 *     is a two-file delete.
 *
 * To remove the bypass entirely:
 *   - delete lib/government/devAccess.js
 *   - delete components/government/DevRoleSwitch.jsx
 *   - delete the three marked lines in app/_layout.jsx
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'safeher_dev_role_override_v1';

// In-memory mirror so routing decisions never await storage.
let currentOverride = null;

export function isDevAccessEnabled() {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

/** @returns {'citizen'|'government'|null} */
export function getDevRoleOverride() {
  return isDevAccessEnabled() ? currentOverride : null;
}

export async function loadDevRoleOverride() {
  if (!isDevAccessEnabled()) return null;
  try {
    const value = await AsyncStorage.getItem(STORAGE_KEY);
    currentOverride = value === 'citizen' || value === 'government' ? value : null;
  } catch {
    currentOverride = null;
  }
  return currentOverride;
}

export async function setDevRoleOverride(role) {
  if (!isDevAccessEnabled()) return null;
  const next = role === 'government' || role === 'citizen' ? role : null;
  currentOverride = next;
  try {
    if (next) await AsyncStorage.setItem(STORAGE_KEY, next);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
  return next;
}

export async function clearDevRoleOverride() {
  return setDevRoleOverride(null);
}

/** True when the running session is previewing a role it does not really have. */
export function isOverridingRealRole(actualAccountType) {
  const override = getDevRoleOverride();
  if (!override) return false;
  return override !== (actualAccountType || 'citizen');
}
