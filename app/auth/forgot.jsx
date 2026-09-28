import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Mail, Send } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { supabase, describeAuthError, SUPABASE_REDIRECT_URL } from '../../lib/supabase';
import { validateEmail } from '../../lib/authValidation';
import {
  AuthButton,
  AuthCard,
  AuthError,
  AuthField,
  AuthHero,
  AuthLink,
  AuthNotice,
} from '../../components/auth/AuthUI';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlightRef = useRef(false);

  const handleSubmit = useCallback(async () => {
    if (inFlightRef.current) return;
    setError('');

    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    inFlightRef.current = true;
    setBusy(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: SUPABASE_REDIRECT_URL }
      );

      if (resetError) {
        setError(describeAuthError(resetError, 'We could not send the reset email. Please try again.'));
        return;
      }

      // Supabase deliberately does not reveal whether an address exists, so we
      // show the same confirmation either way. That is correct behaviour, not
      // a way of hiding a failure.
      setSent(true);
    } catch (err) {
      setError('Cannot reach the server. Check your connection and try again.');
      if (__DEV__) console.warn('[auth] reset request failed:', err?.message);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [email]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.paper }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <AuthHero
          title="Reset your password"
          subtitle="Enter your email and we will send you a link to choose a new password."
        />

        <AuthCard>
          {sent ? (
            <>
              <AuthNotice
                tone="success"
                message={`If an account exists for ${email.trim()}, a reset link is on its way. Check your inbox and spam folder.`}
              />
              <AuthButton label="Back to sign in" onPress={() => router.replace('/auth/login')} />
            </>
          ) : (
            <>
              <AuthError message={error} />

              <AuthField
                label="Email"
                icon={Mail}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                autoComplete="email"
                textContentType="emailAddress"
              />

              <AuthButton label="Send reset link" icon={Send} onPress={handleSubmit} busy={busy} />

              <View style={styles.footerRow}>
                <AuthLink onPress={() => router.replace('/auth/login')}>Back to sign in</AuthLink>
              </View>
            </>
          )}

          <View style={styles.help}>
            <Text style={[styles.helpText, { color: colors.muted }]}>
              The link opens Safe-Her and takes you to a screen where you can set a new password.
            </Text>
          </View>
        </AuthCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  footerRow: { alignItems: 'center', marginTop: 18 },
  help: { marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'transparent' },
  helpText: { fontSize: 11.5, lineHeight: 17, textAlign: 'center' },
});
