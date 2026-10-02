/**
 * Shared backend configuration for the SafeHer Safety Engine.
 *
 * Base URL resolution order:
 *   1. EXPO_PUBLIC_SAFETY_API_URL env var (the documented name — set this to
 *      your machine's LAN IP when running on a physical device, e.g.
 *      http://192.168.1.20:8000)
 *   2. EXPO_PUBLIC_SAFETY_API (legacy name, still honoured)
 *   3. http://localhost:8000 (default for web / simulator development)
 *
 * NOTE: both names are accepted because `.env`, `.env.example` and `eas.json`
 * all use the `_URL` suffix, which is the name to prefer going forward.
 */

const RAW_BASE =
  process.env.EXPO_PUBLIC_SAFETY_API_URL || process.env.EXPO_PUBLIC_SAFETY_API;

export const API_BASE =
  RAW_BASE && RAW_BASE.trim() && !RAW_BASE.includes('your_')
    ? RAW_BASE.trim().replace(/\/+$/, '')
    : 'http://localhost:8000';

/** The host portion of API_BASE, for diagnostics. */
export const API_HOST = (() => {
  try {
    return new URL(API_BASE).host;
  } catch {
    return API_BASE;
  }
})();

/** True when API_BASE points at loopback rather than a LAN address. */
export const API_IS_LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(API_HOST);

/**
 * Diagnose an unreachable engine.
 *
 * A browser reports BOTH of these as the identical, undiagnosable string
 * "Failed to fetch":
 *   1. nothing listening on that host:port
 *   2. the engine answered, but its CORS policy rejected the page's Origin
 * The second case is especially confusing because the engine is visibly
 * running in a terminal while the app claims it cannot be reached.
 *
 * This cannot fully separate the two from the browser (the CORS-blocked
 * response is never exposed to JS), but it CAN rule out the most common cause
 * and say something true instead of guessing.
 *
 * @param {string} kind - a SCORE_FAILURE kind
 * @returns {string} an actionable message
 */
export function describeEngineUnreachable(kind) {
  const base = API_BASE;
  if (kind === 'timeout') {
    return `The safety engine at ${base} took too long to answer. A live data source may be slow - try again in a moment.`;
  }
  if (!API_IS_LOOPBACK) {
    return `Can't reach the safety engine at ${base}. On a computer, "npm run engine" must pass --host 0.0.0.0; bound to 127.0.0.1 only, the LAN address in .env will not answer.`;
  }
  return `Can't reach the safety engine at ${base}. Start it with "npm run engine", then try again.`;
}

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
