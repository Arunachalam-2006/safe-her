/**
 * Shared backend configuration for the SafeHer Safety Engine.
 *
 * Base URL resolution order:
 *   1. EXPO_PUBLIC_SAFETY_API env var (set this to your machine's LAN IP when
 *      running on a physical device, e.g. http://192.168.1.20:8000)
 *   2. http://localhost:8000 (default for web / simulator development)
 */

const RAW_BASE = process.env.EXPO_PUBLIC_SAFETY_API;

export const API_BASE =
  RAW_BASE && RAW_BASE.trim() && !RAW_BASE.includes('your_')
    ? RAW_BASE.trim().replace(/\/+$/, '')
    : 'http://localhost:8000';

/**
 * fetch() against the safety engine with a hard timeout via AbortController.
 * Throws on network failure/timeout so callers can apply their own fallback.
 *
 * @param {string} path - path beginning with "/" (e.g. "/safety/hubs")
 * @param {object} options - fetch options; `timeoutMs` (default 8000) is extracted
 */
export async function apiFetch(path, { timeoutMs = 8000, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
