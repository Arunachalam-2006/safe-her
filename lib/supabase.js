/**
 * Supabase client for Safe-Her.
 *
 * Responsibilities
 * ----------------
 *  1. Read configuration from environment variables (never hardcoded).
 *  2. Validate that configuration before use, including a guard that refuses a
 *     leaked `service_role` / secret key.
 *  3. Provide ONE shared client with a persistent session, automatic token
 *     refresh and an auth-state subscription API.
 *  4. Never throw at import time. If Supabase is not configured, every call
 *     returns a structured, user-presentable error instead of crashing the app.
 *
 * Security notes
 * --------------
 *  * Only the *publishable* (anon) key belongs in a client. The `service_role`
 *    key bypasses Row Level Security and must never reach a device; this
 *    module actively detects and rejects it.
 *  * Tokens are persisted with AsyncStorage, which is the React Native
 *    standard. Nothing sensitive beyond the Supabase session is written.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const ENV_KEYS = {
  url: 'EXPO_PUBLIC_SUPABASE_URL',
  publishableKey: 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  redirectUrl: 'EXPO_PUBLIC_SUPABASE_REDIRECT_URL',
};

const DEFAULT_REDIRECT_URL = 'myapp://auth/reset';

// ── Configuration ─────────────────────────────────────────────────────

/**
 * Normalise one env value.
 *
 * Takes the VALUE, not the key name, on purpose. Expo's Metro transform can
 * only inline `EXPO_PUBLIC_*` when the property access is statically
 * analysable - `process.env.SOMETHING`. A dynamic `process.env[key]` is left
 * as a runtime lookup, and a release bundle has no `process.env` at all, so
 * every EXPO_PUBLIC_ read through this helper silently came back empty on
 * Android. That is why Supabase reported "not configured" in the APK while
 * `lib/config.js` and `lib/mapTiles.js` (which read their variables directly)
 * worked fine. `expo/no-dynamic-env-var` flags this exact pattern.
 */
function readEnv(raw) {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  // Treat obvious copy-paste placeholders as "not set".
  if (/^(your[_-]|<|xxx|todo|changeme|placeholder)/i.test(value)) return '';
  return value;
}

// Read EXPO_PUBLIC_* directly - see readEnv() for why the key name cannot be
// passed in.
const RAW_URL = readEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
const RAW_KEY = readEnv(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

/**
 * Detects keys that must never be used from a client.
 * - new style secret : `sb_secret_...`
 * - legacy JWT secret: contains `"role":"service_role"` once decoded
 */
function findLeakedSecretKey(key) {
  if (!key) return null;
  if (key.startsWith('sb_secret_')) return 'sb_secret_…';
  if (!key.startsWith('eyJ')) return null;
  try {
    const payload = key.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (json && json.role === 'service_role') return 'service_role';
  } catch {
    /* not a decodable JWT - let the real request report the problem */
  }
  return null;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** @returns {{ ok: boolean, code: string|null, message: string|null }} */
export function validateSupabaseConfig() {
  if (!RAW_URL && !RAW_KEY) {
    return {
      ok: false,
      code: 'MISSING',
      message:
        'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your .env file, then restart the app.',
    };
  }

  if (!RAW_URL) {
    return {
      ok: false,
      code: 'MISSING_URL',
      message: `Supabase is missing ${ENV_KEYS.url}. Add it to your .env file, then restart the app.`,
    };
  }

  if (!isHttpUrl(RAW_URL)) {
    return {
      ok: false,
      code: 'INVALID_URL',
      message: `${ENV_KEYS.url} is not a valid http(s) URL. Copy it from Supabase → Project Settings → API.`,
    };
  }

  if (!RAW_KEY) {
    return {
      ok: false,
      code: 'MISSING_KEY',
      message: `Supabase is missing ${ENV_KEYS.publishableKey}. Add it to your .env file, then restart the app.`,
    };
  }

  const leaked = findLeakedSecretKey(RAW_KEY);
  if (leaked) {
    return {
      ok: false,
      code: 'SECRET_KEY',
      message:
        'A Supabase SECRET key (service_role) was found in your .env. ' +
        'That key bypasses security rules and must never ship inside an app. ' +
        'Replace it with the publishable key from Project Settings → API.',
    };
  }

  return { ok: true, code: null, message: null };
}

const config = validateSupabaseConfig();

/** True when the app is ready to talk to Supabase. */
export const isSupabaseConfigured = config.ok;

/** Human-readable explanation when `isSupabaseConfigured` is false. */
export const supabaseConfigError = config.message;

/** Where Supabase should redirect after a password-reset email. */
export const SUPABASE_REDIRECT_URL =
  readEnv(process.env.EXPO_PUBLIC_SUPABASE_REDIRECT_URL) || DEFAULT_REDIRECT_URL;

// ── Client ────────────────────────────────────────────────────────────

/**
 * A no-op stand-in used when Supabase is not configured.
 *
 * Every method resolves with the same `{ data, error }` shape the real client
 * uses, so calling code never has to null-check and the app can never crash
 * because an environment variable is missing.
 */
function createUnconfiguredClient() {
  const fail = async () => ({
    data: null,
    error: {
      message: supabaseConfigError,
      code: config.code || 'SUPABASE_NOT_CONFIGURED',
      isConfigError: true,
    },
  });

  const noopSubscription = {
    data: { subscription: { unsubscribe: () => {} } },
    error: null,
  };

  return {
    isUnconfiguredStub: true,
    auth: {
      getSession: fail,
      getUser: fail,
      signInWithPassword: fail,
      signUp: fail,
      signOut: fail,
      resetPasswordForEmail: fail,
      updateUser: fail,
      refreshSession: fail,
      setSession: fail,
      exchangeCodeForSession: fail,
      onAuthStateChange: () => noopSubscription,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: fail,
          single: fail,
          limit: () => fail,
        }),
        maybeSingle: fail,
        single: fail,
      }),
      insert: fail,
      update: fail,
      delete: () => ({ eq: () => fail }),
    }),
    rpc: fail,
    // The unconfigured stub previously had NO `storage` key at all, so any call
    // to `supabase.storage.from(...)` raised
    // "TypeError: Cannot read properties of undefined (reading 'from')" and
    // crashed the screen that made it. This mirrors the same never-throw
    // contract the rest of the stub uses: every method resolves with the
    // configuration error instead.
    storage: {
      from: () => ({
        upload: fail,
        download: fail,
        remove: fail,
        list: fail,
        getPublicUrl: () => ({ data: { publicUrl: null }, error: null }),
        createSignedUrl: fail,
        createSignedUrls: fail,
      }),
    },
  };
}

function createRealClient() {
  const client = createClient(RAW_URL, RAW_KEY, {
    auth: {
      // Persistent session — survives app close / phone restart.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // React Native has no browser URL bar to read tokens from; the recovery
      // deep link is handled explicitly in `consumeAuthDeepLink`.
      detectSessionInUrl: false,
      flowType: 'implicit',
    },
  });

  // Keep the access token fresh without blocking the UI thread.
  if (typeof client.startAutoRefresh === 'function') {
    try {
      client.startAutoRefresh();
    } catch {
      /* auto refresh is best-effort */
    }
  }

  return client;
}

/** The single shared Supabase client used by the whole app. */
export const supabase = config.ok ? createRealClient() : createUnconfiguredClient();

// ── Session lifecycle helpers ─────────────────────────────────────────

/**
 * Read the persisted session on cold start.
 * Resolves to `null` when there is no session, rather than throwing.
 */
export async function getStoredSession() {
  if (!config.ok) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session ?? null;
  } catch {
    return null;
  }
}

/**
 * Subscribe to sign-in / sign-out / token refresh.
 * @returns {{ unsubscribe: () => void }}
 */
export function onAuthStateChange(handler) {
  if (!config.ok) return { unsubscribe: () => {} };

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    try {
      handler(event, session);
    } catch {
      /* a listener must never break the auth pipeline */
    }
  });

  return {
    unsubscribe: () => {
      try {
        data?.subscription?.unsubscribe();
      } catch {
        /* already gone */
      }
    },
  };
}

// ── Report evidence images (Supabase Storage) ──────────────────────────
//
// Reports are anonymous BY DESIGN (`safety-engine/routes/reports.py`:
// "no personal identifiers are stored"). That rules out the usual
// `userId/reportId/file.jpg` layout: the bucket prefix would tie an image to a
// real account, and the citizen-facing screen promises "Reports are anonymous".
//
// So the path is random and carries nothing about the reporter. The report row
// stays anonymous and the bucket stays private; the only link between the two
// is the opaque path stored in the existing `reports.evidence` JSON array.

/** The existing bucket. Never renamed, never recreated, never made public. */
export const REPORT_IMAGE_BUCKET = 'report-images';

/**
 * Mirrors the bucket's configured limit (4 MB). Checked BEFORE the upload so
 * an oversized file is never sent, and again on the fetched blob because
 * `asset.fileSize` is not reported on every platform.
 */
export const MAX_REPORT_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

/** Failure reasons, so the UI can say something true. */
export const IMAGE_UPLOAD = {
  NOT_CONFIGURED: 'not_configured',
  NO_FILE: 'no_file',
  TOO_LARGE: 'too_large',
  UNREADABLE: 'unreadable',
  RLS_DENIED: 'rls_denied',
  UPLOAD_FAILED: 'upload_failed',
};

const UPLOAD_MESSAGES = {
  [IMAGE_UPLOAD.NOT_CONFIGURED]:
    'Photo upload is unavailable — Supabase is not configured on this build. Your report will still be sent without the photo.',
  [IMAGE_UPLOAD.NO_FILE]: 'That photo could not be read. Please pick it again.',
  [IMAGE_UPLOAD.TOO_LARGE]:
    'That photo is larger than 4 MB and cannot be uploaded. Please choose a smaller photo — your report has not been sent.',
  [IMAGE_UPLOAD.UNREADABLE]: 'That photo could not be read. Please pick it again.',
  [IMAGE_UPLOAD.RLS_DENIED]:
    'Photo upload was blocked by the storage security policy on the Supabase project. Your report has not been sent.',
  [IMAGE_UPLOAD.UPLOAD_FAILED]:
    'The photo could not be uploaded, so your report was not sent. Please try again.',
};

/** Cross-platform: 32 hex chars from three independent sources. */
function randomHex(chars) {
  let out = '';
  while (out.length < chars) {
    out += Math.floor(Math.random() * 0x100000000)
      .toString(16)
      .padStart(8, '0');
  }
  return out.slice(0, chars);
}

/**
 * Build the anonymous, unique object path.
 *
 * Contains no user id, email, phone, report id, or timestamp-derived
 * information. Only the file EXTENSION is taken from the original name, and
 * only after a strict allowlist, so an attacker-supplied filename can never
 * introduce path traversal or an unexpected extension.
 */
export function buildReportImagePath(fileName = '') {
  const match = /\.([a-z0-9]{2,5})$/i.exec(String(fileName).split(/[?#]/)[0] || '');
  const ext = match ? match[1].toLowerCase() : 'jpg';
  return `reports/${randomHex(32)}.${ext}`;
}

/** Reject a >4 MB file before anything is sent. */
export function checkReportImageSize(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, size: null };
  return { ok: size <= MAX_REPORT_IMAGE_BYTES, size };
}

/**
 * Upload one picked photo to the private `report-images` bucket.
 *
 * NEVER throws and NEVER invents a path: on any failure it resolves
 * `{ ok: false }` with a reason, so the caller can refuse to submit a report
 * carrying a broken evidence reference.
 *
 * @param {object} asset - an expo-image-picker asset ({ uri, fileName, mimeType, fileSize })
 * @returns {Promise<{ok: true, path: string, size: number|null, kind: null, message: null}
 *                 | {ok: false, path: null, size: number|null, kind: string, message: string}>}
 */
export async function uploadReportImage(asset) {
  const fail = (kind, size = null) => ({
    ok: false,
    path: null,
    size,
    kind,
    message: UPLOAD_MESSAGES[kind] || UPLOAD_MESSAGES[IMAGE_UPLOAD.UPLOAD_FAILED],
  });

  if (!config.ok) return fail(IMAGE_UPLOAD.NOT_CONFIGURED);

  const uri = asset?.uri;
  if (!uri) return fail(IMAGE_UPLOAD.NO_FILE);

  // Cheap pre-check on the size the picker reported, so a 20 MB photo is
  // rejected before it is read into memory.
  if (asset?.fileSize != null) {
    const pre = checkReportImageSize(asset.fileSize);
    if (!pre.ok) return fail(IMAGE_UPLOAD.TOO_LARGE, pre.size);
  }

  // Read the local file into a Blob. Works for `file://` on native and for the
  // `blob:`/`data:` URI the web picker returns, so no extra dependency.
  let blob;
  try {
    const response = await fetch(uri);
    blob = await response.blob();
  } catch {
    return fail(IMAGE_UPLOAD.UNREADABLE);
  }
  if (!blob) return fail(IMAGE_UPLOAD.UNREADABLE);

  // Authoritative check: `fileSize` is not reported on every platform.
  const size = checkReportImageSize(blob.size);
  if (!size.ok) return fail(IMAGE_UPLOAD.TOO_LARGE, size.size);

  const path = buildReportImagePath(asset?.fileName);

  try {
    const { error } = await supabase.storage
      .from(REPORT_IMAGE_BUCKET)
      .upload(path, blob, {
        contentType: asset?.mimeType || blob.type || 'image/jpeg',
        // Never overwrite: a collision is astronomically unlikely, and silently
        // replacing another citizen's evidence would be unacceptable.
        upsert: false,
      });

    if (error) {
      // Supabase surfaces a missing Storage RLS policy as a 400/403 with this
      // text. Callers cannot fix it, so name it precisely.
      const text = String(error.message || '');
      const denied = /row-level security|not authorized|permission denied/i.test(text);
      return fail(denied ? IMAGE_UPLOAD.RLS_DENIED : IMAGE_UPLOAD.UPLOAD_FAILED, size.size);
    }
    return { ok: true, path, size: size.size, kind: null, message: null };
  } catch {
    return fail(IMAGE_UPLOAD.UPLOAD_FAILED, size.size);
  }
}

/**
 * Best-effort delete, used when a report cannot be saved after its photo was
 * already uploaded, so the bucket is not left holding orphaned evidence.
 * Never throws.
 */
export async function removeReportImage(path) {
  if (!config.ok || !path) return false;
  try {
    const { error } = await supabase.storage.from(REPORT_IMAGE_BUCKET).remove([path]);
    return !error;
  } catch {
    return false;
  }
}

/** True when Supabase believes the email is confirmed. */
export function isEmailVerified(session) {
  return session?.user?.email_confirmed_at != null || session?.user?.confirmed_at === true;
}

/**
 * Parse a Supabase password-recovery deep link and open a session from it.
 *
 * Supabase emails a link that ultimately redirects to
 * `EXPO_PUBLIC_SUPABASE_REDIRECT_URL` carrying the recovery token. React Native
 * receives it through the app's URL scheme, so we hand the URL to the client
 * instead of relying on browser URL parsing.
 *
 * @returns {Promise<{ ok: boolean, error?: object }>}
 */
export async function consumeAuthDeepLink(url) {
  if (!config.ok) {
    return {
      ok: false,
      error: { message: supabaseConfigError, isConfigError: true },
    };
  }
  if (typeof url !== 'string' || !url) {
    return { ok: false, error: { message: 'Missing sign-in link.' } };
  }

  // Accept both `key=value` query and `#key=value` hash forms.
  const hashIndex = url.indexOf('#');
  const search = url.includes('?') ? url.slice(url.indexOf('?') + 1, hashIndex > -1 ? hashIndex : undefined) : '';
  const hash = hashIndex > -1 ? url.slice(hashIndex + 1) : '';
  const payload = `${search}&${hash}`;

  const params = {};
  payload.split(/[&;]/).forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf('=');
    if (idx === -1) return;
    const name = decodeURIComponent(pair.slice(0, idx));
    const value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, ' '));
    if (name) params[name] = value;
  });

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;

  if (!accessToken || !refreshToken) {
    // Some projects use the PKCE `?code=` form.
    if (params.code) {
      const { error } = await supabase.auth.exchangeCodeForSession(params.code);
      if (error) return { ok: false, error };
      return { ok: true };
    }
    return {
      ok: false,
      error: { message: 'This sign-in link is invalid or has expired. Request a new one.' },
    };
  }

  const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) return { ok: false, error };
  return { ok: true };
}

// ── Error translation ─────────────────────────────────────────────────

const AUTH_ERROR_MAP = [
  [/invalid login credentials/i, 'That email and password do not match. Please try again.'],
  [/email not confirmed/i, 'Please verify your email address first. Check your inbox for the link we sent.'],
  [/user already registered/i, 'An account with this email already exists. Try signing in instead.'],
  [/email address .* invalid|invalid email/i, 'Please enter a valid email address.'],
  [/password should be at least/i, 'Please choose a longer password.'],
  [/unable to validate email|unable to validate/i, 'Please enter a valid email address.'],
  [/rate limit|too many requests/i, 'Too many attempts. Please wait a moment and try again.'],
  [/failed to fetch|network|load failed/i, 'Cannot reach the server. Check your internet connection and try again.'],
  [/expired|invalid.*token/i, 'This link has expired. Please request a new one.'],
  [/new password should be different/i, 'Please choose a password you have not used before.'],
  [/same as the old password/i, 'Please choose a password different from your current one.'],
];

/**
 * Turn a Supabase/Auth/network error into something a user can act on.
 * Falls back to a safe generic message — raw technical text is never shown.
 */
export function describeAuthError(error, fallback = 'Something went wrong. Please try again.') {
  if (!error) return fallback;
  if (error.isConfigError) return error.message || fallback;

  const raw = String(error.message || error.error_description || error.msg || '').trim();
  if (!raw) return fallback;

  for (const [pattern, friendly] of AUTH_ERROR_MAP) {
    if (pattern.test(raw)) return friendly;
  }

  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    // Debug aid only — never the raw message shown to a user.
    console.warn('[auth] unmapped error:', raw);
  }
  return fallback;
}

export default supabase;
