import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { colors } from '../components/ui';

export default function AuthScreen() {
  const router = useRouter();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState('signin');
  const [accountType, setAccountType] = useState('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [agency, setAgency] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password) { setError('Enter your email and password to continue.'); return; }
    if (mode === 'signup' && !fullName.trim()) { setError('Add your name so we can personalise your experience.'); return; }
    if (mode === 'signup' && accountType === 'government' && !agency.trim()) { setError('Add your agency name so we can verify your dashboard access.'); return; }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error: e } = await signIn({ email: email.trim(), password });
        if (e) { setError(e.message.includes('Invalid login') ? 'Those details do not match an account. Please try again.' : e.message); return; }
      } else {
        const { data, error: e } = await signUp({
          email: email.trim(),
          password,
          fullName: fullName.trim(),
          accountType,
          agency: agency.trim(),
        });
        if (e) { setError(e.message); return; }
        if (!data.session) { setError('Account created. Please sign in to continue.'); setMode('signin'); return; }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.wrap}>
      <View style={s.hero}>
        <View style={s.logo}><ShieldCheck color={colors.white} size={28} /></View>
        <Text style={s.brand}>SafeHer</Text>
        <Text style={s.tagline}>Safer journeys, together</Text>
      </View>

      <View style={s.card}>
        <View style={s.toggleRow}>
          <Pressable onPress={() => setMode('signin')} style={[s.toggle, mode === 'signin' && s.toggleActive]}><Text style={[s.toggleText, mode === 'signin' && s.toggleTextActive]}>Sign in</Text></Pressable>
          <Pressable onPress={() => setMode('signup')} style={[s.toggle, mode === 'signup' && s.toggleActive]}><Text style={[s.toggleText, mode === 'signup' && s.toggleTextActive]}>Create account</Text></Pressable>
        </View>

        <View style={s.roleRow}>
          <Pressable onPress={() => setAccountType('citizen')} style={[s.role, accountType === 'citizen' && s.roleActive]}><UserRound color={accountType === 'citizen' ? colors.white : colors.muted} size={18} /><Text style={[s.roleText, accountType === 'citizen' && s.roleTextActive]}>Citizen</Text></Pressable>
          <Pressable onPress={() => setAccountType('government')} style={[s.role, accountType === 'government' && s.roleActive]}><Building2 color={accountType === 'government' ? colors.white : colors.muted} size={18} /><Text style={[s.roleText, accountType === 'government' && s.roleTextActive]}>Government</Text></Pressable>
        </View>

        {mode === 'signup' ? (
          <Field icon={<UserRound color={colors.muted} size={18} />} value={fullName} onChangeText={setFullName} placeholder="Full name" />
        ) : null}
        <Field icon={<Mail color={colors.muted} size={18} />} value={email} onChangeText={setEmail} placeholder="Email address" autoCap="none" keyboardType="email-address" />
        <Field icon={<LockKeyhole color={colors.muted} size={18} />} value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry={!showPassword} rightIcon={showPassword ? <EyeOff color={colors.muted} size={18} /> : <Eye color={colors.muted} size={18} />} onRightPress={() => setShowPassword(!showPassword)} />
        {mode === 'signup' && accountType === 'government' ? (
          <Field icon={<Building2 color={colors.muted} size={18} />} value={agency} onChangeText={setAgency} placeholder="Agency name (e.g. Chennai Police)" />
        ) : null}

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

        <Pressable disabled={busy} onPress={handleSubmit} style={({ pressed }) => [s.submit, pressed && s.pressed]}>
          <Text style={s.submitText}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
          <ArrowRight color={colors.white} size={18} />
        </Pressable>

        <Text style={s.help}>{mode === 'signin' ? "Don't have an account? " : 'Already registered? '}<Text onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} style={s.link}>{mode === 'signin' ? 'Create one' : 'Sign in'}</Text></Text>
      </View>
    </View>
  );
}

function Field({ icon, rightIcon, onRightPress, ...props }) {
  return (
    <View style={s.field}>
      {icon}
      <TextInput style={s.input} placeholderTextColor={colors.muted} autoCapitalize="none" {...props} />
      {rightIcon ? <Pressable onPress={onRightPress}>{rightIcon}</Pressable> : null}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.paper },
  hero: { alignItems: 'center', paddingTop: 64, paddingBottom: 28, backgroundColor: colors.ink, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  logo: { width: 56, height: 56, borderRadius: 20, backgroundColor: colors.tealSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  brand: { color: colors.white, fontSize: 26, fontWeight: '800', letterSpacing: 0.5 },
  tagline: { color: '#AAB8CD', fontSize: 13, marginTop: 5 },
  card: { margin: 20, backgroundColor: colors.white, borderRadius: 22, padding: 20, borderWidth: 1, borderColor: colors.line },
  toggleRow: { flexDirection: 'row', backgroundColor: colors.paper, borderRadius: 13, padding: 4, marginBottom: 16 },
  toggle: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  toggleActive: { backgroundColor: colors.ink },
  toggleText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  toggleTextActive: { color: colors.white },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  role: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 11, borderRadius: 13, borderWidth: 1.5, borderColor: colors.line },
  roleActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  roleText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  roleTextActive: { color: colors.white },
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 13, paddingHorizontal: 13, marginBottom: 12, height: 50 },
  input: { flex: 1, color: colors.ink, fontSize: 14, marginLeft: 9 },
  errorBox: { backgroundColor: '#FFF0F0', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#C24141', fontSize: 12, lineHeight: 18, fontWeight: '600' },
  submit: { height: 50, borderRadius: 13, backgroundColor: colors.teal, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  pressed: { opacity: 0.7 },
  submitText: { color: colors.white, fontWeight: '800', fontSize: 14 },
  help: { textAlign: 'center', color: colors.muted, fontSize: 12, marginTop: 16 },
  link: { color: colors.teal, fontWeight: '700' },
});
