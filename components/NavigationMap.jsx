import { View, Text } from 'react-native';
import { Navigation } from 'lucide-react-native';

/** Native placeholder — map is web-only for now */
export default function NavigationMap({ liveLocation }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1f2e', gap: 10 }}>
      <Navigation color="#4285F4" size={36} />
      <Text style={{ color: '#fff', fontSize: 13, opacity: 0.7 }}>
        Navigation map available on web
      </Text>
      {liveLocation ? (
        <Text style={{ color: '#9AA8C0', fontSize: 11 }}>
          {liveLocation.lat?.toFixed(5)}, {liveLocation.lng?.toFixed(5)}
        </Text>
      ) : null}
    </View>
  );
}
