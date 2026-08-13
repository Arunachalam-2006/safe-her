import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, account_type, agency, phone, emergency_contact_name, emergency_contact_phone, home_label, home_lat, home_lng, work_label, work_lat, work_lng')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        setLoading(true);
        (async () => {
          await loadProfile(s.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signUp = useCallback(async ({ email, password, fullName, accountType, agency }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, account_type: accountType, agency: agency || '' } },
    });
    return { data, error };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { data, error };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const updateProfile = useCallback(async (updates) => {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', session.user.id)
      .select('id, email, full_name, account_type, agency, phone, emergency_contact_name, emergency_contact_phone, home_label, home_lat, home_lng, work_label, work_lat, work_lng')
      .maybeSingle();
    if (!error && data) setProfile(data);
    return { data, error };
  }, [session]);

  const value = { session, profile, loading, signUp, signIn, signOut, updateProfile };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
