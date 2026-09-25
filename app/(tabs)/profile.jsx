import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { 
  Bell, 
  Building2, 
  Camera, 
  ChevronRight, 
  LockKeyhole, 
  LogOut, 
  MapPin, 
  Pencil, 
  PhoneCall, 
  Settings, 
  ShieldCheck, 
  UserRound, 
  Sparkles, 
  Moon, 
  Sun,
  CheckCircle2,
  Trash2,
  X,
  UsersRound,
} from 'lucide-react-native';
import { useAuth } from '../../lib/auth';
import { useTheme } from '../../lib/theme';
import { Card, Header, Pill, Screen, SectionTitle } from '../../components/ui';
import { useSOS } from '../../lib/sos';
import { usePreferences } from '../../lib/preferences';

export default function ProfileScreen() {
  const router = useRouter();
  const { profile, updateProfile, signOut } = useAuth();
  const { colors, themeName, setThemeName, isDark } = useTheme();
  const { contactCount } = useSOS();
  const { prefs, update: updatePref } = usePreferences();
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const alertsSummary = prefs.safetyAlerts
    ? 'On · route risks & nearby reports'
    : 'Off · no safety notifications';
  const privacySummary = [
    prefs.anonymousReports ? 'Anonymous reports' : 'Named reports',
    prefs.preciseLocation ? 'Precise location' : 'Approximate location',
  ].join(' · ');
  
  const isGov = profile?.account_type === 'government';
  const initial = (profile?.full_name || profile?.email || 'U').charAt(0).toUpperCase();

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled) {
      await updateProfile({ avatar_url: result.assets[0].uri });
    }
  }

  async function removePhoto() {
    await updateProfile({ avatar_url: null });
    setShowImageModal(false);
  }

  return (
    <Screen>
      <Header
        eyebrow="Your SafeHer space"
        title={profile?.full_name || 'Your profile'}
        action={
          <Pressable onPress={() => setShowImageModal(true)} style={s.avatarHeaderBtn}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={[s.avatarHeaderImg, { borderColor: colors.primary }]} />
            ) : (
              <View style={[s.avatar, { backgroundColor: colors.primary }]}><Text style={s.avatarText}>{initial}</Text></View>
            )}
          </Pressable>
        }
      />

      {/* Main Profile Info Card */}
      <Card style={s.profile}>
        <Pressable onPress={() => setShowImageModal(true)} style={s.avatarCardWrapper}>
          {profile?.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={[s.profileAvatarImg, { borderColor: colors.primary }]} />
          ) : (
            <View style={[s.profileAvatar, { backgroundColor: colors.primarySoft }]}>
              {isGov ? (
                <Building2 color={colors.primary} size={28} />
              ) : (
                <UserRound color={colors.primary} size={28} />
              )}
            </View>
          )}
          <View style={[s.cameraBadge, { backgroundColor: colors.primary, borderColor: colors.cardBg }]}>
            <Camera color="#FFFFFF" size={12} />
          </View>
        </Pressable>

        <View style={{ flex: 1 }}>
          <Text style={[s.name, { color: colors.ink }]}>{profile?.full_name || 'SafeHer member'}</Text>
          <Text style={[s.email, { color: colors.muted }]}>{profile?.email}</Text>
          <View style={s.photoActionsRow}>
            <Pressable onPress={() => setShowImageModal(true)} style={s.changePhotoBtn}>
              <Text style={[s.changePhotoText, { color: colors.primary }]}>View big photo</Text>
            </Pressable>
            <Text style={[s.dotDivider, { color: colors.muted }]}>·</Text>
            <Pressable onPress={pickPhoto} style={s.changePhotoBtn}>
              <Text style={[s.changePhotoText, { color: colors.primary }]}>{profile?.avatar_url ? 'Change' : 'Upload'}</Text>
            </Pressable>
          </View>
        </View>

        <Pill tone={isGov ? 'orange' : 'primary'}>{isGov ? 'Government' : 'Protected'}</Pill>
      </Card>

      <Pressable onPress={() => router.push('/edit-profile')} style={({ pressed }) => [s.editBtn, { backgroundColor: colors.cardBg, borderColor: colors.line }, pressed && s.pressed]}>
        <Pencil color={colors.primary} size={17} />
        <Text style={[s.editText, { color: colors.ink }]}>Edit profile and details</Text>
        <ChevronRight color={colors.muted} size={18} />
      </Pressable>

      {/* Personal Details */}
      {(profile?.phone || profile?.emergency_contact_name) ? (
        <>
          <SectionTitle>Personal details</SectionTitle>
          <Card>
            {profile?.phone ? <DetailRow icon={<PhoneCall color={colors.blue} size={18} />} label="Phone" value={profile.phone} /> : null}
            {profile?.emergency_contact_name ? <DetailRow icon={<UserRound color={colors.pink} size={18} />} label="Emergency contact" value={`${profile.emergency_contact_name}${profile.emergency_contact_phone ? ' · ' + profile.emergency_contact_phone : ''}`} /> : null}
          </Card>
        </>
      ) : null}

      {/* Saved Places */}
      {(profile?.home_label || profile?.work_label) ? (
        <>
          <SectionTitle>Saved places</SectionTitle>
          <Card>
            {profile?.home_label ? <DetailRow icon={<MapPin color={colors.teal} size={18} />} label="Home" value={profile.home_label} /> : null}
            {profile?.work_label ? <DetailRow icon={<MapPin color={colors.orange} size={18} />} label="Work" value={profile.work_label} /> : null}
          </Card>
        </>
      ) : null}

      {/* Government Badge */}
      {isGov && profile?.agency ? (
        <Card style={[s.agencyCard, { backgroundColor: isDark ? '#1F2937' : '#1E1B4B' }]}>
          <Building2 color="#FFFFFF" size={20} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.agencyTitle}>{profile.agency}</Text>
            <Text style={s.agencySub}>Official government access</Text>
          </View>
        </Card>
      ) : null}

      {/* Preferences Section */}
      <SectionTitle>Preferences</SectionTitle>
      <Card>
        <Setting
          icon={<UsersRound color={colors.pink} size={19} />}
          title="Emergency Contacts"
          detail={contactCount > 0 ? `${contactCount} contact${contactCount === 1 ? '' : 's'} saved` : 'Add trusted contacts for SOS alerts'}
          onPress={() => router.push('/emergency-contacts')}
        />
        <Setting
          icon={<Bell color={colors.primary} size={19} />}
          title="Safety alerts"
          detail={alertsSummary}
          onPress={() => setShowAlertsModal(true)}
        />
        <Setting
          icon={<LockKeyhole color={colors.orange} size={19} />}
          title="Privacy controls"
          detail={privacySummary}
          onPress={() => setShowPrivacyModal(true)}
        />
        <Setting 
          icon={<Settings color={colors.muted} size={19} />} 
          title="App settings" 
          detail={`Theme: ${themeName === 'midnight' ? 'Midnight Shield (Dark)' : 'Blossom Luxe (Light)'}`} 
          onPress={() => setShowSettingsModal(true)}
        />
      </Card>

      <Card style={[s.trust, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
        <ShieldCheck color={colors.primary} size={23} />
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[s.trustTitle, { color: colors.ink }]}>Safety by design</Text>
          <Text style={[s.trustText, { color: colors.muted }]}>SafeHer uses only the information needed to make your journey more informed. Community reports never include your identity.</Text>
        </View>
      </Card>

      <Pressable onPress={() => signOut()} style={({ pressed }) => [s.signOutBtn, { borderColor: colors.pink + '50' }, pressed && s.pressed]}>
        <LogOut color={colors.pink} size={19} />
        <Text style={[s.signOutText, { color: colors.pink }]}>Sign out</Text>
      </Pressable>

      {/* Big View Profile Photo Lightbox Modal */}
      <Modal visible={showImageModal} animationType="fade" transparent={true} onRequestClose={() => setShowImageModal(false)}>
        <View style={s.lightboxOverlay}>
          <Pressable style={s.lightboxBackdrop} onPress={() => setShowImageModal(false)} />
          
          <View style={[s.lightboxCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
            <View style={s.lightboxHeader}>
              <Text style={[s.lightboxTitle, { color: colors.ink }]}>Profile Photo</Text>
              <Pressable onPress={() => setShowImageModal(false)} style={[s.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <View style={s.largeImageContainer}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={[s.largeImage, { borderColor: colors.primary }]} />
              ) : (
                <View style={[s.largePlaceholder, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
                  <Text style={[s.largeInitial, { color: colors.primary }]}>{initial}</Text>
                  <Text style={[s.noPhotoText, { color: colors.muted }]}>No photo uploaded yet</Text>
                </View>
              )}
            </View>

            <Text style={[s.lightboxUserName, { color: colors.ink }]}>{profile?.full_name || 'SafeHer Member'}</Text>
            <Text style={[s.lightboxUserRole, { color: colors.muted }]}>{isGov ? profile?.agency || 'Government Official' : 'Protected Citizen Account'}</Text>

            <View style={s.lightboxActionsRow}>
              <Pressable 
                onPress={() => {
                  setShowImageModal(false);
                  pickPhoto();
                }} 
                style={({ pressed }) => [s.lightboxBtn, { backgroundColor: colors.primary }, pressed && s.pressed]}
              >
                <Camera color="#FFFFFF" size={18} />
                <Text style={s.lightboxBtnText}>{profile?.avatar_url ? 'Change photo' : 'Upload photo'}</Text>
              </Pressable>

              {profile?.avatar_url ? (
                <Pressable 
                  onPress={removePhoto} 
                  style={({ pressed }) => [s.lightboxRemoveBtn, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }, pressed && s.pressed]}
                >
                  <Trash2 color={colors.pink} size={18} />
                  <Text style={[s.lightboxRemoveText, { color: colors.pink }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </Modal>

      {/* App Settings Modal */}
      <Modal visible={showSettingsModal} animationType="slide" transparent={true} onRequestClose={() => setShowSettingsModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={s.modalHeaderTitleRow}>
                <Settings color={colors.ink} size={20} />
                <Text style={[s.modalTitle, { color: colors.ink }]}>App Settings</Text>
              </View>
              <Pressable onPress={() => setShowSettingsModal(false)} style={[s.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={s.modalBody}>
              {/* Theme & Appearance Header */}
              <View style={s.themeHeaderRow}>
                <Sparkles color={colors.primary} size={20} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={[s.themeTitle, { color: colors.ink }]}>App Theme & Appearance</Text>
                  <Text style={[s.themeSub, { color: colors.muted }]}>Select your preferred visual mode</Text>
                </View>
              </View>

              <View style={s.themeGrid}>
                {/* Theme Option 1: Blossom Luxe (Light) */}
                <Pressable
                  onPress={() => setThemeName('blossom')}
                  style={({ pressed }) => [
                    s.themeCard,
                    {
                      backgroundColor: '#FFF7F9',
                      borderColor: themeName === 'blossom' ? '#7C3AED' : '#F1E6FF',
                      borderWidth: themeName === 'blossom' ? 2 : 1,
                    },
                    pressed && s.pressed,
                  ]}
                >
                  <View style={s.themeCardHeader}>
                    <View style={[s.themeIconCircle, { backgroundColor: '#F3E8FF' }]}>
                      <Sun color="#7C3AED" size={18} />
                    </View>
                    {themeName === 'blossom' ? <CheckCircle2 color="#7C3AED" size={18} /> : null}
                  </View>
                  <Text style={[s.themeNameText, { color: '#1E1B4B' }]}>🌸 Blossom Luxe</Text>
                  <Text style={[s.themeDescText, { color: '#7C7289' }]}>Warm violet & magenta light theme</Text>
                </Pressable>

                {/* Theme Option 2: Midnight Shield (Dark) */}
                <Pressable
                  onPress={() => setThemeName('midnight')}
                  style={({ pressed }) => [
                    s.themeCard,
                    {
                      backgroundColor: '#161B22',
                      borderColor: themeName === 'midnight' ? '#2DD4BF' : '#30363D',
                      borderWidth: themeName === 'midnight' ? 2 : 1,
                    },
                    pressed && s.pressed,
                  ]}
                >
                  <View style={s.themeCardHeader}>
                    <View style={[s.themeIconCircle, { backgroundColor: '#1C2D37' }]}>
                      <Moon color="#2DD4BF" size={18} />
                    </View>
                    {themeName === 'midnight' ? <CheckCircle2 color="#2DD4BF" size={18} /> : null}
                  </View>
                  <Text style={[s.themeNameText, { color: '#F0F6FC' }]}>🌙 Midnight Shield</Text>
                  <Text style={[s.themeDescText, { color: '#8B949E' }]}>Obsidian dark theme with neon cyan</Text>
                </Pressable>
              </View>

              {/* Version & System Info */}
              <View style={[s.appInfoBox, { backgroundColor: colors.paper, borderColor: colors.line }]}>
                <Text style={[s.appInfoTitle, { color: colors.ink }]}>SafeHer Safety Platform</Text>
                <Text style={[s.appInfoSub, { color: colors.muted }]}>Version 1.0.0 · AI Route Safety Active</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Safety Alerts Modal */}
      <Modal visible={showAlertsModal} animationType="slide" transparent onRequestClose={() => setShowAlertsModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={s.modalHeaderTitleRow}>
                <Bell color={colors.ink} size={20} />
                <Text style={[s.modalTitle, { color: colors.ink }]}>Safety Alerts</Text>
              </View>
              <Pressable onPress={() => setShowAlertsModal(false)} style={[s.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.modalBody}>
              <ToggleRow
                title="Safety notifications"
                desc="Show live area risks and nearby community reports in your alerts."
                value={prefs.safetyAlerts}
                onValueChange={(v) => updatePref('safetyAlerts', v)}
              />
              <ToggleRow
                title="Low-light warnings"
                desc="Warn me when streetlight coverage around me is poor."
                value={prefs.lowLightAlerts}
                disabled={!prefs.safetyAlerts}
                onValueChange={(v) => updatePref('lowLightAlerts', v)}
              />
              <ToggleRow
                title="Police & safe-hub alerts"
                desc="Highlight nearby police stations and 24/7 safe hubs."
                value={prefs.patrolAlerts}
                disabled={!prefs.safetyAlerts}
                onValueChange={(v) => updatePref('patrolAlerts', v)}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Privacy Controls Modal */}
      <Modal visible={showPrivacyModal} animationType="slide" transparent onRequestClose={() => setShowPrivacyModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.line }]}>
              <View style={s.modalHeaderTitleRow}>
                <LockKeyhole color={colors.ink} size={20} />
                <Text style={[s.modalTitle, { color: colors.ink }]}>Privacy Controls</Text>
              </View>
              <Pressable onPress={() => setShowPrivacyModal(false)} style={[s.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.modalBody}>
              <ToggleRow
                title="Anonymous reports"
                desc="Never attach your identity to community hazard reports."
                value={prefs.anonymousReports}
                onValueChange={(v) => updatePref('anonymousReports', v)}
              />
              <ToggleRow
                title="Precise location in SOS alerts"
                desc="Share exact coordinates. Turn off to share only an approximate area (~100 m)."
                value={prefs.preciseLocation}
                onValueChange={(v) => updatePref('preciseLocation', v)}
              />
              <View style={[s.appInfoBox, { backgroundColor: colors.paper, borderColor: colors.line }]}>
                <Text style={[s.appInfoTitle, { color: colors.ink }]}>Your data stays with you</Text>
                <Text style={[s.appInfoSub, { color: colors.muted }]}>
                  Your live location is only ever shared during an active SOS, and community reports carry no personal identifiers.
                </Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function ToggleRow({ title, desc, value, onValueChange, disabled = false }) {
  const { colors } = useTheme();
  return (
    <View style={[s.toggleRow, { borderBottomColor: colors.line, opacity: disabled ? 0.5 : 1 }]}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[s.toggleTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[s.toggleDesc, { color: colors.muted }]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.line, true: colors.primary }}
        thumbColor="#FFFFFF"
        ios_backgroundColor={colors.line}
      />
    </View>
  );
}

function Setting({ icon, title, detail, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.setting, { borderBottomColor: colors.line }, pressed && s.pressed]}>
      <View style={[s.settingIcon, { backgroundColor: colors.paper }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.settingTitle, { color: colors.ink }]}>{title}</Text>
        <Text style={[s.settingDetail, { color: colors.muted }]}>{detail}</Text>
      </View>
      <ChevronRight color={colors.muted} size={18} />
    </Pressable>
  );
}

function DetailRow({ icon, label, value }) {
  const { colors } = useTheme();
  return (
    <View style={[s.detailRow, { borderBottomColor: colors.line }]}>
      <View style={[s.detailIcon, { backgroundColor: colors.paper }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[s.detailLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[s.detailValue, { color: colors.ink }]}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  avatarHeaderBtn: { borderRadius: 15, overflow: 'hidden' },
  avatarHeaderImg: { width: 44, height: 44, borderRadius: 15, borderWidth: 1.5 },
  avatar: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatarCardWrapper: { position: 'relative' },
  profileAvatarImg: { width: 56, height: 56, borderRadius: 20, borderWidth: 2 },
  profileAvatar: { width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cameraBadge: { position: 'absolute', bottom: -2, right: -2, width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  name: { fontSize: 17, fontWeight: '800', marginBottom: 2 },
  email: { fontSize: 12 },
  photoActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  changePhotoBtn: { paddingVertical: 2 },
  changePhotoText: { fontSize: 12, fontWeight: '800' },
  dotDivider: { fontSize: 12 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 20 },
  pressed: { opacity: 0.7 },
  editText: { flex: 1, fontSize: 14, fontWeight: '800' },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  detailIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  detailLabel: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  detailValue: { fontSize: 14, fontWeight: '700' },
  agencyCard: { flexDirection: 'row', alignItems: 'center' },
  agencyTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  agencySub: { color: '#AAB8CD', fontSize: 12, marginTop: 3 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1 },
  toggleTitle: { fontSize: 14, fontWeight: '800', marginBottom: 3 },
  toggleDesc: { fontSize: 12, lineHeight: 16 },
  setting: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  settingIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  settingTitle: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  settingDetail: { fontSize: 12 },
  trust: { flexDirection: 'row', alignItems: 'flex-start' },
  trustTitle: { fontWeight: '800', marginBottom: 5 },
  trustText: { fontSize: 12, lineHeight: 18 },
  signOutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, height: 52, borderRadius: 16, borderWidth: 1.5, marginTop: 10 },
  signOutText: { fontWeight: '800', fontSize: 15 },

  // Big View Photo Lightbox styles
  lightboxOverlay: { flex: 1, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center', padding: 20 },
  lightboxBackdrop: { ...StyleSheet.absoluteFillObject },
  lightboxCard: { width: '100%', maxWidth: 360, borderRadius: 24, padding: 20, borderWidth: 1, alignItems: 'center' },
  lightboxHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  lightboxTitle: { fontSize: 16, fontWeight: '800' },
  largeImageContainer: { width: 220, height: 220, borderRadius: 110, marginBottom: 16, overflow: 'hidden' },
  largeImage: { width: '100%', height: '100%', borderRadius: 110, borderWidth: 3 },
  largePlaceholder: { width: '100%', height: '100%', borderRadius: 110, borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  largeInitial: { fontSize: 64, fontWeight: '800' },
  noPhotoText: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  lightboxUserName: { fontSize: 18, fontWeight: '800', marginBottom: 2 },
  lightboxUserRole: { fontSize: 12, fontWeight: '600', marginBottom: 20 },
  lightboxActionsRow: { width: '100%', flexDirection: 'row', gap: 10 },
  lightboxBtn: { flex: 1, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  lightboxBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  lightboxRemoveBtn: { paddingHorizontal: 16, height: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  lightboxRemoveText: { fontSize: 13, fontWeight: '800' },

  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  modalHeaderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalBody: { paddingVertical: 4 },
  themeHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, marginTop: 4 },
  themeTitle: { fontSize: 15, fontWeight: '800' },
  themeSub: { fontSize: 12, marginTop: 1 },
  themeGrid: { flexDirection: 'column', gap: 10, marginBottom: 20 },
  themeCard: { padding: 14, borderRadius: 16 },
  themeCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  themeIconCircle: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  themeNameText: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  themeDescText: { fontSize: 11, fontWeight: '600' },
  appInfoBox: { padding: 14, borderRadius: 14, borderWidth: 1, alignItems: 'center', marginTop: 4, marginBottom: 16 },
  appInfoTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  appInfoSub: { fontSize: 11, fontWeight: '600' },
});
