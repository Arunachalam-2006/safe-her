import { Tabs } from 'expo-router';
import { Home, Map, MessageSquareWarning, Route, UserRound } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

export default function TabLayout() {
  const { colors, isDark } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', paddingBottom: 4 },
        tabBarStyle: { 
          height: 68, 
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
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }} />
      <Tabs.Screen name="routes" options={{ title: 'Routes', tabBarIcon: ({ color, size }) => <Route color={color} size={size} /> }} />
      <Tabs.Screen name="report" options={{ title: 'Report', tabBarIcon: ({ color, size }) => <MessageSquareWarning color={color} size={size} /> }} />
      <Tabs.Screen name="journey" options={{ title: 'Journey', tabBarIcon: ({ color, size }) => <Map color={color} size={size} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <UserRound color={color} size={size} /> }} />
    </Tabs>
  );
}
