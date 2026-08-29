import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Bell, Building2, Camera, ChevronRight, LockKeyhole, LogOut, MapPin, Pencil, PhoneCall, Settings, ShieldCheck, UserRound } from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { Card, colors, Header, Pill, Screen, SectionTitle } from '../../components/ui';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile, signOut } = useAuth();
  const isGov = profile?.account_type === 'government';
  const initial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase();

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      await updateProfile({ avatar_url: result.assets[0].uri });
    }
  }

  return (
    <Screen>
      <Header
        eyebrow="Your SafeHer space"
        title={profile?.full_name || 'Your profile'}
        action={
          <Pressable onPress={pickPhoto} style={s.avatarHeaderBtn}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={s.avatarHeaderImg} />
            ) : (
              <View style={s.avatar}><Text style={s.avatarText}>{initial}</Text></View>
            )}
          </Pressable>
        }
      />

      <Card style={s.profile}>
        <Pressable onPress={pickPhoto} style={s.avatarCardWrapper}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={s.profileAvatarImg} />
          ) : (
            <View style={s.profileAvatar}>
              {isGov ? (
                <Building2 color={colors.teal} size={28} />
              ) : (
                <UserRound color={colors.teal} size={28} />
              )}
            </View>
          )}
          <View style={s.cameraBadge}>
            <Camera color={colors.white} size={12} />
          </View>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={s.name}>{profile?.full_name || 'SafeHer member'}</Text>
          <Text style={s.email}>{profile?.email}</Text>
          <Pressable onPress={pickPhoto} style={s.changePhotoBtn}>
            <Text style={s.changePhotoText}>{profile?.avatar_url ? 'Change photo' : 'Add photo'}</Text>
          </Pressable>
        </View>

        <Pill tone={isGov ? 'orange' : 'teal'}>{isGov ? 'Government' : 'Protected'}</Pill>
      </Card>

      <Pressable onPress={() => router.push('/edit-profile')} style={({ pressed }) => [s.editBtn, pressed && s.pressed]}>
        <Pencil color={colors.teal} size={17} />
        <Text style={s.editText}>Edit profile and details</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>

      {(profile?.phone || profile?.emergency_contact_name) ? (
        <>
          <SectionTitle>Personal details</SectionTitle>
          <Card>
            {profile?.phone ? <DetailRow icon={<PhoneCall color={colors.blue} size={18} />} label="Phone" value={profile.phone} /> : null}
            {profile?.emergency_contact_name ? <DetailRow icon={<UserRound color={colors.pink} size={18} />} label="Emergency contact" value={`${profile.emergency_contact_name}${profile.emergency_contact_phone ? ' · ' + profile.emergency_contact_phone : ''}`} /> : null}
          </Card>
        </>
      ) : null}

      {(profile?.home_label || profile?.work_label) ? (
        <>
          <SectionTitle>Saved places</SectionTitle>
          <Card>
            {profile?.home_label ? <DetailRow icon={<MapPin color={colors.teal} size={18} />} label="Home" value={profile.home_label} /> : null}
            {profile?.work_label ? <DetailRow icon={<MapPin color={colors.orange} size={18} />} label="Work" value={profile.work_label} /> : null}
          </Card>
        </>
      ) : null}

      {isGov && profile?.agency ? (
        <Card style={s.agencyCard}>
          <Building2 color={colors.white} size={20} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.agencyTitle}>{profile.agency}</Text>
            <Text style={s.agencySub}>Official government access</Text>
          </View>
        </Card>
      ) : null}

      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <Setting icon={<Bell color={colors.teal} size={19} />} title="Safety alerts" detail="Get notified about new route risks" />
        <Setting icon={<LockKeyhole color={colors.orange} size={19} />} title="Privacy controls" detail="Manage location and report settings" />
        <Setting icon={<Settings color={colors.muted} size={19} />} title="App settings" detail="Notifications, appearance, and help" />
      </Card>

      <Card style={s.trust}>
        <ShieldCheck color={colors.teal} size={23} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={s.trustTitle}>Safety by design</Text>
          <Text style={s.trustText}>SafeHer uses only the information needed to make your journey more informed. Community reports never include your identity.</Text>
        </View>
      </Card>

      <Pressable onPress={() => signOut()} style={({ pressed }) => [s.signOutBtn, pressed && s.pressed]}>
        <LogOut color={colors.pink} size={19} />
        <Text style={s.signOutText}>Sign out</Text>
      </Pressable>
    </Screen>
  );
}

function Setting({ icon, title, detail }) {
  return <Pressable style={s.setting}><View style={s.settingIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={s.settingTitle}>{title}</Text><Text style={s.settingDetail}>{detail}</Text></View><ChevronRight color={colors.muted} size={18} /></Pressable>;
}

function DetailRow({ icon, label, value }) {
  return <View style={s.detailRow}><View style={s.detailIcon}>{icon}</View><View style={{ flex: 1 }}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value}</Text></View></View>;
}

const s = StyleSheet.create({
  avatarHeaderBtn: { borderRadius: 15, overflow: 'hidden' },
  avatarHeaderImg: { width: 44, height: 44, borderRadius: 15, borderWidth: 1.5, borderColor: colors.teal },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCardWrapper: { position: 'relative' },
  profileAvatarImg: { width: 56, height: 56, borderRadius: 20, borderWidth: 2, borderColor: colors.teal },
  profileAvatar: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 8, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.white },
  name: { color: colors.ink, fontSize: 17, fontWeight: '800', marginBottom: 2 },
  email: { color: colors.muted, fontSize: 12 },
  changePhotoBtn: { marginTop: 4 },
  changePhotoText: { color: colors.teal, fontSize: 12, fontWeight: '800' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20 },
  pressed: { opacity: 0.7 },
  editText: { flex: 1, color: colors.ink, fontSize: 14, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  detailIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  detailLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', marginBottom: 3 },
  detailValue: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  agencyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.ink, borderColor: colors.ink },
  agencyTitle: { color: colors.white, fontWeight: '800', fontSize: 14 },
  agencySub: { color: '#AAB8CD', fontSize: 12, marginTop: 3 },
  setting: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.line },
  settingIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  settingTitle: { color: colors.ink, fontSize: 14, fontWeight: '800', marginBottom: 4 },
  settingDetail: { color: colors.muted, fontSize: 12 },
  trust: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.tealSoft, borderColor: colors.tealSoft },
  trustTitle: { color: colors.ink, fontWeight: '800', marginBottom: 5 },
  trustText: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, height: 52, borderRadius: 16, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.pink + '40' },
  signOutText: { color: colors.pink, fontWeight: '800', fontSize: 15 },
});
