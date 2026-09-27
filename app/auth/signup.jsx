import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Phone, UserPlus, UserRound } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { supabaseConfigError } from '../../lib/supabase';
import { validatePassword, validateSignup } from '../../lib/authValidation';
import {
  AuthButton,
  AuthCard,
  AuthError,
  AuthField,
  AuthHero,
  AuthLink,
  ConfigWarning,
  PasswordField,
  PasswordStrength,
} from '../../components/auth/AuthUI';

export default function SignupScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { signUp } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const strength = validatePassword(password);

  const clearError = (key) => setErrors((e) => (e[key] ? { ...e, [key]: null } : e));

  const handleSubmit = useCallback(async () => {
    if (inFlightRef.current) return;
    setFormError('');

    const check = validateSignup({ fullName, email, password, confirmPassword, phone });
    setErrors(check.errors);
    if (!check.valid) return;

    inFlightRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await signUp({ email, password, fullName, phone });

      if (error) {
        setFormError(error.message);
        return;
      }
      // Supabase only issues a session immediately when email confirmation is
      // switched OFF. Never pretend verification happened.
      if (data?.needsEmailVerification || !data?.session) {
        router.push({
          pathname: '/auth/verify-email',
          params: { email: data?.user?.email || email },
        });
        return;
      }

      // Signed in — the root gate routes onward on its own.
    } catch (err) {
      setFormError('Something went wrong creating your account. Please try again.');
      if (__DEV__) console.warn('[auth] sign-up failed:', err?.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [fullName, email, phone, password, confirmPassword, signUp, router]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <AuthHero
          title="Create your account"
          subtitle="A few details and you can check your journey safety before you travel."
        />

        <AuthCard>
          {supabaseConfigError ? <ConfigWarning message={supabaseConfigError} /> : null}

          <AuthError message={formError} />

          <AuthField
            label="Full name"
            icon={UserRound}
            value={fullName}
            onChangeText={(v) => {
              setFullName(v);
              clearError('fullName');
            }}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            error={errors.fullName}
          />

          <AuthField
            label="Email"
            icon={Mail}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              clearError('email');
            }}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            error={errors.email}
          />

          <AuthField
            label="Phone (optional)"
            icon={Phone}
            value={phone}
            onChangeText={(v) => {
              setPhone(v);
              clearError('phone');
            }}
            placeholder="+91 98765 43210"
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            error={errors.phone}
          />

          <PasswordField
            label="Password"
            value={password}
            onChangeText={(v) => {
              setPassword(v);
              clearError('password');
            }}
            placeholder="At least 8 characters"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.password}
          />

          {password ? <PasswordStrength score={strength.score} hint={strength.hint} /> : null}

          <PasswordField
            label="Confirm password"
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              clearError('confirmPassword');
            }}
            placeholder="Re-enter your password"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            error={errors.confirmPassword}
          />

          {/* Not disabled when Supabase is missing: the form still validates and
              then reports the configuration problem, instead of a dead button. */}
          <AuthButton
            label="Create account"
            icon={UserPlus}
            onPress={handleSubmit}
            busy={busy}
          />

          <View style={styles.footerRow}>
            <Text style={[styles.footerText, { color: colors.muted }]}>Already registered? </Text>
            <AuthLink onPress={() => router.replace('/auth/login')}>Sign in</AuthLink>
          </View>
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  footerText: { fontSize: 13, fontWeight: '600' },
});
