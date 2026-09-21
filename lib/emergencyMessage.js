export function formatTimestamp(ts) {
  const d = ts ? new Date(ts) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return now.toLocaleString();
  }
  return d.toLocaleString();
}

function formatLatLng(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const n = Number(value);
  return n.toFixed(6);
}

function buildMapsLink(lat, lng) {
  const latStr = formatLatLng(lat);
  const lngStr = formatLatLng(lng);
  if (!latStr || !lngStr) return '';
  return `https://www.google.com/maps?q=${latStr},${lngStr}`;
}

export function generateEmergencyMessage(location, timestamp) {
  const lat = location?.latitude ?? location?.lat ?? location?.lat ?? null;
  const lng = location?.longitude ?? location?.lng ?? location?.lng ?? null;
  const latStr = formatLatLng(lat);
  const lngStr = formatLatLng(lng);
  const mapsLink = buildMapsLink(lat, lng);
  const hasLocation = latStr && lngStr;
  const timeStr = formatTimestamp(timestamp);

  const header = '🚨 SAFE-HER EMERGENCY ALERT 🚨';
  const intro = 'I may be in danger and need immediate help.\n\nPlease try to contact me as soon as possible.';
  const locationBlock = hasLocation
    ? `📍 My current location:\nLatitude: ${latStr}\nLongitude: ${lngStr}\n\nGoogle Maps link:\n${mapsLink}`
    : `📍 Location information is currently unavailable. My last known location may be shared soon — please check with local services.`;
  const timeBlock = `🕒 Time:\n${timeStr}`;
  const footer = 'This is an emergency — please respond urgently.\n\n— Sent from Safe-Her SOS';

  return `${header}\n\n${intro}\n\n${locationBlock}\n\n${timeBlock}\n\n${footer}`;
}

export function buildShareTitle() {
  return '🚨 Safe-Her Emergency Alert - I need help';
}

export { buildMapsLink };
