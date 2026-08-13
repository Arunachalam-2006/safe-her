import { Tabs } from 'expo-router';
import { Home, Map, MessageSquareWarning, Route, UserRound } from 'lucide-react-native';

const colors = { ink: '#12233F', teal: '#007F7B', muted: '#768196' };

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', paddingBottom: 4 },
        tabBarStyle: { height: 68, paddingTop: 8, borderTopColor: '#E7ECF2', backgroundColor: '#FFFFFF' },
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
