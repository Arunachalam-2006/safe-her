/**
 * Community reports store — backed by the SafeHer Safety Engine (/reports),
 * with a cross-platform local cache for instant reads and offline resilience.
 *
 * - getReports()      → synchronous read of the in-memory cache
 * - refreshReports()  → pull latest from backend (optionally near lat/lng)
 * - addReport()       → optimistic add + POST to backend; queues offline
 * - subscribeReports()→ notified whenever the cache changes
 */

import { apiFetch } from './config';
import { storageGet, storageSet } from './storage';
import { uploadReportImage } from './supabase';

const CACHE_KEY = 'safeher_local_reports_v2';
const PENDING_KEY = 'safeher_pending_reports_v1';

let reports = [];
let hydrated = false;
let hydratePromise = null;
const listeners = new Set();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

async function persistCache() {
  await storageSet(CACHE_KEY, reports.filter((r) => !r._pending).slice(0, 100));
}

/**
 * Load the cached reports once (so the UI shows something before the network
 * responds).
 *
 * The previous version set `hydrated = true` BEFORE awaiting storage, so a
 * concurrent `addReport()` returned immediately, unshifted its optimistic entry
 * into `reports`, and then the still-pending hydrate overwrote `reports`
 * wholesale — silently losing the report the user had just submitted.
 * The in-flight promise is now shared so every caller waits for the same load.
 */
async function hydrate() {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = (async () => {
      const cached = await storageGet(CACHE_KEY, []);
      const pending = await storageGet(PENDING_KEY, []);
      const cachedList = Array.isArray(cached) ? cached : [];
      const pendingList = Array.isArray(pending) ? pending : [];
      // Only overwrite once, and only if nothing was added while loading.
      if (reports.length === 0) {
        reports = [...pendingList, ...cachedList];
      } else {
        const existing = new Set(reports.map((r) => r.id));
        reports = [
          ...reports,
          ...pendingList.filter((r) => !existing.has(r.id)),
          ...cachedList.filter((r) => !existing.has(r.id)),
        ];
      }
      hydrated = true;
      if (reports.length) notify();
    })();
  }
  return hydratePromise;
}

hydrate();

export function getReports() {
  return reports;
}

/**
 * Push anything sitting in the pending queue to the backend.
 *
 * This did not exist: `refreshReports` merged the pending list into the local
 * cache and never POSTed it, so a report filed while offline was displayed to
 * the user as if saved and was then never transmitted. The UI claimed it
 * "will sync ... when you are back online".
 */
export async function flushPendingReports() {
  await hydrate();
  const pending = await storageGet(PENDING_KEY, []);
  const pendingList = Array.isArray(pending) ? pending : [];
  if (!pendingList.length) return { flushed: 0, remaining: 0 };

  const stillPending = [];
  let flushed = 0;

  for (const item of pendingList) {
    const payload = {
      category: item.category || 'Other',
      location_label: item.location_label || '',
      details: item.details || '',
      lat: item.lat ?? null,
      lng: item.lng ?? null,
      has_photo: !!item.has_photo,
    };
    // Carry the stored evidence path through the offline queue. Without this a
    // report filed while offline would arrive at the backend with the image
    // already uploaded but no reference to it, so the officer would see
    // has_photo=true and nothing to look at.
    if (Array.isArray(item.evidence) && item.evidence.length) {
      payload.evidence = item.evidence;
    }
    try {
      const res = await apiFetch('/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        timeoutMs: 8000,
      });
      if (!res.ok) {
        // 503 means storage is down on the engine; keep it queued.
        if (res.status >= 500) stillPending.push(item);
        continue;
      }
      const data = await res.json();
      const saved = data.report;
      if (saved) {
        reports = reports.map((r) => (r.id === item.id ? saved : r));
      } else {
        reports = reports.filter((r) => r.id !== item.id);
      }
      flushed += 1;
    } catch {
      // Network still down — keep it for next time.
      stillPending.push(item);
    }
  }

  await storageSet(PENDING_KEY, stillPending.slice(0, 50));
  await persistCache();
  notify();
  return { flushed, remaining: stillPending.length };
}

/** Pull the latest reports from the backend and merge with any pending (unsynced) ones. */
export async function refreshReports(coords = null) {
  await hydrate();
  // Give anything queued from a previous offline session a chance to go out.
  await flushPendingReports();
  try {
    const query = coords ? `?lat=${coords.lat}&lng=${coords.lng}` : '';
    const res = await apiFetch(`/reports${query}`, { timeoutMs: 8000 });
    if (!res.ok) throw new Error(`Reports fetch failed: ${res.status}`);
    const data = await res.json();
    const serverReports = Array.isArray(data.reports) ? data.reports : [];

    const pending = await storageGet(PENDING_KEY, []);
    const pendingList = Array.isArray(pending) ? pending : [];

    reports = [...pendingList, ...serverReports];
    await persistCache();
    notify();
    return { ok: true, offline: false };
  } catch {
    // Offline — keep whatever is cached.
    return { ok: false, offline: true };
  }
}

/**
 * Submit a new report. Adds it to the cache immediately (optimistic), then POSTs.
 * If the backend is unreachable, it is queued and flushed by `flushPendingReports`.
 *
 * Image handling: when a photo was picked it is uploaded to Supabase Storage
 * FIRST, and only a successful upload produces an `evidence` path. That order is
 * deliberate — it is the only way to guarantee a report is never submitted
 * carrying a path that does not resolve. If the upload fails for any reason the
 * report is not submitted at all and the caller is told why.
 *
 * A report with no photo never touches Storage and behaves exactly as before.
 *
 * @returns {Promise<{ ok, offline, failed, imageUploaded?, imageError?, imageKind? }>}
 */
export async function addReport(report) {
  await hydrate();

  // ── Stage 1: evidence upload (only when a photo was picked) ──
  const hasImage = !!(report.image_asset?.uri || report.image_uri);
  let evidence = [];
  let imageError = null;
  let imageKind = null;

  if (hasImage) {
    const uploaded = await uploadReportImage(report.image_asset || { uri: report.image_uri });
    if (uploaded.ok) {
      // Shape matches what the dashboard already renders: a list of objects with
      // a `uri`. `kind: 'supabase-storage'` records that the value is an object
      // PATH, not a directly loadable URL, so the dashboard knows it must
      // resolve it to a signed URL. Without that flag the path would go
      // straight into <Image> and render as a broken tile.
      evidence = [
        {
          uri: uploaded.path,
          kind: 'supabase-storage',
          bucket: 'report-images',
          uploaded_at: new Date().toISOString(),
        },
      ];
    } else {
      // Do NOT submit. A report carrying a broken evidence reference is worse
      // than no report, and the citizen UI must be able to say what went wrong.
      imageError = uploaded.message;
      imageKind = uploaded.kind;
      return { ok: false, offline: false, failed: true, imageError, imageKind };
    }
  }

  const optimistic = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    category: report.category || 'Other',
    location_label: report.location_label || '',
    details: report.details || '',
    lat: report.lat ?? null,
    lng: report.lng ?? null,
    has_photo: hasImage,
    // Present only when a photo actually uploaded, so a report with no photo
    // keeps producing byte-for-byte the previous payload.
    ...(evidence.length ? { evidence } : {}),
    created_at: new Date().toISOString(),
    _pending: true,
  };
  reports = [optimistic, ...reports];
  notify();

  const payload = {
    category: optimistic.category,
    location_label: optimistic.location_label,
    details: optimistic.details,
    lat: optimistic.lat,
    lng: optimistic.lng,
    has_photo: optimistic.has_photo,
    ...(evidence.length ? { evidence } : {}),
  };

  try {
    const res = await apiFetch('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeoutMs: 8000,
    });
    if (!res.ok) throw new Error(`Report save failed: ${res.status}`);
    const data = await res.json();
    const saved = data.report || optimistic;

    // Replace the optimistic entry with the server record.
    reports = reports.map((r) => (r.id === optimistic.id ? saved : r));
    await persistCache();
    notify();
    return { ok: true, offline: false, failed: false, imageUploaded: hasImage };
  } catch (error) {
    // The report stays queued and its evidence path rides along, so the
    // already-uploaded image is not orphaned. Deliberately NOT calling
    // removeReportImage here: this report may still be flushed later, and
    // deleting now would break the evidence reference we just queued.
    const pending = await storageGet(PENDING_KEY, []);
    const pendingList = Array.isArray(pending) ? pending : [];
    pendingList.unshift(optimistic);
    await storageSet(PENDING_KEY, pendingList.slice(0, 50));
    await persistCache();
    notify();
    return { ok: false, offline: true, failed: false, error, imageUploaded: hasImage };
  }
}

export function subscribeReports(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
