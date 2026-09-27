import { Tabs } from 'expo-router';
import { BarChart3, Home, Siren, SquareStack } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

/**
 * Government / officer route group.
 *
 * Separate from the citizen `(tabs)` group so no citizen screen, navigation
 * or styling is affected. Reached only when `profile.account_type === 'government'`
 * (enforced in app/_layout.jsx).
 */
export default function GovLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '800', paddingBottom: 4 },
        tabBarStyle: {
          height: 66,
          paddingTop: 8,
          borderTopColor: colors.line,
          backgroundColor: colors.tabBarBg,
          elevation: 10,
          shadowColor: colors.cardShadow,
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: isDark ? 0.4 : 0.08,
          shadowRadius: 10,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: 'Reports', tabBarIcon: ({ color, size }) => <SquareStack color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="sos"
        options={{ title: 'SOS', tabBarIcon: ({ color, size }) => <Siren color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }}
      />
      {/* Detail routes are pushed on top of the tabs, not shown as tab buttons. */}
      <Tabs.Screen name="report" options={{ href: null }} />
      <Tabs.Screen name="pending" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
    </Tabs>
  );
}
