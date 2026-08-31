import { haversineDistance, estimateTravelTime } from './location';

// Use localhost for development; override with env var in production
const SAFETY_API_BASE =
  typeof window !== 'undefined' && window.location?.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'http://localhost:8000';

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
