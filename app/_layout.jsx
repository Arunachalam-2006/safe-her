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

  // Mirrors the redirect effect below so the splash only lifts once the
  // navigator has actually settled on the right screen.
  const needsRedirect = !onboardingCompleted
    ? segment !== 'onboarding'
    : !session
      ? segment !== 'auth'
      : profile?.account_type === 'government'
        ? segment !== 'gov'
        : !CITIZEN_ROUTES.includes(segment);

  const appReady = booted && ((minTimeReached && !needsRedirect) || splashHidden);

  useEffect(() => {
    if (loading || !onboardingReady) return;

    const inAuth = segment === 'auth';
    const inGov = segment === 'gov';
    const inTabs = segment === '(tabs)';
    const inEdit = segment === 'edit-profile';
    const inEmergency = segment === 'emergency-contacts';

    if (!onboardingCompleted) {
      // First run (or onboarding was reset) — always show the tour once.
      if (segment !== 'onboarding') router.replace('/onboarding');
      return;
    }

    if (!session && !inAuth) {
      router.replace('/auth');
    } else if (session && profile?.account_type === 'government' && !inGov) {
      router.replace('/gov');
    } else if (
      session &&
      profile?.account_type !== 'government' &&
      !inTabs &&
      !inEdit &&
      !inEmergency
    ) {
      router.replace('/(tabs)');
    }
  }, [session, profile, loading, onboardingReady, onboardingCompleted, segment]);

  return (
    <View style={[styles.root, { backgroundColor: colors.paper }]}>
      {appReady ? (
        <>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="auth" />
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

  return (
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
  );
}
