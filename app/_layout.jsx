import { useEffect } from 'react';
import { router, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '../lib/auth';
import { ThemeProvider, useTheme } from '../lib/theme';
import { JourneyProvider } from '../lib/journey';
import { SOSProvider } from '../lib/sos';
import { useFrameworkReady } from '../hooks/useFrameworkReady';
import '../lib/backgroundLocationTask';
import SOSConfirmationModal from '../components/SOSConfirmationModal';
import SOSActiveScreen from '../components/SOSActiveScreen';

function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === 'auth';
    const inGov = segments[0] === 'gov';
    const inTabs = segments[0] === '(tabs)';
    const inEdit = segments[0] === 'edit-profile';
    const inEmergency = segments[0] === 'emergency-contacts';

    if (!session && !inAuth) {
      router.replace('/auth');
    } else if (session && profile?.account_type === 'government' && !inGov) {
      router.replace('/gov');
    } else if (session && profile?.account_type !== 'government' && !inTabs && !inEdit && !inEmergency) {
      router.replace('/(tabs)');
    }
  }, [session, profile, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="gov" />
        <Stack.Screen name="edit-profile" />
        <Stack.Screen name="emergency-contacts" options={{ presentation: 'card' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <SOSConfirmationModal />
      <SOSActiveScreen />
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  useFrameworkReady();

  return (
    <ThemeProvider>
      <AuthProvider>
        <SOSProvider>
          <JourneyProvider>
            <RootNavigator />
          </JourneyProvider>
        </SOSProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

