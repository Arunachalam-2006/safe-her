/**
 * Offline / unknown-data fallbacks — the SINGLE source of truth.
 *
 * Before this module the same question ("what safety score do we show when the
 * engine is unreachable?") had SIX different hardcoded answers spread across
 * five files:
 *
 *   safetyApi.js:59    65          MODERATE   (route timeout)
 *   safetyApi.js:112   82 / 68     LOW        (spot failure)
 *   (tabs)/index.jsx   94 / 82     —          (component default)
 *   (tabs)/routes.jsx  80          LOW        (no safety data)
 *   lib/journey.jsx    0           MODERATE   (initial state)
 *   safetyScore.jsx    88 / 85     —          (prop defaults)
 *
 * The same user therefore saw "65" on one tab and "80" on another for the same
 * trip. Worse, some of those paths also fabricated factor chips ("95% Lit",
 * "3 Patrols Nearby") and suppressed the offline warning, so a hard failure
 * rendered as a confident, positive-looking measurement.
 *
 * Rules now enforced:
 *  1. ONE set of numbers, imported from here.
 *  2. A fallback is always flagged `_offline: true` AND carries `factors: null`
 *     so the UI can show "no data" instead of inventing factor chips.
 *  3. Scores are deliberately mid-range and never optimistic.
 */

/** Neutral-ish offline score. Never a strong "you are safe" claim. */
export const OFFLINE_SCORE = 70;
export const OFFLINE_ROUTE_SCORE = 65;

/** Confidence when we have no measurement at all. Deliberately low. */
export const OFFLINE_CONFIDENCE = 0.25;

export const OFFLINE_RISK_LEVEL = 'MODERATE';
export const OFFLINE_LABEL = 'Safety data unavailable';
export const OFFLINE_NIGHT_LABEL = 'Safety data unavailable (night)';

/**
 * `factors: null` is the important part. `components/safetyScore.jsx` uses a
 * null `factors` to render an explicit "no live data" state instead of
 * hardcoded chips.
 */
export function offlineSpotFallback(date = new Date()) {
  const hour = date.getHours();
  const isNight = hour >= 19 || hour < 6;
  return {
    score: OFFLINE_SCORE,
    risk_level: OFFLINE_RISK_LEVEL,
    label: isNight ? OFFLINE_NIGHT_LABEL : OFFLINE_LABEL,
    confidence: OFFLINE_CONFIDENCE,
    factors: null,
    details: { hour, is_night: isNight, offline: true },
    degraded: true,
    _offline: true,
  };
}

export function offlineRouteFallback(origin, destination, distanceKm, durationMin) {
  return {
    score: OFFLINE_ROUTE_SCORE,
    risk_level: OFFLINE_RISK_LEVEL,
    confidence: OFFLINE_CONFIDENCE,
    factors: null,
    segments: [],
    coordinates: [
      [origin?.lat, origin?.lng],
      [destination?.lat, destination?.lng],
    ],
    distanceKm,
    durationMin,
    routeIndex: 0,
    degraded: true,
    _offline: true,
  };
}

/**
 * Hubs fallback. `counts` is `null`, NOT a set of zeros — the previous version
 * returned zeros, and because `??` does not catch `0` the Home screen then
 * asserted "0 police stations nearby" and "lighting 80% (0 lamps)" as if
 * those were measurements.
 */
export function offlineHubsFallback() {
  return {
    hubs: [],
    nearest: null,
    counts: null,
    degraded: true,
    _offline: true,
  };
}
