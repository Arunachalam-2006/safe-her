const source = { lat: 13.0827, lng: 80.2707 }; // Chennai Central
const destination = { lat: 12.9796, lng: 80.2209 }; // Velachery

const costingMap = { driving: 'auto', walking: 'pedestrian', cycling: 'bicycle' };
const mode = 'driving';

async function testValhalla() {
  console.log('Testing Valhalla...');
  const valhallaPayload = JSON.stringify({
    locations: [
      { lon: source.lng, lat: source.lat },
      { lon: destination.lng, lat: destination.lat },
    ],
    costing: costingMap[mode] || 'auto',
    directions_options: { language: 'en-US' },
  });
  const url = `https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(valhallaPayload)}`;
  try {
    const res = await fetch(url);
    console.log('Valhalla status:', res.status);
    const data = await res.json();
    console.log('Valhalla payload returned:', Object.keys(data));
    if (data.trip?.legs?.[0]) {
      console.log('Valhalla success! Distance:', data.trip.summary.length);
      return true;
    } else {
      console.log('Valhalla response structure invalid:', data);
    }
  } catch (e) {
    console.error('Valhalla failed error:', e.message);
  }
  return false;
}

async function testOSRMProxy() {
  console.log('Testing OSRM via details...');
  const osrmProfile = { driving: 'driving', walking: 'foot', cycling: 'bike' }[mode] || 'driving';
  const osrmTarget = `https://router.project-osrm.org/route/v1/${osrmProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  const url = `https://api.allorigins.win/raw?url=${encodeURIComponent(osrmTarget)}`;
  try {
    const res = await fetch(url);
    console.log('Proxy status:', res.status);
    const data = await res.json();
    console.log('Proxy payload returned:', Object.keys(data));
    if (data.code === 'Ok') {
      console.log('Proxy success! Distance:', data.routes[0].distance);
      return true;
    }
  } catch (e) {
    console.error('Proxy failed error:', e.message);
  }
  return false;
}

async function testOSRMDirect() {
  console.log('Testing OSRM Direct (just in case)...');
  const osrmProfile = { driving: 'driving', walking: 'foot', cycling: 'bike' }[mode] || 'driving';
  const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    console.log('OSRM Direct status:', res.status);
    const data = await res.json();
    console.log('OSRM Direct code:', data.code);
    if (data.code === 'Ok') {
       return true;
    }
  } catch (e) {
    console.error('OSRM Direct failed error:', e.message);
  }
  return false;
}

async function run() {
  await testValhalla();
  await testOSRMProxy();
  await testOSRMDirect();
}

run();
