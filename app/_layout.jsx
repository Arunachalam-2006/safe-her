import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme';
import { OnboardingProvider, useOnboarding } from '../lib/onboarding';
import { JourneyProvider } from '../lib/journey';
import { SOSProvider } from '../lib/sos';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import '../lib/backgroundLocationTask';
import SOSConfirmationModal from '../components/SOSConfirmationModal';
import SOSActiveScreen from '../components/SOSActiveScreen';
import SplashScreen from '../components/SplashScreen';
import ErrorBoundary from '../components/ErrorBoundary';

// ── DEVELOPER-ONLY ROLE BYPASS ──────────────────────────────────────────
// Temporary: lets a developer preview the officer dashboard before the
// Supabase `profiles` table exists. `isDevAccessEnabled()` is always false in a
// production build, so this cannot affect a released app.
// REMOVE BY DELETING: lib/government/devAccess.js,
// components/government/DevRoleSwitch.jsx, and the 3 lines marked DEV-BYPASS.
import { isDevAccessEnabled, loadDevRoleOverride, setDevRoleOverride } from '../lib/government/devAccess';
import DevRoleSwitch from '../components/government/DevRoleSwitch';

// Splash stays up for a beat, but is never allowed to trap the user.
const SPLASH_MIN_MS = 1600;
const SPLASH_MAX_MS = 4500;

const CITIZEN_ROUTES = ['(tabs)', 'edit-profile', 'emergency-contacts'];

function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const { ready: onboardingReady, completed: onboardingCompleted } = useOnboarding();
  const { colors, isDark } = useTheme();
  const segments = useSegments();

  const [minTimeReached, setMinTimeReached] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const bootStartedAt = useRef(Date.now());

  // DEV-BYPASS 1/3 — role used for routing (override is null in production).
  const [devRole, setDevRole] = useState(null);
  const accountType = isDevAccessEnabled() && devRole ? devRole : profile?.account_type;

  useEffect(() => {
    if (!isDevAccessEnabled()) return;
    loadDevRoleOverride().then(setDevRole);
  }, []);

  const booted = !loading && onboardingReady;

  // Splash phase 1: honour the minimum on-screen time.
  useEffect(() => {
    const remaining = Math.max(0, SPLASH_MIN_MS - (Date.now() - bootStartedAt.current));
    const timer = setTimeout(() => setMinTimeReached(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  // Splash phase 2: hard cap so a slow/hung boot can never leave a blank app.
  useEffect(() => {
    const remaining = Math.max(0, SPLASH_MAX_MS - (Date.now() - bootStartedAt.current));
    const timer = setTimeout(() => setSplashHidden(true), remaining);
    return () => clearTimeout(timer);
  }, []);

  const segment = segments[0];
  const inGov = segment === '(gov)' || segment === 'gov';
  // `app/auth/*` is a route group under the `auth` path segment, so every
  // screen in it (login, signup, forgot, reset, verify) resolves to `auth`.
  const inAuth = segment === 'auth';

  // Mirrors the redirect effect below so the splash only lifts once the
  // navigator has actually settled on the right screen.
  // DEV-BYPASS 2/3 — `accountType` is `profile.account_type` in production.
  const needsRedirect = !onboardingCompleted
    ? segment !== 'onboarding'
    : !session
      ? !inAuth
      : accountType === 'government'
        ? !inGov
        : inAuth || !CITIZEN_ROUTES.includes(segment);

  const appReady = booted && ((minTimeReached && !needsRedirect) || splashHidden);

  useEffect(() => {
    if (loading || !onboardingReady) return;

    const inTabs = segment === '(tabs)';
    const inEdit = segment === 'edit-profile';
    const inEmergency = segment === 'emergency-contacts';

    if (!onboardingCompleted) {
      // First run (or onboarding was reset) — always show the tour once.
      if (segment !== 'onboarding') router.replace('/onboarding');
      return;
    }

    if (!session && !inAuth) {
      router.replace('/auth/login');
    } else if (session && inAuth) {
      // Signed in: never leave an authenticated user on the auth screens.
      router.replace(accountType === 'government' ? '/(gov)' : '/(tabs)');
    } else if (session && accountType === 'government' && !inGov) {
      router.replace('/(gov)');
    } else if (
      session &&
      accountType !== 'government' &&
      !inTabs &&
      !inEdit &&
      !inEmergency
    ) {
      router.replace('/(tabs)');
    }
  }, [session, profile, accountType, loading, onboardingReady, onboardingCompleted, segment]);

  // DEV-BYPASS 3/3 — the floating control. Never rendered outside __DEV__.
  async function toggleDevRole() {
    const next = accountType === 'government' ? 'citizen' : 'government';
    setDevRole(next);
    await setDevRoleOverride(next);
    router.replace(next === 'government' ? '/(gov)' : '/(tabs)');
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      {appReady ? (
        <>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="(gov)" options={{ animation: 'fade' }} />
            <Stack.Screen name="auth" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="gov" />
            <Stack.Screen name="edit-profile" />
            <Stack.Screen name="emergency-contacts" options={{ presentation: 'card' }} />
            <Stack.Screen name="+not-found" />
          </Stack>
          <SOSConfirmationModal />
          <SOSActiveScreen />
        </>
      ) : null}

      {isDevAccessEnabled() && splashHidden ? (
        <DevRoleSwitch
          role={accountType}
          onToggle={toggleDevRole}
        />
      ) : null}

      {splashHidden ? null : (
        <SplashScreen exiting={appReady} onExited={() => setSplashHidden(true)} />
      )}

      <StatusBar style={isDark ? 'light' : 'dark'} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default function RootLayout() {
  useFrameworkReady();

  // Outermost wrapper: catches any render throw from any provider or screen.
  // Without this, a release build shows a blank white screen.
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <OnboardingProvider>
          <AuthProvider>
            <SOSProvider>
              <JourneyProvider>
                <RootNavigator />
              </JourneyProvider>
            </SOSProvider>
          </AuthProvider>
        </OnboardingProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
