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

function readEnv(key) {
  const raw = process.env[key];
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  // Treat obvious copy-paste placeholders as "not set".
  if (/^(your[_-]|<|xxx|todo|changeme|placeholder)/i.test(value)) return '';
  return value;
}

const RAW_URL = readEnv(ENV_KEYS.url);
const RAW_KEY = readEnv(ENV_KEYS.publishableKey);

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
export const SUPABASE_REDIRECT_URL = readEnv(ENV_KEYS.redirectUrl) || DEFAULT_REDIRECT_URL;

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
