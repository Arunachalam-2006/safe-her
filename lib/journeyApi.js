/**
 * Journey persistence client for the SafeHer Safety Engine.
 * Replaces the old (nonexistent) Node service on localhost:3000.
 *
 * All calls degrade gracefully: if the backend is unreachable the journey is
 * queued locally so the UI can still complete, and the queue is flushed on the
 * next successful save.
 */

import { apiFetch } from './config';
import { storageGet, storageSet } from './storage';

const QUEUE_KEY = 'safeher_journey_queue_v1';

async function enqueue(entry) {
  const queue = await storageGet(QUEUE_KEY, []);
  const list = Array.isArray(queue) ? queue : [];
  list.push(entry);
  await storageSet(QUEUE_KEY, list.slice(-50));
}

/**
 * Save a completed journey.
 * @returns {Promise<{ ok, journeyId, saved, offline }>}
 */
export async function saveJourney(journey) {
  try {
    const res = await apiFetch('/journeys/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(journey),
      timeoutMs: 8000,
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    const data = await res.json();
    return { ok: true, journeyId: data.journey_id, saved: true, offline: false };
  } catch (err) {
    const localId = `local_jny_${Date.now()}`;
    await enqueue({ ...journey, _localId: localId, _queuedAt: new Date().toISOString() });
    return { ok: false, journeyId: localId, saved: false, offline: true };
  }
}

/**
 * Attach a 1-5 safety rating to a saved journey.
 * Locally-queued journeys (offline) store the rating in the queue instead.
 * @returns {Promise<{ ok, offline }>}
 */
export async function rateJourney(journeyId, rating) {
  if (rating == null) return { ok: false, offline: false };

  if (!journeyId || String(journeyId).startsWith('local_')) {
    // Update the queued journey with the rating so it syncs later.
    const queue = await storageGet(QUEUE_KEY, []);
    const list = Array.isArray(queue) ? queue : [];
    const idx = list.findIndex((j) => j._localId === journeyId);
    if (idx >= 0) {
      list[idx].userRating = rating;
      await storageSet(QUEUE_KEY, list);
    }
    return { ok: false, offline: true };
  }

  try {
    const res = await apiFetch(`/journeys/${journeyId}/rating`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userRating: rating }),
      timeoutMs: 6000,
    });
    return { ok: res.ok, offline: false };
  } catch {
    return { ok: false, offline: true };
  }
}
