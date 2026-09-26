import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  AlertCircle,
  ArrowRight,
  Check,
  Phone,
  Plus,
  UserRound,
  UsersRound,
} from 'lucide-react-native';
import { useAuth } from '../lib/auth';
import { useOnboarding } from '../lib/onboarding';
import { useSOS } from '../lib/sos';
import { useTheme } from '../lib/theme';
import {
  addEmergencyContact,
  getEmergencyContacts,
  RELATIONSHIPS,
  validateEmergencyContact,
} from '../lib/emergencyContacts';
import {
  ContactsArt,
  LocationArt,
  ReadyArt,
  ScoreArt,
  SosArt,
  WelcomeArt,
} from '../components/onboarding/OnboardingArt';
import {
  GhostButton,
  OnboardingTopBar,
  PrimaryButton,
  ProgressDots,
} from '../components/onboarding/OnboardingUI';

const STEPS = [
  {
    key: 'welcome',
    title: 'Welcome to Safe-Her',
    body: 'A simple safety companion to help you stay aware and connected wherever your journey takes you.',
    primaryLabel: 'Get Started',
    art: <WelcomeArt />,
    showTopBarSkip: true,
  },
  {
    key: 'score',
    title: 'Check Your Journey',
    body: 'See a safety score for your route and understand the conditions around your journey before you leave.',
    primaryLabel: 'Next',
    art: <ScoreArt />,
    showTopBarSkip: true,
  },
  {
    key: 'location',
    title: "Know What's Around You",
    body: 'Use your location to explore your route and view useful safety information around you.',
    primaryLabel: 'Next',
    art: <LocationArt />,
    showTopBarSkip: true,
  },
  {
    key: 'sos',
    title: 'Help When You Need It',
    body: 'Use SOS to quickly access your emergency options when you feel unsafe.',
    primaryLabel: 'Next',
    art: <SosArt />,
    showTopBarSkip: true,
  },
  {
    key: 'contacts',
    title: 'Add People You Trust',
    body: 'Add emergency contacts so you can reach the people you trust quickly when needed.',
    art: <ContactsArt />,
  },
  {
    key: 'ready',
    title: "You're Ready",
    body: 'Explore your route, stay aware, and keep your trusted contacts close.',
    primaryLabel: 'Start Using Safe-Her',
    art: <ReadyArt />,
  },
];

const LAST_INDEX = STEPS.length - 1;
const SLIDE_DISTANCE = 44;

export default function OnboardingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session, profile } = useAuth();
  const { markComplete } = useOnboarding();
  const { refreshContactCount } = useSOS();

  const [index, setIndex] = useState(0);
  const [contacts, setContacts] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', relationship: 'Parent' });
  const [formErrors, setFormErrors] = useState({});
  const [savingContact, setSavingContact] = useState(false);

  const fade = useRef(new Animated.Value(1)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(0);
  const animatingRef = useRef(false);
  const finishingRef = useRef(false);

  const step = STEPS[index];
  const isFirst = index === 0;
  const isLast = index === LAST_INDEX;
  const isContactsStep = step.key === 'contacts';

  const loadContacts = useCallback(async () => {
    const list = await getEmergencyContacts();
    setContacts(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  /** Smooth horizontal slide + fade between steps. */
  const goTo = useCallback(
    (target) => {
      if (animatingRef.current || finishingRef.current) return;
      const from = indexRef.current;
      if (target === from || target < 0 || target > LAST_INDEX) return;

      const direction = target > from ? 1 : -1;
      animatingRef.current = true;

      Animated.parallel([
        Animated.timing(fade, {
          toValue: 0,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(slide, {
          toValue: -SLIDE_DISTANCE * direction,
          duration: 170,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        indexRef.current = target;
        setIndex(target);
        setNotice('');

        slide.setValue(SLIDE_DISTANCE * direction);
        Animated.parallel([
          Animated.timing(fade, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(slide, {
            toValue: 0,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ]).start(() => {
          animatingRef.current = false;
        });
      });
    },
    [fade, slide]
  );

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);

    try {
      await markComplete();
    } finally {
      // Respect the existing auth + role routing.
      if (session && profile?.account_type === 'government') {
        router.replace('/gov');
      } else if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/auth');
      }
    }
  }, [markComplete, session, profile, router]);

  // Android hardware back walks the flow instead of leaving the app mid-onboarding.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (indexRef.current > 0) {
        goTo(indexRef.current - 1);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [goTo]);

  function handlePrimary() {
    if (isLast) {
      finish();
      return;
    }
    goTo(index + 1);
  }

  /**
   * Writes through lib/emergencyContacts.js — the same store, validation and
   * SOS wiring the in-app contacts screen uses. No duplicate implementation.
   */
  async function handleSaveContact() {
    const check = validateEmergencyContact(form);
    setFormErrors(check.errors || {});
    if (!check.valid) return;

    setSavingContact(true);
    const result = await addEmergencyContact(form);
    setSavingContact(false);

    if (!result.ok) {
      setFormErrors(result.errors || {});
      return;
    }

    setForm({ name: '', phone: '', relationship: 'Parent' });
    setFormErrors({});
    setFormOpen(false);
    setNotice(`${result.contact.name} added to your emergency contacts.`);
    await loadContacts();
    if (refreshContactCount) await refreshContactCount();
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.paper }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <OnboardingTopBar
          onBack={isFirst ? null : () => goTo(index - 1)}
          onSkip={step.showTopBarSkip ? finish : null}
        />

        <ProgressDots total={STEPS.length} index={index} />

        <Animated.View style={[styles.flex, { opacity: fade, transform: [{ translateX: slide }] }]}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.artSlot}>
              {isContactsStep ? <ContactsArt contacts={contacts} /> : step.art}
            </View>

            <View style={styles.copy}>
              <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
                {step.title}
              </Text>
              <Text style={[styles.body, { color: colors.muted }]}>{step.body}</Text>
            </View>

            {isContactsStep && formOpen ? (
              <ContactFormCard
                form={form}
                setForm={setForm}
                errors={formErrors}
                disabled={savingContact}
              />
            ) : null}

            {notice ? (
              <View style={[styles.notice, { backgroundColor: colors.tealSoft }]}>
                <Check color={colors.teal} size={15} />
                <Text style={[styles.noticeText, { color: colors.ink }]}>{notice}</Text>
              </View>
            ) : null}
          </ScrollView>
        </Animated.View>

        <View style={styles.footer}>
          {isContactsStep ? (
            <>
              <PrimaryButton
                label={formOpen ? 'Save Contact' : 'Add Emergency Contact'}
                icon={formOpen ? Check : Plus}
                onPress={formOpen ? handleSaveContact : () => setFormOpen(true)}
              />
              <View style={styles.footerGap} />
              <GhostButton
                label={formOpen ? 'Cancel' : 'Skip for Now'}
                onPress={formOpen ? () => setFormOpen(false) : () => goTo(index + 1)}
              />
            </>
          ) : (
            <PrimaryButton
              label={step.primaryLabel}
              icon={isLast ? Check : ArrowRight}
              onPress={handlePrimary}
              disabled={finishing}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Compact add form. Deliberately thin: validation, storage and SOS wiring all
 * live in lib/emergencyContacts.js, so nothing is duplicated here.
 */
function ContactFormCard({ form, setForm, errors, disabled }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.formCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
      <View style={styles.formHeader}>
        <View style={[styles.formHeaderIcon, { backgroundColor: colors.pinkSoft }]}>
          <UsersRound color={colors.pink} size={16} />
        </View>
        <Text style={[styles.formHeaderText, { color: colors.ink }]}>New emergency contact</Text>
      </View>

      <Field
        icon={UserRound}
        iconColor={errors.name ? colors.pink : colors.muted}
        placeholder="Full name"
        value={form.name}
        onChangeText={(name) => setForm((f) => ({ ...f, name }))}
        invalid={!!errors.name}
        editable={!disabled}
      />
      {errors.name ? <FieldError message={errors.name} /> : null}

      <Field
        icon={Phone}
        iconColor={errors.phone ? colors.pink : colors.muted}
        placeholder="Phone number"
        value={form.phone}
        onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
        invalid={!!errors.phone}
        keyboardType="phone-pad"
        editable={!disabled}
      />
      {errors.phone ? <FieldError message={errors.phone} /> : null}

      <Text style={[styles.fieldLabel, { color: colors.muted }]}>RELATIONSHIP</Text>
      <View style={styles.relWrap}>
        {RELATIONSHIPS.map((relationship) => {
          const active = form.relationship === relationship;
          return (
            <Pressable
              key={relationship}
              onPress={() => setForm((f) => ({ ...f, relationship }))}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={({ pressed }) => [
                styles.relChip,
                {
                  backgroundColor: active ? colors.primary : colors.paper,
                  borderColor: active ? colors.primary : colors.line,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.relChipText, { color: active ? '#FFFFFF' : colors.ink }]}>
                {relationship}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.formNote, { color: colors.muted }]}>
        Saved on this device. You can edit or remove contacts any time from Profile.
      </Text>
    </View>
  );
}

function Field({ icon: Icon, iconColor, invalid, ...props }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.inputWrap,
        { borderColor: invalid ? colors.pink : colors.line, backgroundColor: colors.paper },
      ]}
    >
      <Icon color={iconColor} size={16} />
      <TextInput
        placeholderTextColor={colors.muted}
        {...props}
        style={[styles.input, { color: colors.ink }]}
        accessibilityLabel={props.placeholder}
      />
    </View>
  );
}

function FieldError({ message }) {
  const { colors } = useTheme();

  return (
    <View style={styles.errorRow}>
      <AlertCircle color={colors.pink} size={13} />
      <Text style={[styles.errorText, { color: colors.pink }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 20 },
  artSlot: { width: '100%' },
  copy: { marginTop: 26, marginBottom: 4 },
  title: { fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.6 },
  body: { fontSize: 15, lineHeight: 23, fontWeight: '500', marginTop: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 14 },
  footerGap: { height: 10 },
  pressed: { opacity: 0.7 },

  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  noticeText: { flex: 1, fontSize: 12.5, fontWeight: '700' },

  formCard: { marginTop: 18, borderRadius: 22, borderWidth: 1, padding: 16 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  formHeaderIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formHeaderText: { fontSize: 14.5, fontWeight: '800' },
  fieldLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 6, marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    ...Platform.select({ web: { outlineStyle: 'none' }, default: {} }),
  },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4, marginBottom: 10 },
  errorText: { fontSize: 11.5, fontWeight: '700' },
  relWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  relChipText: { fontSize: 12, fontWeight: '700' },
  formNote: { fontSize: 11, lineHeight: 16, fontWeight: '600', marginTop: 14 },
});
