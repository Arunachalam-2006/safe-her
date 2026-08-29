const source = { lat: 13.0827, lng: 80.2707 };
const destination = { lat: 12.9796, lng: 80.2209 };
const osrmProfile = 'driving';
const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${source.lng},${source.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;

async function run() {
  try {
    const res = await fetch(url);
    console.log('Origin Header:', res.headers.get('access-control-allow-origin'));
    console.log('Headers Keys:', [...res.headers.keys()]);
  } catch (e) {
    console.error(e);
  }
}
run();
