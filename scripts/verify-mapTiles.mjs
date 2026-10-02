/**
 * Verifies lib/mapTiles.js: MapTiler when a key is present, plain OSM when not.
 * Run with the key set, then with it removed, and both must pass.
 */
import { hasMapTilerKey, tileUrlTemplate, tileAttribution, tileLayerOptions, TILE_STYLES } from '../lib/mapTiles.js';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + '  ' + extra); }
};

console.log('\n=== key detection ===');
const url = tileUrlTemplate('streets');
const attr = tileAttribution();
const opts = tileLayerOptions('streets');

if (hasMapTilerKey) {
  console.log('  (running WITH a MapTiler key)');
  check('maptiler is selected', url.includes('api.maptiler.com'), url);
  check('key is appended', /[?&]key=[A-Za-z0-9_-]+/.test(url), url);
  check('style is streets-v2', url.includes('streets-v2'), url);
  check('retina {r} placeholder present', url.includes('{r}'), url);
  check('leaflet {z}/{x}/{y} present', url.includes('{z}/{x}/{y}'), url);
  check('detectRetina enabled for retina tiles', opts.detectRetina === true, JSON.stringify(opts));
  check('attribution credits MapTiler', attr.includes('MapTiler'), attr);
  check('attribution credits OpenStreetMap', attr.includes('OpenStreetMap'), attr);

  console.log('\n=== style selection (MapTiler only) ===');
  check('outdoor style resolves', tileUrlTemplate('outdoor').includes('outdoor-v2'), tileUrlTemplate('outdoor'));
  check('basic style resolves', tileUrlTemplate('basic').includes('basic-v2'), tileUrlTemplate('basic'));
  check('unknown style falls back to streets', tileUrlTemplate('nope').includes('streets-v2'), tileUrlTemplate('nope'));
} else {
  console.log('  (running WITHOUT a MapTiler key - fallback path)');
  check('falls back to OpenStreetMap tiles', url.includes('tile.openstreetmap.org'), url);
  check('no bogus key is sent', !url.includes('key='), url);
  check('no maptiler host leaks in', !url.includes('maptiler'), url);
  check('detectRetina disabled for OSM fallback', opts.detectRetina === false, JSON.stringify(opts));
  check('attribution credits OpenStreetMap', attr.includes('OpenStreetMap'), attr);
  check('attribution is never empty', attr.trim().length > 0, attr);

  console.log('\n=== style selection collapses to OSM when unconfigured ===');
  // Every style must return the SAME fallback URL - requesting "outdoor-v2"
  // without a key must not produce a maptiler URL with no key on it.
  for (const s of ['outdoor', 'basic', 'streets', 'nope']) {
    check(`"${s}" returns the OSM fallback`,
      tileUrlTemplate(s) === 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      tileUrlTemplate(s));
  }
}

console.log('\n=== style selection ===');
check('styles list has no vector-only styles',
  !Object.values(TILE_STYLES).some(s => s === 'light-v2' || s === 'dark-v2'),
  JSON.stringify(TILE_STYLES));

console.log('\n=== options sanity ===');
check('maxZoom present', opts.maxZoom >= 18, JSON.stringify(opts));
check('crossOrigin set for canvas safety', opts.crossOrigin === true, JSON.stringify(opts));

console.log(`\n${fail === 0 ? '*** ALL PASS ***' : '*** FAILURES ***'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);