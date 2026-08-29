import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const AuthContext = createContext(null);
const DUMMY_GOVERNMENT_ID = 'government-dashboard-001';
const DUMMY_GOVERNMENT_EMAIL = 'government@safeher.test';
const DUMMY_GOVERNMENT_PASSWORD = 'safeher123';
const DUMMY_CITIZEN_ID = 'citizen-user-001';
const DUMMY_CITIZEN_EMAIL = 'citizen@safeher.test';
const DUMMY_CITIZEN_PASSWORD = 'citizen123';
const mockStorage = { session: null, profiles: {} };

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    const stored = mockStorage.profiles[userId];
    setProfile(stored || { id: userId, email: DUMMY_GOVERNMENT_EMAIL, full_name: 'SafeHer Government Officer', account_type: 'government', agency: 'SafeHer Official' });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      const currentSession = mockStorage.session;
      if (!mounted) return;
      setSession(currentSession);
      if (currentSession?.user) await loadProfile(currentSession.user.id);
      setLoading(false);
    }

    initialize();
    return () => { mounted = false; };
  }, [loadProfile]);

  const signUp = useCallback(async ({ email, fullName, accountType, agency }) => {
    const user = { id: `local-user-${Date.now()}`, email, user_metadata: { full_name: fullName, account_type: accountType, agency } };
    const mockSession = { user, access_token: 'local-token' };
    const localProfile = { id: user.id, email, full_name: fullName, account_type: accountType, agency };
    mockStorage.session = mockSession;
    mockStorage.profiles[user.id] = localProfile;
    setSession(mockSession);
    setProfile(localProfile);
    return { data: { user, session: mockSession }, error: null };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const normalizedEmail = email.trim().toLowerCase();
    const isGovernment = normalizedEmail === DUMMY_GOVERNMENT_EMAIL && password === DUMMY_GOVERNMENT_PASSWORD;
    const isCitizen = normalizedEmail === DUMMY_CITIZEN_EMAIL && password === DUMMY_CITIZEN_PASSWORD;
    if (!isGovernment && !isCitizen) {
      return { data: null, error: new Error('Use the demo citizen or government account credentials.') };
    }
    const user = { id: isGovernment ? DUMMY_GOVERNMENT_ID : DUMMY_CITIZEN_ID, email: normalizedEmail };
    const mockSession = { user, access_token: 'local-token' };
    mockStorage.session = mockSession;
    if (!mockStorage.profiles[user.id]) {
      mockStorage.profiles[user.id] = isGovernment
        ? { id: user.id, email: user.email, full_name: 'SafeHer Government Officer', account_type: 'government', agency: 'SafeHer Official', avatar_url: null }
        : { id: user.id, email: user.email, full_name: 'SafeHer Citizen', account_type: 'citizen', agency: '', avatar_url: null };
    }
    setSession(mockSession);
    await loadProfile(user.id);
    return { data: { user, session: mockSession }, error: null };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    mockStorage.session = null;
    setSession(null);
    setProfile(null);
    return { error: null };
  }, []);

  const updateProfile = useCallback(async (updates) => {
    const updated = { ...profile, ...updates };
    if (session?.user) mockStorage.profiles[session.user.id] = updated;
    setProfile(updated);
    return { data: updated, error: null };
  }, [session, profile]);

  const value = { session, profile, loading, signUp, signIn, signOut, updateProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
