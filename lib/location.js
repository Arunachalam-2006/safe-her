import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as ExpoLocation from 'expo-location';

let expoLocationPermissionCache = null;

/**
 * Nominatim asks API consumers to identify themselves so the OSM Foundation can
 * contact them about abusive traffic. Every Nominatim request in this file
 * previously sent a THIRD PARTY's address (`contact@safetransit.com`), which is
 * not Safe-Her and misdirected abuse reports about this app to someone else.
 */
const NOMINATIM_CONTACT = 'contact@safeher.app';

export async function getExpoCurrentLocation() {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve({ ok: false, message: 'Location not available in this environment.', permissionDenied: false });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          ok: true,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
        (err) => resolve({
          ok: false,
          message: err.code === 1
            ? 'Location permission denied.'
            : err.code === 2
            ? 'GPS unavailable. Check device settings.'
            : 'Location request timed out.',
          permissionDenied: err.code === 1,
        }),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    });
  }
  try {
    let perm = expoLocationPermissionCache;
    if (!perm || perm.status !== 'granted') {
      const req = await ExpoLocation.requestForegroundPermissionsAsync();
      perm = req;
      expoLocationPermissionCache = perm;
    }
    if (perm.status !== 'granted') {
      return { ok: false, message: 'Location permission denied. Enable GPS in app settings.', permissionDenied: true };
    }
    const loc = await ExpoLocation.getCurrentPositionAsync({
      accuracy: ExpoLocation.Accuracy.High,
      maximumAge: 5000,
      timeout: 15000,
    });
    return {
      ok: true,
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      accuracy: loc.coords.accuracy,
    };
  } catch (err) {
    return {
      ok: false,
      message: err?.message || 'Could not get your location.',
      permissionDenied: false,
    };
  }
}

export function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(async () => {
    setLoading(true);
    setError('');
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
            setLoading(false);
          },
          (err) => {
            const messages = {
              1: 'Location access denied. Enable location permissions to track your journey.',
              2: 'Location unavailable. Check your GPS or network connection.',
              3: 'Location request timed out. Try again.',
            };
            setError(messages[err.code] || 'Could not get your location.');
            setLoading(false);
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
        );
      } else {
        setError('Location tracking is not available on this device.');
        setLoading(false);
      }
      return;
    }
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      expoLocationPermissionCache = perm;
      if (perm.status !== 'granted') {
        setError('Location access denied. Enable GPS permissions in your device settings.');
        setLoading(false);
        return;
      }
      const loc = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy.Balanced,
        maximumAge: 5000,
        timeout: 10000,
      });
      setLocation({
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: loc.coords.accuracy,
      });
    } catch (err) {
      setError(err?.message || 'Could not get your location.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, error, loading, requestLocation };
}

export function useLiveLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const webWatchRef = useRef(null);
  const nativeSubRef = useRef(null);

  const startTracking = useCallback(async () => {
    setError('');
    setTracking(true);
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setError('Live tracking is not available on this device.');
        setTracking(false);
        return;
      }
      const id = navigator.geolocation.watchPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed, heading: pos.coords.heading });
        },
        (err) => {
          const messages = {
            1: 'Location access denied. Enable location permissions to track your journey.',
            2: 'Location unavailable. Check your GPS or network connection.',
            3: 'Location request timed out.',
          };
          setError(messages[err.code] || 'Tracking error.');
          setTracking(false);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
      webWatchRef.current = id;
      return;
    }
    try {
      const perm = await ExpoLocation.requestForegroundPermissionsAsync();
      expoLocationPermissionCache = perm;
      if (perm.status !== 'granted') {
        setError('Location access denied. Enable GPS permissions.');
        setTracking(false);
        return;
      }
      const sub = await ExpoLocation.watchPositionAsync(
        { accuracy: ExpoLocation.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
        (loc) => {
          setLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracy: loc.coords.accuracy,
            speed: loc.coords.speed,
            heading: loc.coords.heading,
          });
        }
      );
      nativeSubRef.current = sub;
    } catch (err) {
      setError(err?.message || 'Tracking start failed.');
      setTracking(false);
    }
  }, []);

  const stopTracking = useCallback(() => {
    if (webWatchRef.current != null && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(webWatchRef.current);
    }
    webWatchRef.current = null;
    if (nativeSubRef.current && typeof nativeSubRef.current.remove === 'function') {
      try { nativeSubRef.current.remove(); } catch {}
    }
    nativeSubRef.current = null;
    setTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      if (webWatchRef.current != null && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(webWatchRef.current);
      }
      if (nativeSubRef.current && typeof nativeSubRef.current.remove === 'function') {
        try { nativeSubRef.current.remove(); } catch {}
      }
    };
  }, []);

  return { location, error, tracking, startTracking, stopTracking };
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function estimateTravelTime(distanceKm, mode = 'bus') {
  const speeds = { walk: 5, bus: 18, car: 28, auto: 22 };
  const speed = speeds[mode] || 18;
  const hours = distanceKm / speed;
  const minutes = Math.max(1, Math.round(hours * 60));
  return minutes;
}

export function formatDistance(km) {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export async function searchLocation(query) {
  if (typeof fetch === 'undefined' || query.trim().length < 3) return [];

  const q = encodeURIComponent(query.trim());

  // Helper: fetch with AbortController timeout
  function fetchWithTimeout(url, opts = {}, ms = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
  }

  // Primary: bounded to Tamil Nadu for relevant local results
  const tamilNaduViewbox = '76.0,13.6,80.5,8.0';
  const primaryUrl =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=in&bounded=1&viewbox=${tamilNaduViewbox}` +
    `&q=${q},%20Tamil%20Nadu,%20India&email=${NOMINATIM_CONTACT}`;

  try {
    const resp = await fetchWithTimeout(primaryUrl, { headers: { 'Accept-Language': 'en' } }, 10000);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.length > 0) {
        return data
          .map((place) => ({
            name: place.display_name.split(',').slice(0, 2).join(', '),
            label: place.display_name,
            lat: Number(place.lat),
            lng: Number(place.lon),
          }))
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
      }
    }
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Nominatim primary search error:', e.message);
  }

  // Fallback: broader India-wide search (no bounding box)
  const fallbackUrl =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6` +
    `&countrycodes=in&q=${q},%20India&email=${NOMINATIM_CONTACT}`;

  try {
    const resp = await fetchWithTimeout(fallbackUrl, { headers: { 'Accept-Language': 'en' } }, 10000);
    if (!resp.ok) throw new Error('Nominatim fallback returned ' + resp.status);
    const data = await resp.json();
    return (data || [])
      .map((place) => ({
        name: place.display_name.split(',').slice(0, 2).join(', '),
        label: place.display_name,
        lat: Number(place.lat),
        lng: Number(place.lon),
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  } catch (error) {
    console.error('Search Location Error:', error);
    throw new Error('Failed to fetch search results. Check your network connection.');
  }
}

export async function geocodePlace(query) {
  const results = await searchLocation(query);
  return results[0] || null;
}

export function decodePolyline6(str) {
  let index = 0, lat = 0, lng = 0, shift = 0, result = 0, byte = null;
  const coordinates = [];
  let factor = 1e6; // Polyline6 has 6 decimal places

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change;

    shift = result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += longitude_change;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

export async function getRoute(source, destination, mode = 'driving') {
  if (![source, destination].every((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng))) {
    throw new Error('Invalid coordinates. Check source and destination.');
  }

  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN &&
    !process.env.EXPO_PUBLIC_MAPBOX_TOKEN.includes('your_') &&
    process.env.EXPO_PUBLIC_MAPBOX_TOKEN;

  // Helper: fetch with a hard timeout via AbortController
  function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { ...options, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  // â”€â”€ OPTION 1: Mapbox (if a real token is configured) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (mapboxToken) {
    const profile = { driving: 'driving-traffic', walking: 'walking', cycling: 'cycling' }[mode];
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?alternatives=false&overview=full&geometries=geojson&access_token=${mapboxToken}`;
    try {
      const res = await fetchWithTimeout(url);
      if (res.ok) {
        const data = await res.json();
        if (data.code === 'Ok' && data.routes?.[0]) {
          const r = data.routes[0];
          return {
            coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            distanceKm: r.distance / 1000,
            durationMin: Math.max(1, Math.round(r.duration / 60)),
            trafficDelayMin: Math.max(0, Math.round((r.duration - (r.duration_typical || r.duration)) / 60)),
            provider: 'Mapbox',
            mode,
          };
        }
      }
    } catch (_) {
      // Mapbox failed/timed out
    }
  }

  const osrmProfile = { driving: 'driving', walking: 'foot', cycling: 'bike' }[mode] || 'driving';

  // â”€â”€ OPTION 2: OSRM Direct (GET request â€” no CORS preflight, 8s timeout) -----
  // OSRM Direct supports CORS header "Access-Control-Allow-Origin: *" natively
  // as long as we do not pass custom headers (like User-Agent) which trigger preflight.
  const osrmUrl = `https://router.project-osrm.org/route/v1/${osrmProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetchWithTimeout(osrmUrl, {}, 8000);
    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes?.[0]) {
        const r = data.routes[0];
        return {
          coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceKm: r.distance / 1000,
          durationMin: Math.max(1, Math.round(r.duration / 60)),
          trafficDelayMin: null,
          provider: 'OSRM Direct',
          mode,
        };
      }
    }
  } catch (e) {
    console.warn('OSRM Direct failed, trying next fallback...', e.message);
  }

  // â”€â”€ OPTION 3: Valhalla GET (simple request â€” no CORS preflight, 8s timeout) â”€
  const costingMap = { driving: 'auto', walking: 'pedestrian', cycling: 'bicycle' };
  const valhallaPayload = JSON.stringify({
    locations: [
      { lon: source.lng, lat: source.lat },
      { lon: destination.lng, lat: destination.lat },
    ],
    costing: costingMap[mode] || 'auto',
    directions_options: { language: 'en-US' },
  });

  try {
    const res = await fetchWithTimeout(
      `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(valhallaPayload)}`,
      {},
      8000   // give up after 8 seconds
    );
    if (res.ok) {
      const data = await res.json();
      if (data.trip?.legs?.[0]) {
        const summary = data.trip.summary;
        const shapeRaw = data.trip.legs[0].shape;
        const coordinates =
          typeof shapeRaw === 'string'
            ? decodePolyline6(shapeRaw)
            : Array.isArray(shapeRaw?.coordinates)
            ? shapeRaw.coordinates.map(([lng, lat]) => [lat, lng])
            : [];
        return {
          coordinates,
          distanceKm: summary.length,
          durationMin: Math.max(1, Math.round(summary.time / 60)),
          trafficDelayMin: null,
          provider: 'Valhalla OSM',
          mode,
        };
      }
    }
  } catch (_) {
    // Valhalla timed out or errored â€” fall through immediately
  }

  // â”€â”€ OPTION 4: OSRM via CORS proxy (8s timeout fallback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const osrmTarget = `https://router.project-osrm.org/route/v1/${osrmProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(osrmTarget)}`;

  try {
    const res = await fetchWithTimeout(proxyUrl, {}, 8000);
    if (!res.ok) throw new Error(`Proxy returned ${res.status}`);
    const data = await res.json();
    if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route found between these locations.');
    const r = data.routes[0];
    return {
      coordinates: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: r.distance / 1000,
      durationMin: Math.max(1, Math.round(r.duration / 60)),
      trafficDelayMin: null,
      provider: 'OSRM via Proxy',
      mode,
    };
  } catch (err) {
    console.error('All routing options failed:', err);
    throw new Error('Could not calculate a route. Check your internet connection and try again.');
  }
}

/**
 * Reverse-geocode a coordinate to a human-readable place name.
 *
 * Three defects fixed here:
 *  1. Every fallback branch called `lat.toFixed(4)` / `lng.toFixed(4)`. If the
 *     inputs were not finite numbers, the very expression that caused the
 *     failure threw again *inside the .catch() handler*, turning the recovery
 *     into an unhandled rejection. Callers used bare `.then()` with no
 *     `.catch()`, so the UI sat on "Locating..." forever.
 *  2. `.then((r) => r.json())` never checked `r.ok`, so a Nominatim
 *     403/429/500 body without `display_name` silently fell through.
 *  3. A third party's email address was sent as the Nominatim contact.
 */
const COORD_FALLBACK = (lat, lng) => {
  const safeLat = Number.isFinite(Number(lat)) ? Number(lat).toFixed(4) : '?.????';
  const safeLng = Number.isFinite(Number(lng)) ? Number(lng).toFixed(4) : '?.????';
  return `${safeLat}, ${safeLng}`;
};

export function reverseGeocode(lat, lng) {
  const fallback = COORD_FALLBACK(lat, lng);

  return new Promise((resolve) => {
    if (typeof fetch === 'undefined' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      resolve(fallback);
      return;
    }
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14` +
      `&email=${NOMINATIM_CONTACT}`;
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then((r) => {
        if (!r.ok) throw new Error(`Nominatim ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data && typeof data.display_name === 'string' && data.display_name) {
          const parts = data.display_name.split(',').map((p) => p.trim());
          resolve(parts.slice(0, 2).join(', '));
        } else {
          resolve(fallback);
        }
      })
      .catch((error) => {
        if (__DEV__) console.warn('Reverse geocode failed:', error?.message);
        resolve(fallback);
      });
  });
}
