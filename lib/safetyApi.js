import { haversineDistance, estimateTravelTime } from './location';
import { apiFetch } from './config';

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
      timeoutMs: 8000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Safety API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
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
  try {
    const response = await apiFetch('/safety/spot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
      timeoutMs: 12000,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Spot safety API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
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
      timeoutMs: 12000,
    });

    if (!response.ok) throw new Error(`Hubs API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    return {
      hubs: [],
      nearest: null,
      counts: { street_lamps: 0, police: 0, hospitals: 0, clinics: 0, pharmacies: 0 },
      _offline: true,
    };
  }
}
