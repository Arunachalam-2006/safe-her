import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  describeAuthError,
  isEmailVerified,
  isSupabaseConfigured,
  onAuthStateChange,
  supabase,
  supabaseConfigError,
} from './supabase';

/**
 * Authentication provider for Safe-Her.
 *
 * Backed by Supabase when `EXPO_PUBLIC_SUPABASE_URL` and
 * `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured, and by a clearly
 * labelled local development fallback when they are not, so the app always
 * starts. See `LOCAL_DEMO_ACCOUNTS` below.
 *
 * The public shape of this module is intentionally unchanged from the previous
 * mock implementation:
 *
 *     { session, profile, loading, signIn, signUp, signOut, updateProfile }
 *
 * Every consumer (citizen screens, government dashboard, onboarding, root
 * navigator) keeps working without modification. `profile` is always
 * normalised to the same field names, whether it came from Supabase or was
 * reconstructed locally.
 */

const AuthContext = createContext(null);

const PROFILE_KEY = 'safeher_local_profiles_v1';
const SESSION_KEY = 'safeher_local_session_v1';

/** Only used when Supabase is not configured (development without keys). */
const LOCAL_DEMO_ACCOUNTS = {
  'citizen@safeher.test': { password: 'citizen123', id: 'citizen-user-001', account_type: 'citizen', full_name: 'SafeHer Citizen', agency: '' },
  'government@safeher.test': { password: 'safeher123', id: 'government-dashboard-001', account_type: 'government', full_name: 'SafeHer Government Officer', agency: 'SafeHer Official' },
};

/**
 * The single profile shape every screen depends on. Anything missing from the
 * database is filled in here so a partially-migrated row can never crash a
 * screen that expects `profile.full_name` and friends.
 */
const EMPTY_PROFILE = {
  id: null,
  email: '',
  full_name: '',
  phone: '',
  avatar_url: null,
  emergency_contact_name: '',
  emergency_contact_phone: '',
  home_label: '',
  home_lat: null,
  home_lng: null,
  work_label: '',
  work_lat: null,
  work_lng: null,
  account_type: 'citizen',
  agency: '',
};

function normaliseProfile(row, fallbackUser) {
  if (!row) return null;
  const meta = fallbackUser?.user_metadata || {};
  return {
    ...EMPTY_PROFILE,
    ...row,
    id: row.id ?? fallbackUser?.id ?? null,
    email: row.email ?? fallbackUser?.email ?? meta.email ?? '',
    full_name: row.full_name ?? meta.full_name ?? '',
    // The role is server-authoritative. A local fallback is only used when
    // Supabase has not yet provisioned a profiles row.
    account_type: row.account_type ?? 'citizen',
  };
}

/** Build a usable profile from a Supabase user when no DB row exists yet. */
function profileFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return normaliseProfile(
    {
      id: user.id,
      email: user.email,
      full_name: meta.full_name || meta.name || '',
      phone: meta.phone || '',
      account_type: 'citizen',
    },
    user
  );
}

/* ── Local development fallback storage ──────────────────────────────── */

function readLocal(key, fallback) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return fallback;
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function localProfiles() {
  return readLocal(PROFILE_KEY, {});
}

/* ── Provider ───────────────────────────────────────────────────────── */

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Guards against setting state after unmount and against a stale profile
  // arriving after the user has already signed out.
  const mountedRef = useRef(true);
  const userIdRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applyProfile = useCallback(async (user) => {
    if (!mountedRef.current) return null;
    if (!user) {
      userIdRef.current = null;
      setProfile(null);
      return null;
    }

    if (!isSupabaseConfigured) {
      const stored = localProfiles()[user.id] || null;
      const next = normaliseProfile(stored, user);
      userIdRef.current = user.id;
      setProfile(next);
      return next;
    }

    // A missing `profiles` table (SQL not run yet) must never break sign-in,
    // so fall back to whatever the Auth user already told us.
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!mountedRef.current) return null;

      if (error || !data) {
        if (error && __DEV__) {
          console.warn('[auth] profile fetch failed, using auth metadata:', error.message);
        }
        const next = profileFromUser(user);
        userIdRef.current = user.id;
        setProfile(next);
        return next;
      }

      const next = normaliseProfile(data, user);
      userIdRef.current = user.id;
      setProfile(next);
      return next;
    } catch {
      const next = profileFromUser(user);
      if (mountedRef.current) setProfile(next);
      return next;
    }
  }, []);

  /** Cold start: restore a persisted Supabase session before rendering. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isSupabaseConfigured) {
        const stored = readLocal(SESSION_KEY, null);
        if (cancelled) return;
        if (stored?.user) {
          setSession(stored);
          await applyProfile(stored.user);
        }
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        const current = data?.session ?? null;
        setSession(current);
        if (current?.user) await applyProfile(current.user);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyProfile]);

  // Keep session + profile in sync with Supabase (sign-in, sign-out, refresh).
  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    const { unsubscribe } = onAuthStateChange(async (event, nextSession) => {
      if (!mountedRef.current) return;
      setSession(nextSession);
      await applyProfile(nextSession?.user ?? null);
    });

    return unsubscribe;
  }, [applyProfile]);

  /* ── Sign up ─────────────────────────────────────────────────────── */

  const signUp = useCallback(
    async ({ email, password, fullName, phone }) => {
      if (!isSupabaseConfigured) {
        // Development fallback so the flow is testable before keys exist.
        const normalised = String(email || '').trim().toLowerCase();
        const account = LOCAL_DEMO_ACCOUNTS[normalised];
        if (!account) {
          return {
            data: null,
            error: { message: 'Supabase is not configured, so only the local demo account can be used.' },
          };
        }
        if (account.password !== password) {
          return { data: null, error: { message: 'That email and password do not match.' } };
        }
        const localUser = {
          id: account.id,
          email: normalised,
          user_metadata: { full_name: fullName || account.full_name, phone: phone || '' },
        };
        const nextSession = { user: localUser, access_token: 'local-token' };
        const nextProfile = {
          ...EMPTY_PROFILE,
          id: account.id,
          email: normalised,
          full_name: fullName || account.full_name,
          phone: phone || '',
          account_type: account.account_type,
          agency: account.agency,
        };
        const profiles = { ...localProfiles(), [account.id]: nextProfile };
        writeLocal(PROFILE_KEY, profiles);
        writeLocal(SESSION_KEY, nextSession);
        setSession(nextSession);
        setProfile(nextProfile);
        return { data: { user: localUser, session: nextSession }, error: null };
      }

      const { data, error } = await supabase.auth.signUp({
        email: String(email).trim().toLowerCase(),
        password,
        options: {
          data: { full_name: fullName || '', phone: phone || '' },
          // When email confirmation is ON, `session` is null until verified.
          emailRedirectTo: undefined,
        },
      });

      if (error) {
        return { data: null, error: { message: describeAuthError(error, 'Could not create your account. Please try again.') } };
      }

      const user = data?.user ?? null;

      // Best-effort profile insert. If the table/RLS is not ready the trigger
      // or a later read will fill it in, so this must never block sign-up.
      if (user) {
        try {
          await supabase.from('profiles').upsert({
            id: user.id,
            email: user.email,
            full_name: fullName || '',
            phone: phone || '',
            account_type: 'citizen',
          });
        } catch (insertError) {
          if (__DEV__) console.warn('[auth] profile insert skipped:', insertError?.message);
        }
      }

      const verified = isEmailVerified(data?.session ?? { user });

      return {
        data: {
          user,
          session: data?.session ?? null,
          needsEmailVerification: !verified,
        },
        error: null,
      };
    },
    []
  );

  /* ── Sign in ─────────────────────────────────────────────────────── */

  const signIn = useCallback(async ({ email, password }) => {
    if (!isSupabaseConfigured) {
      const normalised = String(email || '').trim().toLowerCase();
      const account = LOCAL_DEMO_ACCOUNTS[normalised];
      if (!account || account.password !== password) {
        return {
          data: null,
          error: { message: 'That email and password do not match. Please try again.' },
        };
      }
      const localUser = {
        id: account.id,
        email: normalised,
        user_metadata: { full_name: account.full_name },
      };
      const nextSession = { user: localUser, access_token: 'local-token' };
      const nextProfile = {
        ...EMPTY_PROFILE,
        ...(localProfiles()[account.id] || {}),
        id: account.id,
        email: normalised,
        account_type: account.account_type,
        agency: account.agency,
      };
      writeLocal(SESSION_KEY, nextSession);
      setSession(nextSession);
      setProfile(nextProfile);
      return { data: { user: localUser, session: nextSession }, error: null };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(email).trim().toLowerCase(),
      password,
    });

    if (error) {
      return { data: null, error: { message: describeAuthError(error) } };
    }

    // Rejected explicitly when the account exists but is not yet confirmed.
    const user = data?.user ?? null;
    if (user && !isEmailVerified(data?.session ?? { user })) {
      return {
        data: null,
        error: {
          message:
            'Please verify your email address first. Check your inbox for the link we sent.',
        },
        needsEmailVerification: true,
        email: user.email,
      };
    }

    if (user) await applyProfile(user);

    return { data, error: null };
  }, [applyProfile]);

  /* ── Sign out ────────────────────────────────────────────────────── */

  const signOut = useCallback(async () => {
    if (!isSupabaseConfigured) {
      writeLocal(SESSION_KEY, null);
      setSession(null);
      setProfile(null);
      return { error: null };
    }

    const { error } = await supabase.auth.signOut();
    // Always clear locally, even if the network call failed, so the user is
    // never stranded in a signed-in-looking state.
    setSession(null);
    setProfile(null);
    return { error: error ? { message: describeAuthError(error) } : null };
  }, []);

  /* ── Profile update ──────────────────────────────────────────────── */

  /**
   * Merge a partial profile. Signature and behaviour match the previous
   * implementation so `edit-profile.jsx` and `profile.jsx` need no changes.
   */
  const updateProfile = useCallback(
    async (updates) => {
      const userId = userIdRef.current || session?.user?.id || null;
      if (!userId) {
        return { data: null, error: { message: 'You are not signed in.' } };
      }

      const patch = { ...updates };
      // The role is server-controlled; a client must never be able to escalate.
      delete patch.account_type;
      delete patch.agency;
      delete patch.id;

      const merged = { ...EMPTY_PROFILE, ...(profile || {}), ...updates, id: userId };
      setProfile(merged);

      if (!isSupabaseConfigured) {
        const profiles = { ...localProfiles(), [userId]: merged };
        writeLocal(PROFILE_KEY, profiles);
        return { data: merged, error: null };
      }

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ ...patch, id: userId })
        .select()
        .maybeSingle();

      if (error) {
        return { data: null, error: { message: describeAuthError(error, 'Could not save your changes.') } };
      }

      const next = normaliseProfile(data, session?.user);
      if (next) setProfile(next);
      return { data: next, error: null };
    },
    [profile, session]
  );

  const value = useMemo(
    () => ({ session, profile, loading, signIn, signUp, signOut, updateProfile }),
    [session, profile, loading, signIn, signUp, signOut, updateProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Re-exported so screens can explain a missing Supabase configuration. */
export { isSupabaseConfigured, supabaseConfigError, isEmailVerified };
