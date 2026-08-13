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

export const CHENNAI_AREAS = [
  { name: 'Adyar', lat: 13.0067, lng: 80.2206 },
  { name: 'Anna Nagar', lat: 13.0850, lng: 80.2101 },
  { name: 'Besant Nagar', lat: 13.0012, lng: 80.2651 },
  { name: 'T. Nagar', lat: 13.0418, lng: 80.2341 },
  { name: 'Mylapore', lat: 13.0333, lng: 80.2690 },
  { name: 'Velachery', lat: 12.9791, lng: 80.2182 },
  { name: 'Guindy', lat: 13.0067, lng: 80.2110 },
  { name: 'Egmore', lat: 13.0732, lng: 80.2609 },
  { name: 'Triplicane', lat: 13.0507, lng: 80.2842 },
  { name: 'Nungambakkam', lat: 13.0604, lng: 80.2496 },
  { name: 'Tambaram', lat: 12.9249, lng: 80.1000 },
  { name: 'Porur', lat: 13.0293, lng: 80.1489 },
  { name: 'Perambur', lat: 13.1179, lng: 80.2359 },
  { name: 'Vadapalani', lat: 13.0500, lng: 80.2122 },
  { name: 'Kodambakkam', lat: 13.0497, lng: 80.2217 },
  { name: 'Saidapet', lat: 13.0219, lng: 80.2206 },
  { name: 'Chromepet', lat: 12.9516, lng: 80.1444 },
  { name: 'Pallavaram', lat: 12.9500, lng: 80.1600 },
  { name: 'Sholinganallur', lat: 12.9010, lng: 80.2279 },
  { name: 'Perungudi', lat: 12.9604, lng: 80.2407 },
  { name: 'Taramani', lat: 12.9791, lng: 80.2420 },
  { name: 'Marina Beach', lat: 13.0500, lng: 80.2824 },
  { name: 'Central Chennai', lat: 13.0827, lng: 80.2707 },
  { name: 'Chennai Central', lat: 13.0839, lng: 80.2750 },
  { name: 'Chennai Airport', lat: 12.9941, lng: 80.1709 },
  { name: 'Kotturpuram', lat: 13.0170, lng: 80.2430 },
  { name: 'R.A. Puram', lat: 13.0250, lng: 80.2550 },
  { name: 'Mandaveli', lat: 13.0350, lng: 80.2620 },
  { name: 'Alwarpet', lat: 13.0430, lng: 80.2520 },
  { name: 'Royapettah', lat: 13.0520, lng: 80.2620 },
];

export function searchChennaiAreas(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return CHENNAI_AREAS.filter((a) => a.name.toLowerCase().includes(q));
}

export function geocodePlace(query) {
  return new Promise((resolve) => {
    const preset = searchChennaiAreas(query);
    if (preset.length > 0) {
      resolve({ lat: preset[0].lat, lng: preset[0].lng, label: preset[0].name + ', Chennai' });
      return;
    }
    if (Platform.OS !== 'web' || typeof fetch === 'undefined') {
      resolve(null);
      return;
    }
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Chennai, Tamil Nadu, India')}&limit=1&countrycodes=in`;
    fetch(url, { headers: { 'Accept-Language': 'en' } })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.length > 0) {
          resolve({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name.split(',').slice(0, 2).join(', ') });
        } else {
          resolve(null);
        }
      })
      .catch(() => resolve(null));
  });
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
