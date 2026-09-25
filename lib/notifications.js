/**
 * Notifications — derived from real app data (community reports + live spot
 * safety), with persisted read/unread state.
 *
 * There is no hardcoded notification content: items come from the reports
 * backend and the current area's safety analysis, gated by the user's
 * "Safety alerts" preference.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { storageGet, storageSet } from './storage';
import { getReports, subscribeReports, refreshReports } from './localReports';
import { usePreferences } from './preferences';

const READ_KEY = 'safeher_notifications_read_v1';

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** Build safety-status notifications from a spot-safety result. */
function buildSafetyNotifications(spot, prefs) {
  if (!spot) return [];
  const out = [];
  const f = spot.factors || {};
  const d = spot.details || {};
  const now = new Date().toISOString();

  if (spot._offline) {
    out.push({
      id: 'safety-offline',
      kind: 'offline',
      title: 'Live safety data unavailable',
      desc: 'Showing an estimated score for now. Reconnect for live area analysis.',
      time: now,
    });
    return out;
  }

  if (prefs.lowLightAlerts && typeof f.lighting === 'number' && f.lighting < 55) {
    const lamps = d.street_lamps;
    out.push({
      id: 'safety-lighting-low',
      kind: 'lighting',
      title: 'Low lighting in your area',
      desc: `${lamps != null ? `Only ${lamps} street lamp${lamps === 1 ? '' : 's'} mapped nearby. ` : ''}Prefer well-lit main roads after dark.`,
      time: now,
    });
  }

  if (prefs.patrolAlerts && d.police_nearby) {
    out.push({
      id: 'safety-police-near',
      kind: 'police',
      title: 'Police station nearby',
      desc: 'A police station is mapped within about 1 km of your location.',
      time: now,
    });
  }

  if (typeof spot.score === 'number' && spot.label) {
    out.push({
      id: 'safety-status',
      kind: 'status',
      title: `Area safety: ${spot.label}`,
      desc: `Current live safety score is ${spot.score}/100.`,
      time: now,
    });
  }

  return out;
}

function reportToNotification(report) {
  const where = report.location_label ? ` near ${report.location_label}` : '';
  const extra = report.details ? ` — ${report.details}` : '';
  return {
    id: `report-${report.id}`,
    kind: 'community',
    title: `Community report: ${report.category}`,
    desc: `A citizen flagged "${report.category}"${where}.${extra}`.trim(),
    time: report.created_at,
    pending: !!report._pending,
  };
}

/**
 * Hook: returns { notifications, unreadCount, markAllRead }.
 * @param {object|null} spot - latest spot-safety result (from fetchSpotSafety)
 * @param {object|null} coords - { lat, lng } used to refresh nearby reports
 */
export function useNotifications(spot, coords = null) {
  const { prefs } = usePreferences();
  const [reports, setReports] = useState(() => getReports());
  const [readIds, setReadIds] = useState(null); // null = not loaded yet

  useEffect(() => {
    refreshReports(coords);
    const unsub = subscribeReports(() => setReports([...getReports()]));
    storageGet(READ_KEY, []).then((ids) => setReadIds(Array.isArray(ids) ? ids : []));
    return unsub;
    // coords intentionally excluded: refreshed explicitly by the caller's fetch cycle
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const notifications = useMemo(() => {
    if (!prefs.safetyAlerts) return [];
    const communityItems = reports.slice(0, 8).map(reportToNotification);
    const safetyItems = buildSafetyNotifications(spot, prefs);
    return [...safetyItems, ...communityItems]
      .map((n) => ({ ...n, timeLabel: timeAgo(n.time) }))
      .sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [spot, prefs, reports]);

  const unreadCount = useMemo(() => {
    if (readIds == null) return 0;
    const readSet = new Set(readIds);
    return notifications.filter((n) => !readSet.has(n.id)).length;
  }, [notifications, readIds]);

  const markAllRead = useCallback(async () => {
    const ids = notifications.map((n) => n.id);
    setReadIds(ids);
    await storageSet(READ_KEY, ids);
  }, [notifications]);

  return { notifications, unreadCount, markAllRead };
}
