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

const CACHE_KEY = 'safeher_local_reports_v2';
const PENDING_KEY = 'safeher_pending_reports_v1';

let reports = [];
let hydrated = false;
const listeners = new Set();

function notify() {
  listeners.forEach((l) => {
    try { l(); } catch {}
  });
}

async function persistCache() {
  await storageSet(CACHE_KEY, reports.slice(0, 100));
}

/** Load the cached reports once (so the UI shows something before the network responds). */
async function hydrate() {
  if (hydrated) return;
  hydrated = true;
  const cached = await storageGet(CACHE_KEY, []);
  const pending = await storageGet(PENDING_KEY, []);
  const cachedList = Array.isArray(cached) ? cached : [];
  const pendingList = Array.isArray(pending) ? pending : [];
  reports = [...pendingList, ...cachedList];
  if (reports.length) notify();
}

hydrate();

export function getReports() {
  return reports;
}

/** Pull the latest reports from the backend and merge with any pending (unsynced) ones. */
export async function refreshReports(coords = null) {
  await hydrate();
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
 * If the backend is unreachable, it is queued and retried on the next refresh/add.
 * @returns {Promise<{ ok, offline }>}
 */
export async function addReport(report) {
  await hydrate();

  const optimistic = {
    id: `local-${Date.now()}`,
    category: report.category || 'Other',
    location_label: report.location_label || '',
    details: report.details || '',
    lat: report.lat ?? null,
    lng: report.lng ?? null,
    has_photo: !!report.image_uri,
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
    return { ok: true, offline: false };
  } catch {
    // Queue for later sync and keep the optimistic entry visible.
    const pending = await storageGet(PENDING_KEY, []);
    const pendingList = Array.isArray(pending) ? pending : [];
    pendingList.unshift(optimistic);
    await storageSet(PENDING_KEY, pendingList.slice(0, 50));
    await persistCache();
    return { ok: false, offline: true };
  }
}

export function subscribeReports(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
