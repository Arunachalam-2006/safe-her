import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as LinkingExpo from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MailCheck, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { consumeAuthDeepLink, describeAuthError, supabase } from '../../lib/supabase';
import {
  AuthButton,
  AuthCard,
  AuthError,
  AuthHero,
  AuthLink,
  AuthNotice,
} from '../../components/auth/AuthUI';

/**
 * Shown after sign-up when Supabase email confirmation is enabled.
 *
 * This screen never claims the address is verified. It only reports what the
 * app can actually observe: a session appearing means the link was opened and
 * verified; otherwise the user is still pending.
 */
export default function VerifyEmailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session, loading } = useAuth();
  const { email } = useLocalSearchParams();

  const [resent, setResent] = useState(false);
  const [resendError, setResendError] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState('');
  const inFlightRef = useRef(false);

  const address = email || session?.user?.email || 'your email address';

  // If the user opens the confirmation link while this screen is showing.
  useEffect(() => {
    let active = true;

    (async () => {
      const initial = await LinkingExpo.getInitialURL();
      if (initial && active) {
        const result = await consumeAuthDeepLink(initial);
        if (!result.ok && active) {
          setLinkError(
            result.error?.message || 'This confirmation link is invalid or has expired.'
          );
        }
      }
      if (active) {
        const sub = Linking.addEventListener('url', ({ url }) => {
          consumeAuthDeepLink(url);
        });
        if (!active) sub.remove();
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const handleResend = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setBusy(true);
    setResendError('');
    setResent(false);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: address });
      if (error) {
        setResendError(describeAuthError(error, 'We could not resend the email. Please try again.'));
        return;
      }
      setResent(true);
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [address]);

  const verified = Boolean(session) && !loading;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.paper }]}
      contentContainerStyle={styles.scroll}
    >
      <AuthHero
        title="Verify your email"
        subtitle="One quick step before you can sign in."
      />

      <AuthCard>
        {verified ? (
          <>
            <AuthNotice
              tone="success"
              message="Your email is confirmed and you are signed in. Taking you to Safe-Her…"
            />
            <AuthButton label="Continue" onPress={() => router.replace('/')} />
          </>
        ) : (
          <>
            <View style={styles.iconRow}>
              <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
                <MailCheck color={colors.primary} size={24} />
              </View>
            </View>

            <Text style={[styles.body, { color: colors.ink }]}>
              We sent a verification link to
            </Text>
            <Text style={[styles.email, { color: colors.primary }]}>{address}</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              Open the link on this device to confirm your address. You will be signed in
              automatically afterwards.
            </Text>

            <View style={styles.tips}>
              <Tip text="Check your spam or junk folder if it has not arrived." />
              <Tip text="The link can take a minute or two to arrive." />
              <Tip text="Make sure you used the same email you signed up with." />
            </View>

            <AuthError message={linkError || resendError} />

            {resent ? (
              <AuthNotice tone="success" message="Verification email sent again. Please check your inbox." />
            ) : null}

            <AuthButton
              label="Resend verification email"
              onPress={handleResend}
              busy={busy}
              style={styles.resend}
            />

            <View style={styles.footerRow}>
              <Text style={[styles.footerText, { color: colors.muted }]}>
                Already verified?{' '}
              </Text>
              <AuthLink onPress={() => router.replace('/auth/login')}>Go to sign in</AuthLink>
            </View>
          </>
        )}
      </AuthCard>
    </ScrollView>
  );
}

function Tip({ text }) {
  const { colors } = useTheme();
  return (
    <View style={styles.tip}>
      <ShieldCheck color={colors.teal} size={14} />
      <Text style={[styles.tipText, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, paddingBottom: 24 },
  iconRow: { alignItems: 'center', marginBottom: 12 },
  icon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', fontWeight: '600' },
  email: { fontSize: 15, fontWeight: '800', textAlign: 'center', marginVertical: 6 },
  tips: { marginTop: 16, gap: 8, marginBottom: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tipText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '600' },
  resend: { marginTop: 4 },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 18 },
  footerText: { fontSize: 13, fontWeight: '600' },
});
