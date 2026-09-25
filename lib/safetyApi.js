import { haversineDistance, estimateTravelTime } from './location';

/**
 * SAFETY_API_BASE — the URL of the Python FastAPI backend.
 *
 * On web (localhost dev) this works fine as-is.
 * On a physical phone (APK) the device cannot reach 'localhost' — it must
 * use your computer's LAN IP (e.g. 192.168.1.x).
 *
 * HOW TO SET THIS:
 *   1. Find your PC's local IP: run `ipconfig` on Windows, look for IPv4 under Wi-Fi.
 *   2. In the project root, edit .env and set:
 *        EXPO_PUBLIC_SAFETY_API_URL=http://192.168.X.X:8000
 *   3. Rebuild the APK with `eas build --platform android --profile preview`.
 *
 * If the env var is missing the app will gracefully fall back to a local
 * estimate so the UI never breaks.
 */
const SAFETY_API_BASE =
  process.env.EXPO_PUBLIC_SAFETY_API_URL ||
  (typeof window !== 'undefined' && window.location?.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'http://localhost:8000');

/**
 * Analyze a route's safety by calling the backend engine.
 *
 * @param {object} origin - { lat: number, lng: number }
 * @param {object} destination - { lat: number, lng: number }
 * @param {string} mode - "driving" | "walking" | "cycling"
 * @returns {Promise<Array<object>>} Safety analysis results
 */
export async function analyzeSafety(origin, destination, mode = 'driving') {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${SAFETY_API_BASE}/safety/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        mode,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Safety API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      const distance = haversineDistance(origin.lat, origin.lng, destination.lat, destination.lng);
      const time = estimateTravelTime(distance, mode === 'driving' ? 'car' : mode === 'walking' ? 'walk' : 'bus');
      // Timeout — return partial result with low confidence wrapped in an array
      return [{
        score: 65,
        risk_level: 'MODERATE',
        confidence: 0.5,
        factors: {
          lighting: 65,
          road: 70,
          police: 50,
          hospital: 60,
          amenities: 60,
          weather: 80,
          time: 75,
          route: 70,
        },
        segments: [],
        coordinates: [[origin.lat, origin.lng], [destination.lat, destination.lng]],
        distanceKm: distance,
        durationMin: time,
        routeIndex: 0,
        _timeout: true,
      }];
    }

    throw error;
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
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`${SAFETY_API_BASE}/safety/spot`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Spot safety API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);

    // Return a time-based fallback so the UI always shows something
    const hour = new Date().getHours();
    const isNight = hour >= 18 || hour < 6;
    const fallbackScore = isNight ? 68 : 82;

    return {
      score: fallbackScore,
      risk_level: isNight ? 'MODERATE' : 'LOW',
      label: isNight ? 'Moderate Night Safety' : 'Good Safety Zone',
      confidence: 0.3,
      factors: {
        lighting: isNight ? 55 : 80,
        police: 50,
        hospital: 60,
        amenities: 60,
        weather: 80,
        time: isNight ? 55 : 95,
      },
      details: {
        hour,
        is_night: isNight,
      },
      _offline: true,
    };
  }
}
