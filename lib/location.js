import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';

export function useLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    setLoading(true);
    setError('');
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
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
  }, []);

  return { location, error, loading, requestLocation };
}

export function useLiveLocation() {
  const [location, setLocation] = useState(null);
  const [error, setError] = useState('');
  const [tracking, setTracking] = useState(false);
  const [watchId, setWatchId] = useState(null);

  const startTracking = useCallback(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Live tracking is not available on this device.');
      return;
    }
    setError('');
    setTracking(true);
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
    setWatchId(id);
  }, []);

  const stopTracking = useCallback(() => {
    if (watchId !== null && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
    }
    setWatchId(null);
    setTracking(false);
  }, [watchId]);

  useEffect(() => {
    return () => {
      if (watchId !== null && Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [watchId]);

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
  if (Platform.OS !== 'web' || typeof fetch === 'undefined' || query.trim().length < 3) return [];
  const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(query.trim())}`, { headers: { 'Accept-Language': 'en' } });
  if (!response.ok) throw new Error('Could not search locations.');
  return (await response.json()).map((place) => ({
    name: place.display_name.split(',').slice(0, 2).join(', '),
    label: place.display_name,
    lat: Number(place.lat),
    lng: Number(place.lon),
  })).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
}

export async function geocodePlace(query) {
  const results = await searchLocation(query);
  return results[0] || null;
}

export async function getRoute(source, destination, mode = 'driving') {
  if (![source, destination].every((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))) {
    throw new Error('Invalid route coordinates.');
  }
  const mapboxToken = process.env.EXPO_PUBLIC_MAPBOX_TOKEN;
  const mapboxProfile = { driving: 'driving-traffic', walking: 'walking', cycling: 'cycling' }[mode];
  if (!mapboxToken && mode !== 'driving') {
    throw new Error('Add a Mapbox token to calculate walking and cycling routes.');
  }
  const url = mapboxToken
    ? `https://api.mapbox.com/directions/v5/mapbox/${mapboxProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?alternatives=false&overview=full&geometries=geojson&access_token=${encodeURIComponent(mapboxToken)}`
    : `https://router.project-osrm.org/route/v1/driving/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not calculate a route.');
  const data = await response.json();
  if (data.code !== 'Ok' || !data.routes?.[0]) throw new Error('No route was found between these locations.');
  const route = data.routes[0];
  const typicalDuration = route.duration_typical || route.duration;
  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm: route.distance / 1000,
    durationMin: Math.max(1, Math.round(route.duration / 60)),
    trafficDelayMin: mapboxToken && mode === 'driving' ? Math.max(0, Math.round((route.duration - typicalDuration) / 60)) : null,
    provider: mapboxToken ? 'Mapbox traffic routing' : 'OSRM routing (traffic unavailable)',
    mode,
  };
}

export function reverseGeocode(lat, lng) {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof fetch === 'undefined') {
      resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      return;
    }
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
      headers: { 'Accept-Language': 'en' },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.display_name) {
          const parts = data.display_name.split(',');
          resolve(parts.slice(0, 2).join(', '));
        } else {
          resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      })
      .catch(() => resolve(`${lat.toFixed(4)}, ${lng.toFixed(4)}`));
  });
}
