import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CheckCircle2, MapPin, Send, ShieldCheck, X } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { addReport } from '../../lib/localReports';
import { usePreferences } from '../../lib/preferences';
import { Card, Header, Screen, SectionTitle } from '../../components/ui';

const categories = ['Poor lighting', 'Harassment', 'Theft', 'Broken CCTV', 'Unsafe stop', 'Suspicious activity', 'Other'];

export default function ReportScreen() {
  const { prefs } = usePreferences();
  const { colors, isDark } = useTheme();
  const [category, setCategory] = useState('Poor lighting');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [imageUri, setImageUri] = useState(null);
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled) setImageUri(result.assets[0].uri);
  }

  async function submitReport() {
    if (location.trim().length < 2) {
      setStatus({ type: 'error', message: 'Add an area or landmark so the community can understand where this happened.' });
      return;
    }
    setStatus({ type: 'loading', message: '' });

    // Reports are anonymous by design; identity is never sent to the backend.
    const result = await addReport({
      category,
      location_label: location.trim(),
      details: details.trim(),
      image_uri: imageUri,
    });

    setLocation(''); setDetails(''); setImageUri(null);

    if (result.offline) {
      setStatus({
        type: 'success',
        message: 'Saved on your device. It will sync to the community safety map when you are back online.',
      });
    } else {
      setStatus({
        type: 'success',
        message: prefs.anonymousReports
          ? 'Thank you. Your anonymous report is now live on the community safety map.'
          : 'Thank you. Your report is now live on the community safety map.',
      });
    }
  }

  return (
    <Screen>
      <Header eyebrow="Community reporting" title="Help make routes safer" />
      
      <Card style={[styles.notice, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
        <ShieldCheck color={colors.primary} size={22} />
        <Text style={[styles.noticeText, { color: colors.ink }]}>
          Reports are anonymous. Share only what you are comfortable sharing, and call emergency services if someone is in immediate danger.
        </Text>
      </Card>

      <SectionTitle>What did you notice?</SectionTitle>
      <View style={styles.chips}>
        {categories.map((item) => (
          <Pressable 
            key={item} 
            onPress={() => setCategory(item)} 
            style={[
              styles.chip, 
              { 
                backgroundColor: category === item ? colors.ink : colors.cardBg, 
                borderColor: category === item ? colors.ink : colors.line 
              }
            ]}
          >
            <Text style={[styles.chipText, { color: category === item ? (isDark ? '#0D1117' : '#FFFFFF') : colors.muted }]}>
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.form}>
        <Text style={[styles.label, { color: colors.ink }]}>Area or landmark</Text>
        <View style={[styles.inputWrap, { borderColor: colors.line }]}>
          <MapPin color={colors.muted} size={18} />
          <TextInput 
            value={location} 
            onChangeText={setLocation} 
            placeholder="e.g. Adyar bus stop" 
            placeholderTextColor={colors.muted} 
            style={[styles.input, { color: colors.ink }]} 
          />
        </View>

        <Text style={[styles.label, { color: colors.ink }]}>What happened? <Text style={[styles.optional, { color: colors.muted }]}>Optional</Text></Text>
        <TextInput 
          multiline 
          value={details} 
          onChangeText={setDetails} 
          placeholder="Add helpful context without personal details" 
          placeholderTextColor={colors.muted} 
          style={[styles.textarea, { borderColor: colors.line, color: colors.ink, textAlignVertical: 'top' }]} 
        />

        <Pressable onPress={pickPhoto} style={({ pressed }) => [styles.photoButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
          <Camera color={colors.primary} size={18} />
          <Text style={[styles.photoButtonText, { color: colors.primary }]}>{imageUri ? 'Change photo' : 'Add photo'}</Text>
        </Pressable>

        {imageUri ? (
          <View style={styles.photoPreview}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <Pressable onPress={() => setImageUri(null)} style={styles.removePhoto}>
              <X color="#FFFFFF" size={16} />
            </Pressable>
          </View>
        ) : null}

        <Pressable 
          disabled={status.type === 'loading'} 
          onPress={submitReport} 
          style={({ pressed }) => [styles.submit, { backgroundColor: colors.pink }, pressed && styles.pressed]}
        >
          <Send color="#FFFFFF" size={17} />
          <Text style={styles.submitText}>{status.type === 'loading' ? 'Sending…' : 'Send anonymous report'}</Text>
        </Pressable>

        {status.message ? (
          <View style={[styles.status, status.type === 'success' ? { backgroundColor: colors.primarySoft } : { backgroundColor: '#FFF0F0' }]}>
            {status.type === 'success' ? <CheckCircle2 color={colors.primary} size={18} /> : <Text style={styles.errorMark}>!</Text>}
            <Text style={[styles.statusText, { color: colors.ink }]}>{status.message}</Text>
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ 
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 20, padding: 16 }, 
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' }, 
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20, marginTop: 4 }, 
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, borderWidth: 1.5 }, 
  chipText: { fontSize: 12, fontWeight: '700' }, 
  form: { padding: 18, borderRadius: 24 }, 
  label: { fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 4 }, 
  optional: { fontWeight: '500' }, 
  inputWrap: { borderWidth: 1.5, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 18, height: 52 }, 
  input: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, fontSize: 14, outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' }, 
  textarea: { minHeight: 100, borderWidth: 1.5, borderRadius: 16, padding: 14, fontSize: 14, marginBottom: 18, outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' }, 
  photoButton: { height: 50, borderWidth: 1.5, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }, 
  photoButtonText: { fontSize: 13, fontWeight: '800' }, 
  photoPreview: { height: 160, borderRadius: 16, overflow: 'hidden', marginBottom: 18, position: 'relative' }, 
  previewImage: { width: '100%', height: '100%' }, 
  removePhoto: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: '#00000088', alignItems: 'center', justifyContent: 'center' }, 
  submit: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, 
  pressed: { opacity: 0.7 }, 
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 }, 
  status: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, padding: 14, borderRadius: 16 }, 
  statusText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: '600' }, 
  errorMark: { color: '#C24141', fontWeight: '800', fontSize: 18 } 
});
