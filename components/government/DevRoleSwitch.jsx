import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck, UserRound } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

/**
 * DEVELOPER-ONLY floating role switch.
 *
 * Rendered from app/_layout.jsx only when `isDevAccessEnabled()` is true, so it
 * cannot appear in a production build. It writes to AsyncStorage, never to the
 * database, and never changes the signed-in account.
 */
export default function DevRoleSwitch({ role, onToggle }) {
  const { colors, isDark } = useTheme();
  const asOfficer = role === 'government';

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View
        style={[
          styles.pill,
          {
            backgroundColor: isDark ? '#161B22' : '#1E1B4B',
            borderColor: asOfficer ? colors.pink : colors.orange,
          },
        ]}
      >
        <Text style={[styles.tag, { color: asOfficer ? colors.pink : colors.orange }]}>
          DEV
        </Text>

        <Text style={styles.label}>
          {asOfficer ? 'Viewing as officer' : 'Viewing as citizen'}
        </Text>

        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={
            asOfficer
              ? 'Developer switch: return to the citizen app'
              : 'Developer switch: preview the government dashboard'
          }
          android_ripple={{ color: 'rgba(255,255,255,0.25)' }}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: asOfficer ? colors.pink : colors.orange },
            pressed && styles.pressed,
          ]}
        >
          {asOfficer ? (
            <UserRound color="#FFFFFF" size={14} />
          ) : (
            <ShieldCheck color="#FFFFFF" size={14} />
          )}
          <Text style={styles.actionText}>
            {asOfficer ? 'Citizen app' : 'Officer view'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 78, // sits just above the 66pt tab bar
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingLeft: 10,
    paddingRight: 7,
    borderRadius: 22,
    borderWidth: 1.5,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  tag: { fontSize: 9.5, fontWeight: '900', letterSpacing: 1 },
  label: { color: '#E9E4FF', fontSize: 11.5, fontWeight: '700' },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    height: 28,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
