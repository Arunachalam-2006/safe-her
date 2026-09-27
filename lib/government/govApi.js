/**
 * Government dashboard data client.
 *
 * Talks to the `/government/*` endpoints on the existing Safety Engine, and
 * reuses the shared `apiFetch` helper in `lib/config.js` so there is exactly
 * one HTTP path in the project.
 *
 * Design rules:
 *  - READ-ONLY with respect to citizen data. Nothing here mutates a citizen
 *    record except through the explicit officer-action endpoints.
 *  - Every call degrades gracefully: if the backend is unreachable the screen
 *    falls back to the citizen report cache in `lib/localReports` so the
 *    dashboard is never blank, and always reports `offline: true` so the UI
 *    can say so honestly.
 */

import { apiFetch } from '../config';
import { getReports, refreshReports as refreshCitizenReports } from '../localReports';

const GOVERNMENT_PREFIX = '/government';

/* ── Normalisation ───────────────────────────────────────────────────── */

/** The citizen cache has no workflow fields; default them so the UI is stable. */
export function normaliseReport(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const createdAt = raw.created_at || raw.createdAt || null;
  const status = (raw.status || 'NEW').toUpperCase();
  const priority = (raw.priority || 'MEDIUM').toUpperCase();

  return {
    id: String(raw.id || ''),
    category: raw.category || 'Other',
    locationLabel: raw.location_label || raw.locationLabel || 'Unknown location',
    details: raw.details || '',
    lat: typeof raw.lat === 'number' ? raw.lat : null,
    lng: typeof raw.lng === 'number' ? raw.lng : null,
    hasPhoto: raw.has_photo ?? raw.hasPhoto ?? false,
    evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
    createdAt,
    updatedAt: raw.updated_at || raw.updatedAt || createdAt,
    status,
    priority,
    assignedTo: raw.assigned_to || raw.assignedTo || null,
    assignedDepartment: raw.assigned_department || raw.assignedDepartment || null,
    resolutionNotes: raw.resolution_notes || raw.resolutionNotes || '',
    actions: Array.isArray(raw.actions) ? raw.actions : [],
    pending: raw._pending === true,
  };
}

/* ── Reports ─────────────────────────────────────────────────────────── */

export async function fetchGovernmentReports() {
  try {
    const res = await apiFetch(`${GOVERNMENT_PREFIX}/reports`, { timeoutMs: 8000 });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.reports) ? data.reports : [];
      return { reports: list.map(normaliseReport).filter(Boolean), offline: false };
    }
  } catch {
    /* fall through to cache */
  }

  // Backend unavailable — fall back to the citizen report cache so the officer
  // still sees the reports collected on this device.
  try {
    await refreshCitizenReports(null);
  } catch {
    /* ignore */
  }
  const cached = getReports().map(normaliseReport).filter(Boolean);
  return { reports: cached, offline: true };
}

export async function fetchReportDetail(reportId) {
  try {
    const res = await apiFetch(`${GOVERNMENT_PREFIX}/reports/${encodeURIComponent(reportId)}`, {
      timeoutMs: 8000,
    });
    if (res.ok) {
      const data = await res.json();
      const report = normaliseReport(data.report);
      if (report) return { report, offline: false };
    }
  } catch {
    /* fall through to cache */
  }

  const cached = getReports().map(normaliseReport).find((r) => r.id === reportId);
  if (cached) return { report: cached, offline: true };
  return { report: null, offline: true };
}

/* ── Officer actions ─────────────────────────────────────────────────── */

export async function submitOfficerAction(reportId, payload) {
  const res = await apiFetch(`${GOVERNMENT_PREFIX}/reports/${encodeURIComponent(reportId)}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    timeoutMs: 8000,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.detail) detail = String(data.detail);
    } catch {
      /* keep default */
    }
    throw new Error(detail);
  }

  const data = await res.json();
  return {
    ok: true,
    action: data.action || null,
    report: normaliseReport(data.report) || null,
  };
}

export async function updateReportStatus(reportId, status, note) {
  return submitOfficerAction(reportId, {
    type: 'STATUS_CHANGE',
    to_status: status,
    notes: note || '',
  });
}

export async function closeReport(reportId, resolutionNotes) {
  return submitOfficerAction(reportId, {
    type: 'CLOSE',
    to_status: 'CLOSED',
    notes: resolutionNotes || '',
  });
}

/* ── Stats ───────────────────────────────────────────────────────────── */

export async function fetchGovernmentStats() {
  try {
    const res = await apiFetch(`${GOVERNMENT_PREFIX}/stats`, { timeoutMs: 6000 });
    if (res.ok) {
      const data = await res.json();
      return { stats: data.stats || data, offline: false };
    }
  } catch {
    /* fall through */
  }
  return { stats: null, offline: true };
}

/* ── SOS ─────────────────────────────────────────────────────────────── */

export async function fetchActiveSosAlerts() {
  try {
    const res = await apiFetch(`${GOVERNMENT_PREFIX}/sos`, { timeoutMs: 6000 });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data.alerts) ? data.alerts : [];
      return { alerts: list.map(normaliseSosAlert).filter(Boolean), offline: false };
    }
  } catch {
    /* fall through */
  }
  return { alerts: [], offline: true };
}

export function normaliseSosAlert(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id || raw.session_id || ''),
    status: (raw.status || 'ACTIVE').toUpperCase(),
    priority: (raw.priority || 'CRITICAL').toUpperCase(),
    lat: typeof raw.lat === 'number' ? raw.lat : null,
    lng: typeof raw.lng === 'number' ? raw.lng : null,
    accuracy: raw.accuracy ?? null,
    receivedAt: raw.received_at || raw.receivedAt || raw.started_at || null,
    contactCount: raw.contact_count ?? raw.contactCount ?? 0,
    assignedTo: raw.assigned_to || raw.assignedTo || null,
    notes: raw.notes || '',
    history: Array.isArray(raw.history) ? raw.history : [],
  };
}

export async function updateSosStatus(alertId, status, note) {
  const res = await apiFetch(`${GOVERNMENT_PREFIX}/sos/${encodeURIComponent(alertId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, notes: note || '' }),
    timeoutMs: 8000,
  });

  if (!res.ok) throw new Error(`Could not update alert (${res.status})`);
  const data = await res.json();
  return { ok: true, alert: normaliseSosAlert(data.alert) };
}

/* ── Derived helpers (pure, no network) ──────────────────────────────── */

export function countByStatus(reports) {
  const counts = { NEW: 0, UNDER_REVIEW: 0, ACTION_TAKEN: 0, RESOLVED: 0, CLOSED: 0 };
  reports.forEach((r) => {
    if (counts[r.status] != null) counts[r.status] += 1;
  });
  return counts;
}

export function daysPending(report) {
  if (!report?.createdAt) return 0;
  const then = new Date(report.createdAt).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}

export function isOverdue(report, thresholdDays = 2) {
  if (!report) return false;
  if (report.status === 'RESOLVED' || report.status === 'CLOSED') return false;
  return daysPending(report) >= thresholdDays;
}
