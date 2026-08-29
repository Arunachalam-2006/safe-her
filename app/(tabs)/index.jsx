import { useState, useEffect } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, ChevronRight, CircleAlert, MapPin, ShieldAlert, UsersRound } from 'lucide-react-native';
import { SafetyScore } from '../../components/safetyScore';
import { ActionRow, Card, colors, Header, Screen, SectionTitle } from '../../components/ui';
import { useAuth } from '../../lib/auth';
import { useLocation, reverseGeocode } from '../../lib/location';

export default function HomeScreen() {
  const { profile } = useAuth();
  const firstName = (profile?.full_name || 'there').split(' ')[0];
  const greeting = `Welcome back, ${firstName}`;
  const { location, requestLocation } = useLocation();
  const [currentArea, setCurrentArea] = useState('Locating...');

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (location) {
      reverseGeocode(location.lat, location.lng).then(name => {
        // use only the first part of the area name
        setCurrentArea(name.split(',')[0]);
      });
    }
  }, [location]);

  return (
    <Screen>
      <Header eyebrow="Today" title={greeting} action={<Pressable style={styles.bell}><Bell color={colors.ink} size={20} /></Pressable>} />
      
      <SafetyScore score="-" label="Analysis coming soon" />
      
      <View style={styles.sosWrap}>
        <Link href="/report" asChild>
          <Pressable style={({ pressed }) => [styles.sos, pressed && styles.pressed]}>
            <View style={styles.sosIcon}><ShieldAlert color={colors.white} size={25} /></View>
            <View style={styles.sosCopy}>
              <Text style={styles.sosTitle}>Need help right now?</Text>
              <Text style={styles.sosSub}>Trigger Smart SOS and share your live journey</Text>
            </View>
            <ChevronRight color={colors.white} size={20} />
          </Pressable>
        </Link>
      </View>
      
      <SectionTitle action={<Text style={styles.seeAll}>View map</Text>}>Your safety around you</SectionTitle>
      
      <Card>
        <ActionRow icon={<MapPin color={colors.teal} size={20} />} title={`Current area · ${currentArea}`} subtitle="Safety analysis coming soon" />
        <ActionRow icon={<UsersRound color={colors.blue} size={20} />} title="Community activity" subtitle="Community features coming soon" accent={colors.blue} />
      </Card>
      
      <SectionTitle>Quick actions</SectionTitle>
      
      <View style={styles.grid}>
        <Link href="/routes" asChild>
          <Pressable style={styles.quick}><MapPin color={colors.teal} size={23} /><Text style={styles.quickText}>Plan a safer route</Text></Pressable>
        </Link>
        <Link href="/report" asChild>
          <Pressable style={styles.quick}><CircleAlert color={colors.pink} size={23} /><Text style={styles.quickText}>Report an issue</Text></Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ bell: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, sosWrap: { marginVertical: 4 }, sos: { backgroundColor: colors.pink, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 26 }, pressed: { opacity: 0.75 }, sosIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#FFFFFF26', alignItems: 'center', justifyContent: 'center', marginRight: 12 }, sosCopy: { flex: 1 }, sosTitle: { color: colors.white, fontSize: 15, fontWeight: '800', marginBottom: 4 }, sosSub: { color: '#FFE7F0', fontSize: 12, lineHeight: 17 }, seeAll: { color: colors.teal, fontSize: 12, fontWeight: '700' }, grid: { flexDirection: 'row', gap: 12 }, quick: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16, minHeight: 94, justifyContent: 'space-between' }, quickText: { color: colors.ink, fontSize: 13, fontWeight: '800', lineHeight: 18 }, });
