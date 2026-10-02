/**
 * Stage 2 verification — report image upload logic in lib/supabase.js.
 *
 * Exercises the REAL exported functions with a stubbed global.fetch and a
 * stubbed Supabase client, so no Supabase project and no network is needed.
 *
 * What this can and cannot prove:
 *   - It proves the 4 MB gate, the anonymity of the generated path, the
 *     never-throw contract, and that no path is invented on failure.
 *   - It CANNOT prove a real upload works: that needs the real bucket and the
 *     Storage RLS policies, which have not been applied.
 */

import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

globalThis.__DEV__ = false;

// Transpile the real lib/ modules to CJS in a project-local temp dir so bare
// Node can resolve both the extensionless imports and node_modules.
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = mkdtempSync(join(ROOT, '.verify-upl-'));
mkdirSync(join(OUT, 'lib'), { recursive: true });

// lib/supabase.js pulls in lib/storage.js and lib/config.js; neither drags in
// react-native, so they are loaded for real.
const done = new Set();
function load(rel) {
  const key = rel.replace(/\\/g, '/');
  if (done.has(key)) return require(join(OUT, key));
  done.add(key);
  const abs = join(ROOT, rel);
  const { code } = babel.transformSync(readFileSync(abs, 'utf8'), {
    filename: abs,
    plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')],
    babelrc: false,
    configFile: false,
  });
  const out = code.replace(/(require\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) => {
    if (spec.endsWith('.js') || spec.endsWith('.json')) return m;
    return `${a}${spec}.js${b}`;
  });
  writeFileSync(join(OUT, key), out);
  for (const m of out.matchAll(/require\(\s*['"](\.\.?\/[^'"]+?)['"]\)/g)) {
    const spec = m[1];
    if (spec.endsWith('.json')) continue;
    const dep = spec.replace(/^\.\//, 'lib/');
    if (existsSync(join(ROOT, dep))) load(dep);
  }
  return require(join(OUT, key));
}

// Supabase is intentionally NOT configured for the first block: this is the
// exact situation on a machine with no EXPO_PUBLIC_SUPABASE_* values, which is
// the case that previously threw a TypeError.
const sup = load('lib/supabase.js');

/**
 * Load a SECOND, independent copy of lib/supabase.js with Supabase configured,
 * so the upload paths (size gate, unreadable file, RLS error) can be exercised
 * without a real Supabase project. `config` is computed once at module load, so
 * a fresh transpile + fresh temp dir is the only way to change it.
 */
function configuredInstance() {
  const dir = mkdtempSync(join(ROOT, '.verify-upl2-'));
  mkdirSync(join(dir, 'lib'), { recursive: true });
  const seen = new Set();
  const req = createRequire(import.meta.url);
  const load2 = (rel) => {
    const key = rel.replace(/\\/g, '/');
    if (seen.has(key)) return req(join(dir, key));
    seen.add(key);
    const abs = join(ROOT, rel);
    const { code } = babel.transformSync(readFileSync(abs, 'utf8'), {
      filename: abs,
      plugins: [req.resolve('@babel/plugin-transform-modules-commonjs')],
      babelrc: false,
      configFile: false,
    });
    const out = code.replace(/(require\(\s*['"])(\.\.?\/[^'"]+?)(['"])/g, (m, a, spec, b) => {
      if (spec.endsWith('.js') || spec.endsWith('.json')) return m;
      return `${a}${spec}.js${b}`;
    });
    writeFileSync(join(dir, key), out);
    for (const m of out.matchAll(/require\(\s*['"](\.\.?\/[^'"]+?)['"]\)/g)) {
      const spec = m[1];
      if (spec.endsWith('.json')) continue;
      const dep = spec.replace(/^\.\//, 'lib/');
      if (existsSync(join(ROOT, dep))) load2(dep);
    }
    return req(join(dir, key));
  };
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://stub-project.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_stub_key_for_tests_only';
  const inst = load2('lib/supabase.js');
  delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!inst.isSupabaseConfigured) throw new Error('stub instance did not configure');
  return inst;
}

const cfg = configuredInstance();

/** Replace the real client's storage with a controllable stub. */
function stubStorage(inst, { upload, remove } = {}) {
  const calls = { upload: [], remove: [] };
  inst.supabase.storage.from = (bucket) => {
    calls.buckets = (calls.buckets || []).concat(bucket);
    return {
      upload: (...args) => { calls.upload.push(args); return upload ? upload(...args) : Promise.resolve({ data: {}, error: null }); },
      remove: (...args) => { calls.remove.push(args); return remove ? remove(...args) : Promise.resolve({ data: [], error: null }); },
    };
  };
  return calls;
}

/** A Blob of a chosen size, without allocating the bytes. */
function fakeBlob(size, type = 'image/jpeg') {
  return { size, type };
}

const MB = 1024 * 1024;

console.log('=== module surface ===');
check('REPORT_IMAGE_BUCKET is the existing bucket', sup.REPORT_IMAGE_BUCKET === 'report-images', sup.REPORT_IMAGE_BUCKET);
check('limit is 4 MB', sup.MAX_REPORT_IMAGE_BYTES === 4 * MB, sup.MAX_REPORT_IMAGE_BYTES);
check('uploadReportImage is a function', typeof sup.uploadReportImage === 'function');
check('removeReportImage is a function', typeof sup.removeReportImage === 'function');
check('IMAGE_UPLOAD kinds exported', sup.IMAGE_UPLOAD && sup.IMAGE_UPLOAD.TOO_LARGE === 'too_large');

console.log('\n=== the unconfigured stub exposes .storage (was a TypeError) ===');
check('supabase object exists', !!sup.supabase);
check('.storage exists on the stub', !!sup.supabase.storage, typeof sup.supabase.storage);
check('.storage.from is callable', typeof sup.supabase.storage?.from === 'function');
check('.storage.from().upload is callable', typeof sup.supabase.storage?.from('x')?.upload === 'function');
check('.storage.from().createSignedUrl is callable', typeof sup.supabase.storage?.from('x')?.createSignedUrl === 'function');
check('.storage.from().remove is callable', typeof sup.supabase.storage?.from('x')?.remove === 'function');
const stubRes = sup.supabase.storage.from('report-images').upload('a.jpg', 'x', {});
check('stub upload resolves (does not throw)', stubRes instanceof Promise);
const stubOut = await stubRes;
check('stub upload resolves to an error object', stubOut && stubOut.error && typeof stubOut.error.message === 'string', JSON.stringify(stubOut));
check('stub error is a config error', stubOut?.error?.isConfigError === true);

console.log('\n=== 4 MB gate ===');
check('exactly 4 MB is allowed', sup.checkReportImageSize(4 * MB).ok === true);
check('4 MB + 1 byte is rejected', sup.checkReportImageSize(4 * MB + 1).ok === false);
check('3.9 MB is allowed', sup.checkReportImageSize(Math.floor(3.9 * MB)).ok === true);
check('0 bytes rejected', sup.checkReportImageSize(0).ok === false);
check('NaN rejected', sup.checkReportImageSize(NaN).ok === false);
check('undefined rejected', sup.checkReportImageSize(undefined).ok === false);
check('a string size is coerced', sup.checkReportImageSize(String(2 * MB)).ok === true);

console.log('\n=== storage path anonymity ===');
const paths = Array.from({ length: 400 }, (_, i) => sup.buildReportImagePath('photo' + i + '.jpg'));
check('starts with reports/', paths.every(p => p.startsWith('reports/')), paths[0]);
check('has a jpg extension', paths.every(p => /\.jpg$/.test(p)), paths[0]);
check('all 400 paths are unique', new Set(paths).size === 400, new Set(paths).size);
check('no path contains the word user', !paths.some(p => /user/i.test(p)));
check('no path contains @ (email marker)', !paths.some(p => p.includes('@')));
check('no path contains digits-only id segments', paths.every(p => /reports\/[0-9a-f]{32}\.jpg$/.test(p)), paths[0]);
check('no path traversal possible', !paths.some(p => p.includes('..') || p.includes('/' + '/') || p.startsWith('/')));

console.log('\n=== extension is allowlisted, never taken raw from the filename ===');
check('png preserved', sup.buildReportImagePath('a.png').endsWith('.png'), sup.buildReportImagePath('a.png'));
check('jpeg preserved', sup.buildReportImagePath('a.jpeg').endsWith('.jpeg'));
check('query string ignored', sup.buildReportImagePath('a.jpg?x=1').endsWith('.jpg'), sup.buildReportImagePath('a.jpg?x=1'));
check('no extension -> jpg', sup.buildReportImagePath('noext').endsWith('.jpg'), sup.buildReportImagePath('noext'));
const evil = sup.buildReportImagePath('../../etc/passwd');
check('traversal filename cannot escape reports/', evil.startsWith('reports/') && !evil.includes('..'), evil);
check('traversal filename is not a .sh', !evil.endsWith('.sh'), evil);
const weird = sup.buildReportImagePath('a.b c/d<e>f"g.jpg');
check('spaces/specials in filename ignored', weird.startsWith('reports/') && /^reports\/[0-9a-f]{32}\.[a-z0-9]{2,5}$/.test(weird), weird);
check('no filename is ever empty-crash', typeof sup.buildReportImagePath() === 'string');
check('undefined filename handled', /^reports\/[0-9a-f]{32}\.jpg$/.test(sup.buildReportImagePath(undefined)));

console.log('\n=== uploadReportImage NEVER THROWS and never invents a path ===');
// Unconfigured Supabase: must resolve, must not invent a path.
const unconfigured = await sup.uploadReportImage({ uri: 'file:///tmp/a.jpg', fileName: 'a.jpg', fileSize: 1000, mimeType: 'image/jpeg' });
check('resolves (no throw)', !!unconfigured);
check('ok is false', unconfigured.ok === false);
check('path is null — no fake reference', unconfigured.path === null, JSON.stringify(unconfigured.path));
check('kind is not_configured', unconfigured.kind === 'not_configured', unconfigured.kind);
check('message is user-facing text', typeof unconfigured.message === 'string' && unconfigured.message.length > 10);

const noAsset = await sup.uploadReportImage(null);
check('null asset resolves', noAsset.ok === false);
check('null asset -> null path', noAsset.path === null);
// NOTE: with Supabase unconfigured the config check fires first, so
// not_configured (not no_file) is the correct answer. Documented behaviour.
check('null asset -> not_configured (config check is first)', noAsset.kind === 'not_configured', noAsset.kind);

console.log('\n=== no_file / too_large / unreadable, with Supabase CONFIGURED ===');
check('stub instance is configured', cfg.isSupabaseConfigured === true);
let fetchCalled = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { fetchCalled += 1; return Promise.reject(new Error('should not be reached')); };
stubStorage(cfg);

const noUri = await cfg.uploadReportImage({ fileName: 'a.jpg' });
check('missing uri -> no_file', noUri.kind === 'no_file', noUri.kind);
check('missing uri -> null path', noUri.path === null);
check('missing uri never reached fetch', fetchCalled === 0, fetchCalled);

console.log('\n=== the 4 MB gate fires BEFORE any network read ===');
const oversize = await cfg.uploadReportImage({
  uri: 'file:///tmp/big.jpg', fileName: 'big.jpg', fileSize: 5 * MB, mimeType: 'image/jpeg',
});
check('oversize rejected', oversize.ok === false, JSON.stringify(oversize));
check('kind is too_large', oversize.kind === 'too_large', oversize.kind);
check('path is null (no broken reference)', oversize.path === null);
check('size reported back to the caller', oversize.size === 5 * MB, oversize.size);
check('fetch was NEVER called for an oversize file', fetchCalled === 0, fetchCalled);
check('message mentions 4 MB', /4 MB/.test(oversize.message), oversize.message);
check('message says the report was not sent', /not been sent/i.test(oversize.message), oversize.message);

// 4 MB + 1 byte, the exact boundary the bucket enforces.
const justOver = await cfg.uploadReportImage({
  uri: 'file:///tmp/o.jpg', fileName: 'o.jpg', fileSize: 4 * MB + 1, mimeType: 'image/jpeg',
});
check('4 MB + 1 byte rejected', justOver.kind === 'too_large', justOver.kind);

// The picker sometimes omits fileSize, so the blob is the authoritative check.
console.log('\n=== blob.size is checked when fileSize is absent ===');
globalThis.fetch = () => Promise.resolve({ blob: async () => fakeBlob(9 * MB) });
const noSizeOversize = await cfg.uploadReportImage({ uri: 'file:///tmp/x.jpg', fileName: 'x.jpg' });
check('no fileSize + 9 MB blob -> too_large', noSizeOversize.kind === 'too_large', noSizeOversize.kind);
check('blob size reported', noSizeOversize.size === 9 * MB, noSizeOversize.size);
check('no upload attempted for an oversize blob', noSizeOversize.path === null);

console.log('\n=== unreadable file ===');
globalThis.fetch = () => Promise.reject(new TypeError('Network request failed'));
const unreadable = await cfg.uploadReportImage({ uri: 'file:///nope.jpg', fileName: 'nope.jpg' });
check('unreadable resolves, no throw', !!unreadable);
check('kind is unreadable', unreadable.kind === 'unreadable', unreadable.kind);
check('path is null', unreadable.path === null);

globalThis.fetch = () => Promise.resolve({ blob: async () => { throw new Error('blob failed'); } });
const blobFail = await cfg.uploadReportImage({ uri: 'file:///x.jpg' });
check('blob() failure -> unreadable', blobFail.kind === 'unreadable', blobFail.kind);

console.log('\n=== SUCCESS: a path is returned only when upload succeeds ===');
globalThis.fetch = () => Promise.resolve({ blob: async () => fakeBlob(500 * 1024, 'image/jpeg') });
let okCalls = stubStorage(cfg);
const good = await cfg.uploadReportImage({ uri: 'file:///tmp/good.jpg', fileName: 'good.jpg', fileSize: 500 * 1024, mimeType: 'image/jpeg' });
check('ok is true', good.ok === true, JSON.stringify(good));
check('a real path is returned', typeof good.path === 'string' && good.path.startsWith('reports/'), good.path);
check('path matches reports/<32 hex>.jpg', /^reports\/[0-9a-f]{32}\.jpg$/.test(good.path), good.path);
check('upload targeted the report-images bucket', (okCalls.buckets || []).includes('report-images'), JSON.stringify(okCalls.buckets));
check('upsert is false (never overwrite evidence)', okCalls.upload[0]?.[2]?.upsert === false, JSON.stringify(okCalls.upload[0]?.[2]));
check('contentType forwarded', okCalls.upload[0]?.[2]?.contentType === 'image/jpeg', JSON.stringify(okCalls.upload[0]?.[2]));
check('no error message on success', good.message === null, good.message);
check('size reported', good.size === 500 * 1024, good.size);

console.log('\n=== RLS denial is reported precisely ===');
stubStorage(cfg, { upload: () => Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy' } }) });
const denied = await cfg.uploadReportImage({ uri: 'file:///tmp/d.jpg', fileName: 'd.jpg', fileSize: 1000, mimeType: 'image/jpeg' });
check('ok is false', denied.ok === false);
check('kind is rls_denied', denied.kind === 'rls_denied', denied.kind);
check('path is null — no broken reference stored', denied.path === null);
check('message names the storage policy', /storage security policy/i.test(denied.message), denied.message);
check('message says the report was not sent', /not been sent/i.test(denied.message), denied.message);

console.log('\n=== a generic Storage error is NOT mislabelled as RLS ===');
stubStorage(cfg, { upload: () => Promise.resolve({ data: null, error: { message: 'Payload too large' } }) });
const generic = await cfg.uploadReportImage({ uri: 'file:///tmp/g.jpg', fileName: 'g.jpg', fileSize: 1000, mimeType: 'image/jpeg' });
check('kind is upload_failed', generic.kind === 'upload_failed', generic.kind);
check('path is null', generic.path === null);

console.log('\n=== upload() itself throwing is contained ===');
stubStorage(cfg, { upload: () => { throw new Error('boom'); } });
const threw = await cfg.uploadReportImage({ uri: 'file:///tmp/t.jpg', fileName: 't.jpg', fileSize: 1000, mimeType: 'image/jpeg' });
check('resolves rather than propagating', !!threw && threw.ok === false, JSON.stringify(threw));
check('kind is upload_failed', threw.kind === 'upload_failed', threw.kind);

console.log('\n=== removeReportImage ===');
globalThis.fetch = realFetch;
const rmCalls = stubStorage(cfg);
check('remove with a path succeeds', (await cfg.removeReportImage('reports/x.jpg')) === true);
check('remove targeted report-images', (rmCalls.buckets || []).includes('report-images'));
check('remove was passed an array', Array.isArray(rmCalls.remove[0]?.[0]) && rmCalls.remove[0][0][0] === 'reports/x.jpg', JSON.stringify(rmCalls.remove[0]));
check('remove with no path is a no-op', (await cfg.removeReportImage(null)) === false);
check('remove with empty path is a no-op', (await cfg.removeReportImage('')) === false);
check('remove never throws when unconfigured', (await sup.removeReportImage('reports/x.jpg')) === false);
check('remove never throws with no path', (await sup.removeReportImage(null)) === false);

console.log(`\n${fail === 0 ? '*** ALL PASS ***' : '*** FAILURES ***'}: ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
