import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Home, MapPin, Briefcase, Phone, UserRound, ShieldCheck, Navigation, Crosshair } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { colors } from '../components/ui';
import { useLocation, haversineDistance, reverseGeocode } from '../lib/location';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [emergencyName, setEmergencyName] = useState(profile?.emergency_contact_name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(profile?.emergency_contact_phone || '');
  const [homeLabel, setHomeLabel] = useState(profile?.home_label || '');
  const [homeLat, setHomeLat] = useState(profile?.home_lat || null);
  const [homeLng, setHomeLng] = useState(profile?.home_lng || null);
  const [workLabel, setWorkLabel] = useState(profile?.work_label || '');
  const [workLat, setWorkLat] = useState(profile?.work_lat || null);
  const [workLng, setWorkLng] = useState(profile?.work_lng || null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [locating, setLocating] = useState('');
  const { location, requestLocation } = useLocation();

  async function useCurrentLocation(target) {
    setLocating(target);
    requestLocation();
  }

  async function handleSetLocation(target) {
    if (!location) {
      useCurrentLocation(target);
      return;
    }
    const label = await reverseGeocode(location.lat, location.lng);
    if (target === 'home') {
      setHomeLabel(label);
      setHomeLat(location.lat);
      setHomeLng(location.lng);
    } else {
      setWorkLabel(label);
      setWorkLat(location.lat);
      setWorkLng(location.lng);
    }
    setLocating('');
  }

  useEffect(() => {
    if (!location || !locating) return;
    handleSetLocation(locating);
  }, [location, locating]);

  async function handleSave() {
    setError('');
    if (!fullName.trim()) { setError('Your name cannot be empty.'); return; }
    setSaving(true);
    const { error: e } = await updateProfile({
      full_name: fullName.trim(),
      phone: phone.trim(),
      emergency_contact_name: emergencyName.trim(),
      emergency_contact_phone: emergencyPhone.trim(),
      home_label: homeLabel.trim(),
      home_lat: homeLat,
      home_lng: homeLng,
      work_label: workLabel.trim(),
      work_lat: workLat,
      work_lng: workLng,
    });
    setSaving(false);
    if (e) { setError('Could not save your changes. Please try again.'); return; }
    setSuccess(true);
    setTimeout(() => router.replace('/(tabs)/profile'), 800);
  }

  const distance = homeLat && workLat ? haversineDistance(homeLat, homeLng, workLat, workLng) : null;

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.navBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><ArrowLeft color={colors.ink} size={22} /></Pressable>
        <Text style={s.navTitle}>Edit profile</Text>
        <View style={s.backBtn} />
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.sectionLabel}>Personal details</Text>
        <Card>
          <FieldRow icon={<UserRound color={colors.teal} size={18} />}><TextInput style={s.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} /></FieldRow>
          <Divider />
          <FieldRow icon={<Phone color={colors.blue} size={18} />}><TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" /></FieldRow>
        </Card>

        <Text style={s.sectionLabel}>Emergency contact</Text>
        <Card>
          <FieldRow icon={<UserRound color={colors.pink} size={18} />}><TextInput style={s.input} value={emergencyName} onChangeText={setEmergencyName} placeholder="Contact name" placeholderTextColor={colors.muted} /></FieldRow>
          <Divider />
          <FieldRow icon={<Phone color={colors.pink} size={18} />}><TextInput style={s.input} value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="Contact phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" /></FieldRow>
        </Card>

        <Text style={s.sectionLabel}>Saved places</Text>
        <Card>
          <PlaceRow icon={<Home color={colors.teal} size={18} />} label="Home" value={homeLabel} onPress={() => useCurrentLocation('home')} locating={locating === 'home'} />
          <Divider />
          <PlaceRow icon={<Briefcase color={colors.orange} size={18} />} label="Work" value={workLabel} onPress={() => useCurrentLocation('work')} locating={locating === 'work'} />
        </Card>

        {distance !== null ? (
          <View style={s.distanceBox}>
            <Navigation color={colors.teal} size={16} />
            <Text style={s.distanceText}>Home to work: {distance.toFixed(1)} km straight-line</Text>
          </View>
        ) : null}

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        {success ? <View style={s.successBox}><Check color={colors.teal} size={18} /><Text style={s.successText}>Saved successfully</Text></View> : null}

        <Pressable disabled={saving} onPress={handleSave} style={({ pressed }) => [s.saveBtn, pressed && s.pressed]}>
          {saving ? <ActivityIndicator color={colors.white} size="small" /> : <><Check color={colors.white} size={18} /><Text style={s.saveText}>Save changes</Text></>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ children }) {
  return <View style={s.card}>{children}</View>;
}

function FieldRow({ icon, children }) {
  return <View style={s.fieldRow}>{icon}{children}</View>;
}

function PlaceRow({ icon, label, value, onPress, locating }) {
  return (
    <View style={s.fieldRow}>
      {icon}
      <View style={s.placeCopy}>
        <Text style={s.placeLabel}>{label}</Text>
        <Text style={s.placeValue} numberOfLines={1}>{value || 'Not set — tap to add'}</Text>
      </View>
      <Pressable onPress={onPress} style={s.locateBtn}>
        {locating ? <ActivityIndicator color={colors.teal} size="small" /> : <Crosshair color={colors.teal} size={16} />}
      </Pressable>
    </View>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line },
  backBtn: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 40 },
  sectionLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 4, borderWidth: 1, borderColor: colors.line, marginBottom: 16 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '600', outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  placeCopy: { flex: 1 },
  placeLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  placeValue: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  locateBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.line, marginLeft: 42 },
  distanceBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  distanceText: { color: colors.teal, fontSize: 12, fontWeight: '700' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  successBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.tealSoft, borderRadius: 12, padding: 12, marginBottom: 12 },
  successText: { color: colors.teal, fontSize: 13, fontWeight: '800' },
  saveBtn: { height: 52, borderRadius: 16, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  pressed: { opacity: 0.7 },
  saveText: { color: colors.white, fontWeight: '800', fontSize: 15 },
});
