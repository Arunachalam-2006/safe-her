import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CheckCircle2, MapPin, Send, ShieldCheck } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { Card, colors, Header, Screen, SectionTitle } from '../../components/ui';

const categories = ['Poor lighting', 'Harassment', 'Theft', 'Broken CCTV', 'Unsafe stop', 'Suspicious activity', 'Other'];

export default function ReportScreen() {
  const { session } = useAuth();
  const [category, setCategory] = useState('Poor lighting');
  const [location, setLocation] = useState('');
  const [details, setDetails] = useState('');
  const [status, setStatus] = useState({ type: 'idle', message: '' });

  async function submitReport() {
    if (location.trim().length < 2) { setStatus({ type: 'error', message: 'Add an area or landmark so the community can understand where this happened.' }); return; }
    setStatus({ type: 'loading', message: '' });
    const { error } = await supabase.from('safeher_reports').insert({ category, location_label: location.trim(), details: details.trim(), user_id: session?.user?.id || null });
    if (error) { setStatus({ type: 'error', message: 'We could not send that report right now. Please try again.' }); return; }
    setLocation(''); setDetails(''); setStatus({ type: 'success', message: 'Thank you. Your anonymous report is now helping improve local safety scores.' });
  }

  return <Screen><Header eyebrow="Community reporting" title="Help make routes safer" /><Card style={styles.notice}><ShieldCheck color={colors.teal} size={22} /><Text style={styles.noticeText}>Reports are anonymous. Share only what you are comfortable sharing, and call emergency services if someone is in immediate danger.</Text></Card><SectionTitle>What did you notice?</SectionTitle><View style={styles.chips}>{categories.map((item) => <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></Pressable>)}</View><Card style={styles.form}><Text style={styles.label}>Area or landmark</Text><View style={styles.inputWrap}><MapPin color={colors.muted} size={18} /><TextInput value={location} onChangeText={setLocation} placeholder="e.g. Adyar bus stop" placeholderTextColor={colors.muted} style={styles.input} /></View><Text style={styles.label}>What happened? <Text style={styles.optional}>Optional</Text></Text><TextInput multiline value={details} onChangeText={setDetails} placeholder="Add helpful context without personal details" placeholderTextColor={colors.muted} style={[styles.textarea, { textAlignVertical: 'top' }]} /><Pressable disabled={status.type === 'loading'} onPress={submitReport} style={({ pressed }) => [styles.submit, pressed && styles.pressed]}><Send color={colors.white} size={17} /><Text style={styles.submitText}>{status.type === 'loading' ? 'Sending…' : 'Send anonymous report'}</Text></Pressable>{status.message ? <View style={[styles.status, status.type === 'success' ? styles.success : styles.error]}>{status.type === 'success' ? <CheckCircle2 color={colors.teal} size={18} /> : <Text style={styles.errorMark}>!</Text>}<Text style={styles.statusText}>{status.message}</Text></View> : null}</Card></Screen>;
}

const styles = StyleSheet.create({ notice: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.tealSoft, borderColor: colors.tealSoft, gap: 10 }, noticeText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 }, chip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line }, chipActive: { backgroundColor: colors.ink, borderColor: colors.ink }, chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, chipTextActive: { color: colors.white }, form: { padding: 16 }, label: { color: colors.ink, fontSize: 13, fontWeight: '800', marginBottom: 8, marginTop: 4 }, optional: { color: colors.muted, fontWeight: '500' }, inputWrap: { borderWidth: 1, borderColor: colors.line, borderRadius: 13, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, marginBottom: 18 }, input: { flex: 1, color: colors.ink, padding: 13, fontSize: 14 }, textarea: { minHeight: 92, borderWidth: 1, borderColor: colors.line, borderRadius: 13, padding: 13, color: colors.ink, fontSize: 14, marginBottom: 16 }, submit: { height: 48, borderRadius: 13, backgroundColor: colors.pink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, pressed: { opacity: 0.7 }, submitText: { color: colors.white, fontWeight: '800', fontSize: 14 }, status: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: 12, borderRadius: 12 }, success: { backgroundColor: colors.tealSoft }, error: { backgroundColor: '#FFF0F0' }, statusText: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 }, errorMark: { color: '#C24141', fontWeight: '800', fontSize: 18 } });
