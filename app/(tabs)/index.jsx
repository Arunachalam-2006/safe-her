import { useState, useEffect } from 'react';
import { Link } from 'expo-router';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  Bell,
  ChevronRight,
  CircleAlert,
  MapPin,
  ShieldAlert,
  UsersRound,
  Compass,
  PhoneCall,
  X,
  Radio,
  Sun,
  Moon,
  ShieldCheck,
  Building2,
  Phone
} from 'lucide-react-native';
import { SafetyScore } from '../../components/safetyScore';
import { ActionRow, Card, Header, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { useLocation, reverseGeocode } from '../../lib/location';

export default function HomeScreen() {
  const { profile } = useAuth();
  const { colors, isDark } = useTheme();
  const firstName = (profile?.full_name || 'there').split(' ')[0];
  const [currentArea, setCurrentArea] = useState('Locating...');
  const { location, requestLocation } = useLocation();
  
  // Modals state
  const [showNotifications, setShowNotifications] = useState(false);
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosActive, setSosActive] = useState(false);

  // Time & Safety Context
  const currentHour = new Date().getHours();
  const isNightTime = currentHour >= 18 || currentHour < 6;
  const timeGreeting = currentHour < 12 ? 'Good morning' : currentHour < 18 ? 'Good afternoon' : 'Good evening';
  const greeting = `${timeGreeting}, ${firstName}`;
  
  // Calculate dynamic safety score based on time
  const dynamicSafetyScore = isNightTime ? 82 : 94;
  const safetyLabel = isNightTime ? 'Moderate Night Safety' : 'High Safety Zone';

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (location) {
      reverseGeocode(location.lat, location.lng).then(name => {
        setCurrentArea(name.split(',')[0] || 'Chennai Central');
      });
    }
  }, [location]);

  return (
    <Screen>
      {/* Header with Time-Aware Greeting & Notification Bell */}
      <View style={styles.topBar}>
        <View>
          <View style={styles.modePillWrap}>
            {isNightTime ? (
              <View style={[styles.modeBadge, { backgroundColor: isDark ? '#1C2D37' : '#3A2E59' }]}>
                <Moon color={isDark ? colors.primary : '#E0C3FC'} size={12} />
                <Text style={[styles.modeText, { color: isDark ? colors.primary : '#E0C3FC' }]}>Night Mode Active</Text>
              </View>
            ) : (
              <View style={[styles.modeBadge, { backgroundColor: colors.primarySoft }]}>
                <Sun color={colors.primary} size={12} />
                <Text style={[styles.modeText, { color: colors.primary }]}>Daylight Monitoring</Text>
              </View>
            )}
          </View>
          <Text style={[styles.greetingTitle, { color: colors.ink }]}>{greeting}</Text>
        </View>
        
        <Pressable 
          onPress={() => setShowNotifications(true)} 
          style={[
            styles.bellBtn, 
            { backgroundColor: colors.cardBg, borderColor: colors.line }
          ]}
        >
          <Bell color={colors.ink} size={20} />
          <View style={[styles.bellBadge, { backgroundColor: colors.pink, borderColor: colors.cardBg }]} />
        </Pressable>
      </View>
      
      {/* Live Safety Score Card */}
      <SafetyScore score={dynamicSafetyScore} label={safetyLabel} />
      
      {/* Smart Emergency SOS Trigger Card */}
      <View style={styles.sosWrap}>
        <Pressable
          onPress={() => setShowSosModal(true)}
          style={({ pressed }) => [
            styles.sos, 
            { backgroundColor: colors.sosBg, borderColor: colors.sosBorder },
            pressed && styles.pressed, 
            sosActive && styles.sosTriggered
          ]}
        >
          <View style={styles.sosIcon}>
            <ShieldAlert color="#FFFFFF" size={26} />
          </View>
          <View style={styles.sosCopy}>
            <View style={styles.sosHeaderRow}>
              <Text style={styles.sosTitle}>
                {sosActive ? '🚨 SOS Emergency Broadcasting' : 'Need Emergency Help?'}
              </Text>
              <View style={styles.livePulse}>
                <Radio color="#FFFFFF" size={12} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>
            <Text style={styles.sosSub}>
              {sosActive
                ? 'Sharing real-time coordinates with Emergency Contact & Police'
                : 'Tap to trigger Smart SOS & share live journey with contacts'}
            </Text>
            
            <View style={styles.emergencyChip}>
              <Phone color="#FFE7F0" size={11} />
              <Text style={styles.emergencyChipText}>Emergency Contact Linked: Mom (+91 98765 43210)</Text>
            </View>
          </View>
          <ChevronRight color="#FFFFFF" size={20} />
        </Pressable>
      </View>
      
      {/* Your Safety Around You */}
      <SectionTitle action={<Text style={[styles.seeAll, { color: colors.primary }]}>View Live Map</Text>}>
        Your safety around you
      </SectionTitle>
      
      <Card>
        <ActionRow
          icon={<MapPin color={colors.teal} size={20} />}
          title={`Current area · ${currentArea}`}
          subtitle="Nearest Safe Hub: Central Police Station (350m)"
          accent={colors.teal}
        />
        <ActionRow
          icon={<UsersRound color={colors.blue} size={20} />}
          title="Community safety status"
          subtitle="2 Active patrols & 95% verified streetlight coverage"
          accent={colors.blue}
        />
      </Card>
      
      {/* Expanded 4-Tile Quick Actions Grid */}
      <SectionTitle>Quick safety actions</SectionTitle>
      
      <View style={styles.grid2x2}>
        <Link href="/routes" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: colors.primarySoft }]}>
              <Compass color={colors.primary} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Plan Safe Route</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>AI illuminated paths</Text>
            </View>
          </Pressable>
        </Link>
        
        <Link href="/report" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
              <CircleAlert color={colors.pink} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Report Hazard</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Lighting or issues</Text>
            </View>
          </Pressable>
        </Link>

        <Link href="/journey" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#1E3A5F' : '#E8F0FE' }]}>
              <ShieldCheck color={colors.blue} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Companion Escort</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Share live journey</Text>
            </View>
          </Pressable>
        </Link>

        <Link href="/routes" asChild>
          <Pressable style={StyleSheet.flatten([styles.quickCard, { backgroundColor: colors.cardBg, borderColor: colors.line }])}>
            <View style={[styles.quickIconBg, { backgroundColor: isDark ? '#3D2810' : '#FEF3E2' }]}>
              <Building2 color={colors.orange} size={22} />
            </View>
            <View>
              <Text style={[styles.quickCardTitle, { color: colors.ink }]}>Nearby Safe Hubs</Text>
              <Text style={[styles.quickCardSub, { color: colors.muted }]}>Police & 24/7 shops</Text>
            </View>
          </Pressable>
        </Link>
      </View>

      {/* Notifications Drawer Modal */}
      <Modal visible={showNotifications} animationType="slide" transparent={true} onRequestClose={() => setShowNotifications(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={styles.modalHeaderTitleRow}>
                <Bell color={colors.ink} size={20} />
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Safety Alerts & Updates</Text>
              </View>
              <Pressable onPress={() => setShowNotifications(false)} style={[styles.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              <View style={[styles.notifItem, { borderBottomColor: colors.line }]}>
                <View style={[styles.notifIcon, { backgroundColor: colors.primarySoft }]}>
                  <ShieldCheck color={colors.primary} size={18} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: colors.ink }]}>Active Police Patrol nearby</Text>
                  <Text style={[styles.notifDesc, { color: colors.muted }]}>Patrol unit #TN-04 active on Anna Salai until 11:00 PM.</Text>
                  <Text style={[styles.notifTime, { color: colors.muted }]}>10 min ago</Text>
                </View>
              </View>

              <View style={[styles.notifItem, { borderBottomColor: colors.line }]}>
                <View style={[styles.notifIcon, { backgroundColor: isDark ? '#3D2810' : '#FEF3E2' }]}>
                  <Sun color={colors.orange} size={18} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: colors.ink }]}>Streetlight Maintenance Verified</Text>
                  <Text style={[styles.notifDesc, { color: colors.muted }]}>3 reported offline lamps repaired near Teynampet metro station.</Text>
                  <Text style={[styles.notifTime, { color: colors.muted }]}>1 hour ago</Text>
                </View>
              </View>

              <View style={[styles.notifItem, { borderBottomColor: colors.line }]}>
                <View style={[styles.notifIcon, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
                  <ShieldAlert color={colors.pink} size={18} />
                </View>
                <View style={styles.notifContent}>
                  <Text style={[styles.notifTitle, { color: colors.ink }]}>Community Alert: Low Lighting</Text>
                  <Text style={[styles.notifDesc, { color: colors.muted }]}>Citizen report filed: Poor visibility near Bus Stop Lane.</Text>
                  <Text style={[styles.notifTime, { color: colors.muted }]}>3 hours ago</Text>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* SOS Trigger Confirmation Modal */}
      <Modal visible={showSosModal} animationType="fade" transparent={true} onRequestClose={() => setShowSosModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.sosModalContent, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.sosModalBadge, { backgroundColor: colors.pink }]}>
              <ShieldAlert color="#FFFFFF" size={36} />
            </View>
            
            <Text style={[styles.sosModalTitle, { color: colors.ink }]}>Smart Emergency SOS</Text>
            <Text style={[styles.sosModalSub, { color: colors.muted }]}>
              This action will instantly share your live coordinates with your Emergency Contact (Mom) and trigger emergency dispatch protocols.
            </Text>

            <Pressable
              onPress={() => {
                setSosActive(true);
                setShowSosModal(false);
              }}
              style={[styles.sosConfirmBtn, { backgroundColor: colors.pink }]}
            >
              <Text style={styles.sosConfirmText}>🚨 ACTIVATE SOS NOW</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                alert('Calling Emergency Helpline 112...');
              }}
              style={[styles.callHelplineBtn, { backgroundColor: colors.paper, borderColor: colors.line }]}
            >
              <PhoneCall color={colors.ink} size={18} />
              <Text style={[styles.callHelplineText, { color: colors.ink }]}>Call Women's Helpline 112</Text>
            </Pressable>

            <Pressable onPress={() => setShowSosModal(false)} style={styles.cancelBtn}>
              <Text style={[styles.cancelText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  modePillWrap: { marginBottom: 6 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, alignSelf: 'flex-start' },
  modeText: { fontSize: 11, fontWeight: '700' },
  greetingTitle: { fontSize: 26, lineHeight: 32, fontWeight: '800' },
  bellBtn: { width: 44, height: 44, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  bellBadge: { width: 9, height: 9, borderRadius: 5, position: 'absolute', top: 10, right: 10, borderWidth: 1.5 },
  sosWrap: { marginVertical: 8 },
  sos: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1 },
  sosTriggered: { opacity: 0.9 },
  pressed: { opacity: 0.8 },
  sosIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: '#FFFFFF26', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  sosCopy: { flex: 1 },
  sosHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  sosTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  livePulse: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFFFFF33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  liveText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  sosSub: { color: '#FFE7F0', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  emergencyChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFFFFF1F', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  emergencyChipText: { color: '#FFF0F5', fontSize: 10, fontWeight: '700' },
  seeAll: { fontSize: 12, fontWeight: '700' },
  grid2x2: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4, marginBottom: 20 },
  quickCard: { width: '48%', borderWidth: 1, borderRadius: 18, padding: 14, height: 110, justifyContent: 'space-between' },
  quickIconBg: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickCardTitle: { fontSize: 13, fontWeight: '800' },
  quickCardSub: { fontSize: 11, marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalBody: { paddingVertical: 4 },
  notifItem: { flexDirection: 'row', gap: 14, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  notifIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '700' },
  notifDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  notifTime: { fontSize: 10, marginTop: 4, fontWeight: '600' },
  sosModalContent: { margin: 20, borderRadius: 24, padding: 24, alignItems: 'center' },
  sosModalBadge: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  sosModalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 8 },
  sosModalSub: { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  sosConfirmBtn: { width: '100%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', marginBottom: 10 },
  sosConfirmText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  callHelplineBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  callHelplineText: { fontWeight: '700', fontSize: 13 },
  cancelBtn: { paddingVertical: 10 },
  cancelText: { fontSize: 13, fontWeight: '600' },
});
