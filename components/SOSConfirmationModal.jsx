import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Phone, X, ShieldAlert, StopCircle } from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { SOS_STATUS, useSOS } from '../lib/sos';

export default function SOSConfirmationModal() {
  const { colors, isDark } = useTheme();
  const {
    status, countdownValue, countdownRunning, contactCount,
    cancelConfirmation, startCountdown, cancelCountdown, activateSOS,
  } = useSOS();

  const visible = status === SOS_STATUS.CONFIRMING || status === SOS_STATUS.COUNTDOWN;
  const isCountdown = status === SOS_STATUS.COUNTDOWN;

  return (
    <Modal visible={visible} animationType="fade" transparent={true} onRequestClose={() => { if (!isCountdown) cancelConfirmation(); }}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.cardBg }]}>
          <View style={[s.siren, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
            <ShieldAlert color={colors.pink} size={28} />
          </View>
          <Text style={[s.title, { color: colors.ink }]}>
            {isCountdown ? 'Activating SOS…' : 'Activate Emergency SOS?'}
          </Text>

          {isCountdown ? (
            <View style={s.countRow}>
              <View style={[s.countRing, { borderColor: colors.pink }]}>
                <Text style={[s.countText, { color: colors.pink }]}>{countdownValue}</Text>
              </View>
              <Text style={[s.countHint, { color: colors.muted }]}>
                SOS will start in {countdownValue} second{countdownValue === 1 ? '' : 's'}.
              </Text>
            </View>
          ) : (
            <View style={s.confirmBody}>
              <AlertTriangle color={colors.orange} size={16} />
              <Text style={[s.confirmText, { color: colors.ink }]}>
                This will begin an emergency session.
                Safe-Her will:
              </Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• Request your current GPS location</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• Start location tracking (Android only)</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• Prepare an emergency alert message</Text>
              <Text style={[s.bullet, { color: colors.muted }]}>• You choose when to share it</Text>
              <View style={[s.contactsBox, { backgroundColor: colors.paper, borderColor: colors.line }]}>
                <Phone color={colors.primary} size={16} />
                <Text style={[s.contactsText, { color: colors.ink }]}>
                  {contactCount > 0
                    ? `${contactCount} emergency contact${contactCount === 1 ? '' : 's'} saved`
                    : 'No emergency contacts added yet'}
                </Text>
              </View>
              {contactCount === 0 ? (
                <Text style={[s.warning, { color: colors.pink }]}>
                  ⚠ Add at least one contact before sharing an alert.
                </Text>
              ) : null}
            </View>
          )}

          <View style={s.btnRow}>
            {isCountdown ? (
              <Pressable
                onPress={cancelCountdown}
                style={({ pressed }) => [s.secondary, { backgroundColor: colors.paper, borderColor: colors.line }, pressed && s.pressed]}
              >
                <StopCircle color={colors.ink} size={18} />
                <Text style={[s.secondaryText, { color: colors.ink }]}>Cancel</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={cancelConfirmation}
                style={({ pressed }) => [s.secondary, { backgroundColor: colors.paper, borderColor: colors.line }, pressed && s.pressed]}
              >
                <X color={colors.ink} size={18} />
                <Text style={[s.secondaryText, { color: colors.ink }]}>Cancel</Text>
              </Pressable>
            )}

            {isCountdown ? (
              <Pressable
                onPress={activateSOS}
                style={({ pressed }) => [s.primary, { backgroundColor: colors.pink }, pressed && s.pressed]}
              >
                <ShieldAlert color="#FFFFFF" size={18} />
                <Text style={s.primaryText}>Activate NOW</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={startCountdown}
                style={({ pressed }) => [s.primary, { backgroundColor: colors.pink }, pressed && s.pressed]}
              >
                <AlertTriangle color="#FFFFFF" size={18} />
                <Text style={s.primaryText}>Start 3s countdown</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, borderRadius: 26, padding: 22, alignItems: 'center' },
  siren: { width: 70, height: 70, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  countRow: { alignItems: 'center', paddingVertical: 14, width: '100%' },
  countRing: { width: 110, height: 110, borderRadius: 55, borderWidth: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  countText: { fontSize: 44, fontWeight: '900' },
  countHint: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  confirmBody: { width: '100%', alignItems: 'flex-start', gap: 8, marginTop: 6 },
  confirmText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  bullet: { fontSize: 12.5, marginLeft: 24 },
  contactsBox: { marginTop: 10, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  contactsText: { fontSize: 13, fontWeight: '700', flex: 1 },
  warning: { marginTop: 6, fontSize: 12, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 20, width: '100%' },
  secondary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16, borderWidth: 1.5 },
  secondaryText: { fontWeight: '800', fontSize: 13.5 },
  primary: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 16 },
  primaryText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13.5 },
  pressed: { opacity: 0.75 },
});
