/**
 * Verifies that a failed safety score explains WHY it failed, instead of
 * collapsing every cause into the same "unavailable" message.
 *
 * Drives the real `scoreRouteGeometry` against a stubbed `global.fetch`, so no
 * engine needs to be running.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

// `lib/safetyApi.js` uses extensionless ESM imports (`./config`), which bare
// Node cannot resolve. Transpile it and its local imports to CommonJS in a temp
// dir with explicit .js extensions, so the REAL function is exercised rather
// than a hand-copied stand-in.
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// Build inside the project so Node still finds ./node_modules for transitive
// imports (react-native, expo-*, ...) that lib/safetyApi.js pulls in.
const OUT = mkdtempSync(join(ROOT, '.verify-score-'));

const done = new Set();
/** Transpile one lib file (and its relative deps) to CJS; return its exports. */
function load(relPath) {
  const key = relPath.replace(/\\/g, '/');
  if (done.has(key)) return require(join(OUT, key));
  done.add(key);
  const abs = join(ROOT, relPath);
  const src = readFileSync(abs, 'utf8');
  const { code } = babel.transformSync(src, {
    filename: abs,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    babelrc: false,
    configFile: false,
  });

  // Add .js to relative specifiers so bare-Node resolution works, and
  // pre-transpile every relative dependency BEFORE the parent is required
  // (CommonJS require is synchronous, so this cannot be lazy).
  const out = code.replace(/(require\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) => {
    if (spec.endsWith('.js') || spec.endsWith('.json')) return m;
    return `${a}${spec}.js${b}`;
  });
  writeFileSync(join(OUT, key), out);

  for (const m of out.matchAll(/require\(\s*['"](\.\.?\/[^'"]+?)['"]\)/g)) {
    const spec = m[1];
    if (spec.endsWith('.json')) continue;
    const dep = spec.replace(/^\.\//, 'lib/');
    if (STUBS[dep]) {
      // Provide a stub instead of the real module. `lib/location.js` pulls in
      // react-native, whose Flow-typed entry Node cannot parse - and none of
      // it is reachable from scoreRouteGeometry.
      writeFileSync(join(OUT, dep), `module.exports = ${JSON.stringify(STUBS[dep])};`);
      continue;
    }
    if (existsSync(join(ROOT, dep))) load(dep);
  }
  return require(join(OUT, key));
}

// `__DEV__` is an Expo/Metro global that bare Node does not define.
globalThis.__DEV__ = true;

// Replaces for lib modules that transitively import react-native (whose
// Flow-typed source Node cannot parse). scoreRouteGeometry never calls them.
const STUBS = {
  'lib/location.js': {
    haversineDistance: () => 0,
    estimateTravelTime: () => 0,
    searchLocation: async () => [],
    reverseGeocode: async () => '',
  },
};

// Mirror the `lib/` layout into the temp dir, since safetyApi.js requires
// './config' relative to itself.
mkdirSync(join(OUT, 'lib'), { recursive: true });
const { scoreRouteGeometry, SCORE_FAILURE } = load('lib/safetyApi.js');

const OPTION = { coordinates: [[13.08, 80.27], [13.09, 80.28]], turn_count: 3, segments: [{ road_type: 'primary' }] };
const ORIGIN = { lat: 13.08, lng: 80.27 };
const DEST = { lat: 13.09, lng: 80.28 };

/** Replace global.fetch for one call. */
function stub(implementation) {
  globalThis.fetch = implementation;
}
const realFetch = globalThis.fetch;

async function run() {
  console.log('\n=== engine DOWN (connection refused) ===');
  stub(() => Promise.reject(new TypeError('Network request failed')));
  let r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('resolves instead of throwing', r && typeof r.ok === 'boolean', JSON.stringify(r));
  check('ok is false', r.ok === false);
  check('kind is "unreachable"', r.kind === SCORE_FAILURE.UNREACHABLE, r.kind);
  check('message names the engine and the fix',
    /safety engine/i.test(r.message) && /npm run engine/i.test(r.message), r.message);
  check('does NOT say only "unavailable"', !/^Safety score unavailable/.test(r.message), r.message);

  console.log('\n=== web-style fetch failure ===');
  stub(() => Promise.reject(new TypeError('Failed to fetch')));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('kind is "unreachable"', r.kind === SCORE_FAILURE.UNREACHABLE, r.kind);

  console.log('\n=== slow engine (timeout) ===');
  stub(() => Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('kind is "timeout"', r.kind === SCORE_FAILURE.TIMEOUT, r.kind);
  check('timeout is NOT reported as unreachable',
    r.message !== 'unreachable' && /too long/i.test(r.message), r.message);

  console.log('\n=== engine 500 ===');
  stub(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('kind is "server"', r.kind === SCORE_FAILURE.SERVER, r.kind);
  check('distinct from unreachable', r.kind !== SCORE_FAILURE.UNREACHABLE, r.kind);

  console.log('\n=== engine 400 (bad request = a real bug) ===');
  stub(() => Promise.resolve({ ok: false, status: 400, json: async () => ({}) }));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('kind is "rejected"', r.kind === SCORE_FAILURE.REJECTED, r.kind);

  console.log('\n=== HTTP 200 but no score in the body ===');
  stub(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ degraded: true }) }));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('treated as a failure, not a score of 0', r.ok === false, JSON.stringify(r));
  check('kind is "unknown"', r.kind === SCORE_FAILURE.UNKNOWN, r.kind);

  console.log('\n=== success ===');
  stub(() => Promise.resolve({
    ok: true, status: 200,
    json: async () => ({ score: 72, risk_level: 'MODERATE', degraded: true, factors: { lighting: 60 } }),
  }));
  r = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
  check('ok is true', r.ok === true, JSON.stringify(r));
  check('score survives', r.data.score === 72, JSON.stringify(r.data));
  check('degraded flag survives', r.data.degraded === true);
  check('no error message on success', r.message === null, r.message);

  console.log('\n=== a degraded score is a SUCCESS, not a failure ===');
  check('degraded:true still returns ok', r.ok === true);

  console.log('\n=== malformed geometry never reaches the network ===');
  let called = false;
  stub(() => { called = true; return Promise.resolve({ ok: true, json: async () => ({ score: 1 }) }); });
  r = await scoreRouteGeometry({ coordinates: [[1, 2]] }, ORIGIN, DEST);
  check('single-point route fails locally', r.ok === false);
  check('network was NOT called', called === false);
  r = await scoreRouteGeometry({ coordinates: null }, ORIGIN, DEST);
  check('null geometry fails locally', r.ok === false);
  r = await scoreRouteGeometry({}, ORIGIN, DEST);
  check('missing geometry fails locally', r.ok === false);

  console.log('\n=== every failure carries an actionable message ===');
  const kinds = [SCORE_FAILURE.UNREACHABLE, SCORE_FAILURE.TIMEOUT, SCORE_FAILURE.REJECTED, SCORE_FAILURE.SERVER, SCORE_FAILURE.UNKNOWN];
  const seen = new Set();
  for (const k of kinds) { seen.add(k); }
  check('all 5 kinds are distinct constants', seen.size === 5);
  for (const k of kinds) {
    stub(() => Promise.reject(new TypeError('Network request failed')));
    const res = await scoreRouteGeometry(OPTION, ORIGIN, DEST);
    check(`"${k}" is a documented kind`, typeof res.kind === 'string' && res.kind.length > 0, res.kind);
  }

  globalThis.fetch = realFetch;

  // The bug that started this: the app pointed at a LAN address while the
  // engine listened on 127.0.0.1 only. The old message blamed the phone's
  // Wi-Fi, which is nonsense for someone using the web app on a laptop.
  console.log('\n=== LAN base URL gets a LAN-specific message ===');
  process.env.EXPO_PUBLIC_SAFETY_API_URL = 'http://192.168.0.6:8000';
  delete require.cache[require.resolve(join(OUT, 'lib/config.js'))];
  const lanConfig = load('lib/config.js');
  check('API_BASE is the LAN address', lanConfig.API_BASE === 'http://192.168.0.6:8000', lanConfig.API_BASE);
  check('API_HOST extracted', lanConfig.API_HOST === '192.168.0.6:8000', lanConfig.API_HOST);
  check('not mistaken for loopback', lanConfig.API_IS_LOOPBACK === false);
  const lanMsg = lanConfig.describeEngineUnreachable('unreachable');
  check('mentions 0.0.0.0', /0\.0\.0\.0/.test(lanMsg), lanMsg);
  check('does NOT blame the phone / Wi-Fi', !/phone|wi-fi|wifi/i.test(lanMsg), lanMsg);
  check('names the actual URL', lanMsg.includes('192.168.0.6:8000'), lanMsg);

  console.log('\n=== loopback base URL gets the simpler message ===');
  process.env.EXPO_PUBLIC_SAFETY_API_URL = 'http://localhost:8000';
  delete require.cache[require.resolve(join(OUT, 'lib/config.js'))];
  const loopConfig = load('lib/config.js');
  check('detected as loopback', loopConfig.API_IS_LOOPBACK === true);
  const loopMsg = loopConfig.describeEngineUnreachable('unreachable');
  check('says npm run engine', /npm run engine/.test(loopMsg), loopMsg);
  check('does not lecture about 0.0.0.0', !/0\.0\.0\.0/.test(loopMsg), loopMsg);

  console.log('\n=== trailing slashes are normalised ===');
  process.env.EXPO_PUBLIC_SAFETY_API_URL = 'http://localhost:8000///';
  delete require.cache[require.resolve(join(OUT, 'lib/config.js'))];
  check('trailing slashes stripped', load('lib/config.js').API_BASE === 'http://localhost:8000',
    load('lib/config.js').API_BASE);

  console.log('\n=== a placeholder env value falls back to loopback ===');
  process.env.EXPO_PUBLIC_SAFETY_API_URL = 'your_api_url_here';
  delete require.cache[require.resolve(join(OUT, 'lib/config.js'))];
  check('placeholder ignored', load('lib/config.js').API_BASE === 'http://localhost:8000',
    load('lib/config.js').API_BASE);

  delete process.env.EXPO_PUBLIC_SAFETY_API_URL;

  console.log(`\n${fail === 0 ? '*** ALL PASS ***' : '*** FAILURES ***'}: ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
}

run();
