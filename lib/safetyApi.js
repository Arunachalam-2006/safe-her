import { apiFetch, describeEngineUnreachable } from './config';
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
 * Fetch route GEOMETRIES only — no safety analysis.
 *
 * This is the fast call that makes the progressive-scoring UX possible: the map
 * can draw all options in ~2s while safety scores are still loading.
 *
 * @param {object} origin - { lat, lng }
 * @param {object} destination - { lat, lng }
 * @param {string} mode
 * @returns {Promise<Array<object>>} unscored routes, or [] on failure
 */
export async function fetchRouteOptions(origin, destination, mode = 'driving') {
  try {
    const response = await apiFetch('/safety/routes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        mode,
      }),
      timeoutMs: 20000,
    });

    if (!response.ok) throw new Error(`Routes API error: ${response.status}`);
    const data = await response.json();
    return Array.isArray(data.routes) ? data.routes : [];
  } catch (error) {
    if (__DEV__) console.warn('[safety] route options failed:', error?.message);
    return [];
  }
}

/**
 * Why a score could not be produced, in words a user can act on.
 *
 * This exists because the previous version collapsed every failure into a bare
 * `null`. The UI then rendered one opaque message - "Safety score unavailable" -
 * whether the engine was switched off, unreachable from the phone, timing out,
 * or genuinely erroring. Those need completely different advice, so the reason
 * is preserved all the way to the screen.
 */
export const SCORE_FAILURE = {
  UNREACHABLE: 'unreachable',
  TIMEOUT: 'timeout',
  REJECTED: 'rejected',
  SERVER: 'server',
  UNKNOWN: 'unknown',
};

const SCORE_FAILURE_TEXT = {
  // The unreachable message is host-aware (see describeEngineUnreachable): a
  // developer on the laptop must not be told to check their phone's Wi-Fi when
  // the real cause is that the engine is bound to 127.0.0.1 while .env names
  // the LAN IP.
  [SCORE_FAILURE.UNREACHABLE]: () => describeEngineUnreachable(SCORE_FAILURE.UNREACHABLE),
  [SCORE_FAILURE.TIMEOUT]: () => describeEngineUnreachable(SCORE_FAILURE.TIMEOUT),
  [SCORE_FAILURE.REJECTED]: () =>
    'The safety engine rejected this route. This is a bug worth reporting - the route itself is still usable.',
  [SCORE_FAILURE.SERVER]: () =>
    'The safety engine hit an internal error. The route itself is still usable.',
  [SCORE_FAILURE.UNKNOWN]: () =>
    'Safety scoring failed for this route. The route is still shown and usable.',
};

/** Map a thrown fetch/abort error onto a SCORE_FAILURE kind. */
function classifyScoreFailure(error) {
  const msg = String(error?.message || '');
  if (/Score API error: 5\d\d/.test(msg)) return SCORE_FAILURE.SERVER;
  if (/Score API error: 4\d\d/.test(msg)) return SCORE_FAILURE.REJECTED;
  if (/abort|timed? ?out/i.test(msg)) return SCORE_FAILURE.TIMEOUT;
  if (/failed to fetch|network request failed|networkerror|load failed|econnrefused|eai_again|enotfound/i.test(msg)) {
    return SCORE_FAILURE.UNREACHABLE;
  }
  return SCORE_FAILURE.UNKNOWN;
}

/**
 * Score ONE already-known route geometry.
 *
 * Lets the client show routes immediately and fill in each safety score as it
 * arrives, instead of blocking on a full analysis of every alternative.
 *
 * `turn_count` and `segments` MUST be passed through from `fetchRouteOptions`.
 * Without them the engine cannot derive the two factors that actually differ
 * between routes (turn density and road type), so every alternative scores
 * identically and the feature is meaningless.
 *
 * @param {object} option - a route from fetchRouteOptions()
 * @returns {Promise<{ok: true, data: object, kind: null, message: null}
 *                 | {ok: false, data: null, kind: string, message: string}>}
 *   Always resolves. Never throws, and never returns a bare null - the caller
 *   has to decide what to show, so it is given the reason as well.
 */
export async function scoreRouteGeometry(option, origin, destination, mode = 'driving') {
  const fail = (kind) => ({
    ok: false,
    data: null,
    kind,
    message: SCORE_FAILURE_TEXT[kind](),
  });

  const coordinates = Array.isArray(option?.coordinates) ? option.coordinates : null;
  if (!coordinates || coordinates.length < 2) return fail(SCORE_FAILURE.UNKNOWN);
  try {
    const response = await apiFetch('/safety/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinates,
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        mode,
        turn_count: option.turn_count ?? 0,
        segments: option.segments ?? null,
      }),
      timeoutMs: 30000,
    });
    if (!response.ok) throw new Error(`Score API error: ${response.status}`);
    const data = await response.json();
    // A 200 with a body that has no score is a failure, not a score of 0.
    if (!data || typeof data.score !== 'number') return fail(SCORE_FAILURE.UNKNOWN);
    return { ok: true, data, kind: null, message: null };
  } catch (error) {
    const kind = classifyScoreFailure(error);
    if (__DEV__) console.warn(`[safety] route scoring failed (${kind}):`, error?.message);
    return fail(kind);
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
