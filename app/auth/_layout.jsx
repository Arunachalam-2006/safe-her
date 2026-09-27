import { Stack } from 'expo-router';
import { useTheme } from '../../lib/theme';

/**
 * Authentication route group.
 *
 * Lives at `app/auth/*` so the URL segment stays `auth` — the root navigator's
 * existing gate (`segment === 'auth'`) keeps working unchanged.
 */
export default function AuthLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.paper },
        animation: 'slide_from_right',
      }}
    />
  );
}
