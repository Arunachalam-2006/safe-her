import { apiFetch } from './config';
import { haversineDistance, estimateTravelTime } from './location';
import {
  offlineSpotFallback,
  offlineRouteFallback,
  offlineHubsFallback,
} from './safetyFallbacks';

/**
 * The backend base URL lives in `lib/config.js` (API_BASE) and is used by
 * `apiFetch`. This file previously declared its own `SAFETY_API_BASE` reading
 * EXPO_PUBLIC_SAFETY_API_URL, which was never referenced — dead code whose
 * only effect was to make it look like the env var was wired up. Its ternary
 * also had two identical branches.
 */

/**
 * Analyze a route's safety by calling the backend engine.
 *
 * @param {object} origin - { lat: number, lng: number }
 * @param {object} destination - { lat: number, lng: number }
 * @param {string} mode - "driving" | "walking" | "cycling"
 * @returns {Promise<Array<object>>} Safety analysis results
 */
export async function analyzeSafety(origin, destination, mode = 'driving') {
  try {
    const response = await apiFetch('/safety/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        mode,
      }),
      // The engine's own worst case is ~25s (routing + Overpass + weather), but
      // waiting that long is worse than showing honest offline data. Anything
      // past this is a degraded result, not a real one.
      timeoutMs: 15000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Safety API error: ${response.status}`);
    }

    const data = await response.json();
    return Array.isArray(data) ? data : [data];
  } catch (error) {
    const distance = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    const time = estimateTravelTime(distance, mode === 'driving' ? 'car' : mode === 'walking' ? 'walk' : 'bus');
    // Timeout or failure: return a straight A-to-B line clearly flagged as
    // offline, instead of a fabricated 65 with invented factor numbers.
    return [offlineRouteFallback(origin, destination, distance, time)];
  }
}

/**
 * Fetch the spot safety score for a single GPS location (no route needed).
 * Used by the Home Page to display the user's current area safety.
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<object>} Spot safety result with score, label, factors, details
 */
export async function fetchSpotSafety(lat, lng) {
  try {
    const response = await apiFetch('/safety/spot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
      timeoutMs: 15000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Spot safety API error: ${response.status}`);
    }

    const data = await response.json();
    // The engine now reports `degraded` when Overpass/weather failed. Keep the
    // real score but make sure the UI can see it is not fully trustworthy.
    if (data.degraded && !data._offline) {
      return { ...data, _degraded: true };
    }
    return data;
  } catch {
    return offlineSpotFallback();
  }
}

/**
 * Fetch real nearby safe hubs (police, hospitals, clinics, pharmacies) with
 * names + distances, plus infrastructure counts, for a single GPS location.
 * Powers the Home "safety around you" card. Returns an `_offline` payload on failure.
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<object>} { hubs, nearest, counts, _offline? }
 */
export async function fetchSafeHubs(lat, lng) {
  try {
    const response = await apiFetch('/safety/hubs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
      timeoutMs: 15000,
    });

    if (!response.ok) throw new Error(`Hubs API error: ${response.status}`);
    return await response.json();
  } catch {
    return offlineHubsFallback();
  }
}
