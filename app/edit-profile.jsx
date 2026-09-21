import { useState, useEffect } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, ScrollView, SafeAreaView, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Check, Home, MapPin, Briefcase, Phone, UserRound, ShieldCheck, Navigation, Crosshair, Camera, Trash2 } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';
import { useLocation, haversineDistance, reverseGeocode } from '../lib/location';

export default function EditProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile } = useAuth();
  const { colors, isDark } = useTheme();
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url || null);
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

  const initial = (fullName || profile?.email || 'U').charAt(0).toUpperCase();

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setAvatarUrl(result.assets[0].uri);
  }

  function removePhoto() {
    setAvatarUrl(null);
  }

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
      avatar_url: avatarUrl,
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
    <SafeAreaView style={[s.safe, { backgroundColor: colors.paper }]}>
      <View style={[s.navBar, { backgroundColor: colors.cardBg, borderBottomColor: colors.line }]}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><ArrowLeft color={colors.ink} size={22} /></Pressable>
        <Text style={[s.navTitle, { color: colors.ink }]}>Edit profile</Text>
        <View style={s.backBtn} />
      </View>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={[s.sectionLabel, { color: colors.muted }]}>Profile photo</Text>
        <Card style={s.avatarCard}>
          <View style={s.avatarWrapper}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={[s.avatarImg, { borderColor: colors.teal }]} />
            ) : (
              <View style={[s.avatarPlaceholder, { backgroundColor: colors.tealSoft, borderColor: colors.line }]}>
                <Text style={[s.avatarInitials, { color: colors.teal }]}>{initial}</Text>
              </View>
            )}
            <Pressable onPress={pickPhoto} style={[s.cameraBadge, { backgroundColor: colors.teal, borderColor: colors.cardBg }]}>
              <Camera color="#FFFFFF" size={14} />
            </Pressable>
          </View>
          <View style={s.avatarActions}>
            <Pressable onPress={pickPhoto} style={({ pressed }) => [[s.photoBtn, { backgroundColor: colors.tealSoft }], pressed && s.pressed]}>
              <Camera color={colors.teal} size={16} />
              <Text style={[s.photoBtnText, { color: colors.teal }]}>{avatarUrl ? 'Change photo' : 'Upload photo'}</Text>
            </Pressable>
            {avatarUrl ? (
              <Pressable onPress={removePhoto} style={({ pressed }) => [s.removeBtn, pressed && s.pressed]}>
                <Trash2 color={colors.pink} size={16} />
                <Text style={[s.removeBtnText, { color: colors.pink }]}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        <Text style={[s.sectionLabel, { color: colors.muted }]}>Personal details</Text>
        <Card>
          <FieldRow icon={<UserRound color={colors.teal} size={18} />}><TextInput style={[s.input, { color: colors.ink }]} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={colors.muted} /></FieldRow>
          <Divider />
          <FieldRow icon={<Phone color={colors.blue} size={18} />}><TextInput style={[s.input, { color: colors.ink }]} value={phone} onChangeText={setPhone} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" /></FieldRow>
        </Card>

        <Text style={[s.sectionLabel, { color: colors.muted }]}>Emergency contact</Text>
        <Card>
          <FieldRow icon={<UserRound color={colors.pink} size={18} />}><TextInput style={[s.input, { color: colors.ink }]} value={emergencyName} onChangeText={setEmergencyName} placeholder="Contact name" placeholderTextColor={colors.muted} /></FieldRow>
          <Divider />
          <FieldRow icon={<Phone color={colors.pink} size={18} />}><TextInput style={[s.input, { color: colors.ink }]} value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="Contact phone" placeholderTextColor={colors.muted} keyboardType="phone-pad" /></FieldRow>
        </Card>

        <Text style={[s.sectionLabel, { color: colors.muted }]}>Saved places</Text>
        <Card>
          <PlaceRow icon={<Home color={colors.teal} size={18} />} label="Home" value={homeLabel} onPress={() => useCurrentLocation('home')} locating={locating === 'home'} />
          <Divider />
          <PlaceRow icon={<Briefcase color={colors.orange} size={18} />} label="Work" value={workLabel} onPress={() => useCurrentLocation('work')} locating={locating === 'work'} />
        </Card>

        {distance !== null ? (
          <View style={s.distanceBox}>
            <Navigation color={colors.teal} size={16} />
            <Text style={[s.distanceText, { color: colors.teal }]}>Home to work: {distance.toFixed(1)} km straight-line</Text>
          </View>
        ) : null}

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        {success ? <View style={[s.successBox, { backgroundColor: colors.tealSoft }]}><Check color={colors.teal} size={18} /><Text style={[s.successText, { color: colors.teal }]}>Saved successfully</Text></View> : null}

        <Pressable disabled={saving} onPress={handleSave} style={({ pressed }) => [[s.saveBtn, { backgroundColor: colors.teal }], pressed && s.pressed]}>
          {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <><Check color="#FFFFFF" size={18} /><Text style={s.saveText}>Save changes</Text></>}
        </Pressable>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Card({ children, style }) {
  const { colors } = useTheme();
  return <View style={[{ backgroundColor: colors.cardBg, borderRadius: 18, padding: 4, borderWidth: 1, borderColor: colors.line, marginBottom: 16 }, style]}>{children}</View>;
}

function FieldRow({ icon, children }) {
  return <View style={s.fieldRow}>{icon}{children}</View>;
}

function PlaceRow({ icon, label, value, onPress, locating }) {
  const { colors } = useTheme();
  return (
    <View style={s.fieldRow}>
      {icon}
      <View style={s.placeCopy}>
        <Text style={[s.placeLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[s.placeValue, { color: colors.ink }]} numberOfLines={1}>{value || 'Not set — tap to add'}</Text>
      </View>
      <Pressable onPress={onPress} style={[s.locateBtn, { backgroundColor: colors.tealSoft }]}>
        {locating ? <ActivityIndicator color={colors.teal} size="small" /> : <Crosshair color={colors.teal} size={16} />}
      </Pressable>
    </View>
  );
}

function Divider() {
  const { colors } = useTheme();
  return <View style={[s.divider, { backgroundColor: colors.line }]} />;
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 17, fontWeight: '800' },
  content: { padding: 20, paddingBottom: 40 },
  sectionLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 },
  avatarCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 16 },
  avatarWrapper: { position: 'relative' },
  avatarImg: { width: 72, height: 72, borderRadius: 26, borderWidth: 2 },
  avatarPlaceholder: { width: 72, height: 72, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarInitials: { fontSize: 26, fontWeight: '800' },
  cameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  avatarActions: { flex: 1, gap: 8 },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, alignSelf: 'flex-start' },
  photoBtnText: { fontSize: 13, fontWeight: '800' },
  removeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  removeBtnText: { fontSize: 12, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  input: { flex: 1, fontSize: 14, fontWeight: '600', outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  placeCopy: { flex: 1 },
  placeLabel: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  placeValue: { fontSize: 14, fontWeight: '600' },
  locateBtn: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, marginLeft: 42 },
  distanceBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingHorizontal: 4 },
  distanceText: { fontSize: 12, fontWeight: '700' },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  successBox: { borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  successText: { fontSize: 13, fontWeight: '800' },
  saveBtn: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  pressed: { opacity: 0.7 },
  saveText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
