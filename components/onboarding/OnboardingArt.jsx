import { StyleSheet, Text, View } from 'react-native';
import {
  Check,
  CloudSun,
  Hospital,
  Landmark,
  Lightbulb,
  MapPin,
  MapPinned,
  Navigation,
  Plus,
  Radio,
  Route,
  ShieldCheck,
  Siren,
  UsersRound,
} from 'lucide-react-native';
import { Pill } from '../ui';
import { useTheme } from '../../lib/theme';
import { FinePrint } from './OnboardingUI';

/**
 * Lightweight vector-style illustrations built from Views + Lucide icons.
 * They mirror the app's own map / safety-card language so onboarding feels
 * like the product rather than a separate marketing surface.
 */

const GRID_STOPS = [14, 30, 46, 62, 78, 92];

function ArtFrame({ children, height = 264, style }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.frame,
        { height, backgroundColor: colors.primarySoft, borderColor: colors.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Faint street-grid backdrop so illustrations read as "map". */
function MapGrid({ opacity = 0.09 }) {
  const { colors } = useTheme();

  return (
    <View style={styles.gridLayer}>
      {GRID_STOPS.map((stop) => (
        <View
          key={`row-${stop}`}
          style={[styles.gridRow, { top: `${stop}%`, backgroundColor: colors.primary, opacity }]}
        />
      ))}
      {GRID_STOPS.map((stop) => (
        <View
          key={`col-${stop}`}
          style={[styles.gridCol, { left: `${stop}%`, backgroundColor: colors.primary, opacity }]}
        />
      ))}
    </View>
  );
}

/* ── Welcome ─────────────────────────────────────────────────────────── */

export function WelcomeArt() {
  const { colors } = useTheme();

  return (
    <ArtFrame height={300}>
      <MapGrid />

      <View style={styles.heroTop}>
        <View style={[styles.floatCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <View style={[styles.floatIcon, { backgroundColor: colors.tealSoft }]}>
            <ShieldCheck color={colors.teal} size={17} />
          </View>
          <View>
            <Text style={[styles.floatLabel, { color: colors.muted }]}>Route conditions</Text>
            <Text style={[styles.floatValue, { color: colors.ink }]}>Well lit</Text>
          </View>
        </View>
      </View>

      <View style={styles.heroCenter}>
        <View style={[styles.ring, styles.ringLarge, { backgroundColor: colors.primary + '1A' }]} />
        <View style={[styles.ring, styles.ringSmall, { backgroundColor: colors.primary + '33' }]} />
        <View style={[styles.pinBubble, { backgroundColor: colors.primary }]}>
          <MapPin color="#FFFFFF" size={26} />
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={[styles.routeNode, { backgroundColor: colors.primary }]} />
        <View style={[styles.routeBar, { backgroundColor: colors.primary + '55' }]} />
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={i} style={[styles.routeDash, { backgroundColor: colors.primary }]} />
        ))}
        <Navigation color={colors.primary} size={20} />
      </View>

      <View style={styles.heroBottom}>
        <View style={[styles.floatCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <View style={[styles.floatIcon, { backgroundColor: colors.primarySoft }]}>
            <UsersRound color={colors.primary} size={17} />
          </View>
          <View>
            <Text style={[styles.floatLabel, { color: colors.muted }]}>Trusted contact</Text>
            <Text style={[styles.floatValue, { color: colors.ink }]}>Ready to reach</Text>
          </View>
        </View>
      </View>
    </ArtFrame>
  );
}

/* ── Safety score ────────────────────────────────────────────────────── */

export function ScoreArt() {
  const { colors } = useTheme();

  return (
    <View>
      <ArtFrame style={styles.framePadded}>
        <View style={[styles.mockCard, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <View style={styles.mockHeader}>
            <Text style={[styles.eyebrow, { color: colors.muted }]}>JOURNEY SAFETY SCORE</Text>
            <ShieldCheck color={colors.teal} size={20} />
          </View>

          <View style={styles.scoreRow}>
            <Text style={[styles.scoreValue, { color: colors.ink }]}>86</Text>
            <Text style={[styles.scoreOut, { color: colors.muted }]}>/ 100</Text>
            <View style={styles.spacer} />
            <Pill tone="teal">Good conditions</Pill>
          </View>

          <View style={[styles.miniMap, { backgroundColor: colors.paper, borderColor: colors.line }]}>
            <MapGrid opacity={0.07} />
            <View style={styles.miniRoute}>
              <View style={[styles.miniNode, { backgroundColor: colors.primary }]} />
              <View style={[styles.miniBar, { backgroundColor: colors.primary }]} />
              <View style={[styles.miniFlag, { backgroundColor: colors.teal }]}>
                <Navigation color="#FFFFFF" size={12} />
              </View>
            </View>
            <View style={styles.miniLabels}>
              <Text style={[styles.miniLabel, { color: colors.muted }]}>Start</Text>
              <Text style={[styles.miniLabel, { color: colors.muted }]}>4.2 km · about 12 min</Text>
              <Text style={[styles.miniLabel, { color: colors.muted }]}>You</Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            <MiniChip icon={Lightbulb} label="Lighting" value="92" color={colors.teal} />
            <MiniChip icon={Landmark} label="Police" value="1.2 km" color={colors.blue} />
            <MiniChip icon={CloudSun} label="Weather" value="Clear" color={colors.orange} />
          </View>
        </View>
      </ArtFrame>

      <FinePrint icon={ShieldCheck}>
        The score is an estimate built from available data — it is guidance, not a guarantee.
        Always stay alert and use your judgement.
      </FinePrint>
    </View>
  );
}

function MiniChip({ icon: Icon, label, value, color }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.miniChip, { backgroundColor: colors.paper }]}>
      <Icon color={color} size={13} />
      <View>
        <Text style={[styles.miniChipLabel, { color: colors.muted }]}>{label}</Text>
        <Text style={[styles.miniChipValue, { color: colors.ink }]}>{value}</Text>
      </View>
    </View>
  );
}

/* ── Location ────────────────────────────────────────────────────────── */

export function LocationArt() {
  const { colors } = useTheme();

  const nearby = [
    { icon: Landmark, label: 'Police station', value: '0.4 km', color: colors.blue },
    { icon: Lightbulb, label: 'Street lights', value: '12 nearby', color: colors.yellow },
    { icon: Hospital, label: 'Hospital', value: '1.2 km', color: colors.pink },
  ];

  return (
    <ArtFrame height={288}>
      <MapGrid />

      <View style={styles.locateWrap}>
        <View style={[styles.ring, styles.ringMedium, { backgroundColor: colors.primary + '1A' }]} />
        <View style={[styles.ring, styles.ringMediumSmall, { backgroundColor: colors.primary + '33' }]} />
        <View style={[styles.pinBubbleSmall, { backgroundColor: colors.primary }]}>
          <MapPin color="#FFFFFF" size={23} />
        </View>
      </View>

      <View style={[styles.nearPanel, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
        <Text style={[styles.panelLabel, { color: colors.muted }]}>NEARBY</Text>
        {nearby.map((item) => (
          <View key={item.label} style={styles.nearRow}>
            <View style={[styles.nearIcon, { backgroundColor: item.color + '1C' }]}>
              <item.icon color={item.color} size={14} />
            </View>
            <Text style={[styles.nearLabel, { color: colors.ink }]}>{item.label}</Text>
            <Text style={[styles.nearValue, { color: colors.muted }]}>{item.value}</Text>
          </View>
        ))}
      </View>
    </ArtFrame>
  );
}

/* ── SOS ─────────────────────────────────────────────────────────────── */

export function SosArt() {
  const { colors } = useTheme();

  return (
    <View>
      <ArtFrame height={288}>
        <View style={styles.sosWrap}>
          <View style={[styles.ring, styles.ringMedium, { backgroundColor: colors.sosBg + '1A' }]} />
          <View style={[styles.ring, styles.ringMediumSmall, { backgroundColor: colors.sosBg + '33' }]} />
          <View style={[styles.sosButton, { backgroundColor: colors.sosBg }]}>
            <Siren color="#FFFFFF" size={21} />
            <Text style={styles.sosLabel}>SOS</Text>
          </View>
        </View>

        <View style={[styles.nearPanel, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <View style={styles.nearRow}>
            <View style={[styles.nearIcon, { backgroundColor: colors.primarySoft }]}>
              <UsersRound color={colors.primary} size={14} />
            </View>
            <View style={styles.spacer}>
              <Text style={[styles.nearLabel, { color: colors.ink }]}>Emergency contacts</Text>
              <Text style={[styles.nearSub, { color: colors.muted }]}>Reached from one place</Text>
            </View>
          </View>
          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <View style={styles.nearRow}>
            <View style={[styles.nearIcon, { backgroundColor: colors.blue + '1C' }]}>
              <Radio color={colors.blue} size={14} />
            </View>
            <View style={styles.spacer}>
              <Text style={[styles.nearLabel, { color: colors.ink }]}>Location sharing</Text>
              <Text style={[styles.nearSub, { color: colors.muted }]}>You decide what to send</Text>
            </View>
          </View>
        </View>
      </ArtFrame>

      <FinePrint icon={ShieldCheck}>
        Safe-Her prepares the alert for you. Nothing is sent until you review it and choose to share.
      </FinePrint>
    </View>
  );
}

/* ── Emergency contacts ──────────────────────────────────────────────── */

export function ContactsArt({ contacts = [] }) {
  const { colors } = useTheme();

  if (contacts.length === 0) {
    return (
      <ArtFrame height={252}>
        <MapGrid />
        <View style={styles.emptyWrap}>
          <View style={[styles.dashedCircle, { borderColor: colors.primary }]}>
            <View style={[styles.dashedInner, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
              <Plus color={colors.primary} size={24} />
            </View>
          </View>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>No trusted contacts yet</Text>
          <Text style={[styles.emptySub, { color: colors.muted }]}>
            Add someone you can reach quickly when you need help.
          </Text>
        </View>
      </ArtFrame>
    );
  }

  return (
    <ArtFrame height={Math.min(300, 168 + contacts.length * 58)}>
      <MapGrid />
      <View style={styles.emptyWrap}>
        <View style={[styles.nearPanel, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
          <Text style={[styles.panelLabel, { color: colors.muted }]}>YOUR TRUSTED CONTACTS</Text>
          {contacts.map((contact, index) => (
            <View key={contact.id || index}>
              {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
              <View style={styles.nearRow}>
                <View style={[styles.nearIcon, { backgroundColor: colors.primarySoft }]}>
                  <UsersRound color={colors.primary} size={14} />
                </View>
                <View style={styles.spacer}>
                  <Text style={[styles.nearLabel, { color: colors.ink }]} numberOfLines={1}>
                    {contact.name}
                  </Text>
                  <Text style={[styles.nearSub, { color: colors.muted }]} numberOfLines={1}>
                    {contact.relationship}
                  </Text>
                </View>
                <View style={[styles.savedTag, { backgroundColor: colors.tealSoft }]}>
                  <Text style={[styles.savedTagText, { color: colors.teal }]}>Saved</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </View>
    </ArtFrame>
  );
}

/* ── Ready ───────────────────────────────────────────────────────────── */

export function ReadyArt() {
  const { colors } = useTheme();

  const items = [
    { icon: Route, label: 'Safety score for your route', color: colors.teal },
    { icon: MapPinned, label: 'Safety places around you', color: colors.blue },
    { icon: Siren, label: 'SOS when you need it', color: colors.pink },
    { icon: UsersRound, label: 'People you trust', color: colors.primary },
  ];

  return (
    <ArtFrame height={288}>
      <View style={styles.readyTop}>
        <View style={[styles.readyRing, { backgroundColor: colors.tealSoft }]}>
          <View style={[styles.readyInner, { backgroundColor: colors.teal }]}>
            <Check color="#FFFFFF" size={28} />
          </View>
        </View>
      </View>

      <View style={[styles.nearPanel, { backgroundColor: colors.cardBg, borderColor: colors.line }]}>
        {items.map((item, index) => (
          <View key={item.label}>
            {index > 0 ? <View style={[styles.divider, { backgroundColor: colors.line }]} /> : null}
            <View style={styles.nearRow}>
              <View style={[styles.nearIcon, { backgroundColor: item.color + '1C' }]}>
                <item.icon color={item.color} size={14} />
              </View>
              <Text style={[styles.nearLabel, styles.spacer, { color: colors.ink }]}>{item.label}</Text>
              <Check color={colors.teal} size={15} />
            </View>
          </View>
        ))}
      </View>
    </ArtFrame>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: 'hidden',
    justifyContent: 'space-between',
    paddingVertical: 18,
  },
  framePadded: { padding: 14, justifyContent: 'center' },
  gridRow: { position: 'absolute', left: 0, right: 0, height: 1 },
  gridCol: { position: 'absolute', top: 0, bottom: 0, width: 1 },
  gridLayer: { ...StyleSheet.absoluteFillObject, pointerEvents: 'none' },
  spacer: { flex: 1 },

  // Welcome
  heroTop: { flexDirection: 'row', paddingHorizontal: 16 },
  heroCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroBottom: { flexDirection: 'row', paddingHorizontal: 16, alignItems: 'flex-end' },
  floatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  floatIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  floatLabel: { fontSize: 11, fontWeight: '600' },
  floatValue: { fontSize: 13, fontWeight: '800', marginTop: 1 },
  ring: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  ringLarge: { width: 128, height: 128, borderRadius: 64 },
  ringSmall: { width: 88, height: 88, borderRadius: 44 },
  ringMedium: { width: 100, height: 100, borderRadius: 50 },
  ringMediumSmall: { width: 68, height: 68, borderRadius: 34 },
  pinBubble: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBubbleSmall: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 26,
  },
  routeNode: { width: 10, height: 10, borderRadius: 5 },
  routeBar: { width: 34, height: 5, borderRadius: 3 },
  routeDash: { width: 4, height: 5, borderRadius: 2 },

  // Score mockup
  mockCard: { borderRadius: 20, borderWidth: 1, padding: 16, gap: 12 },
  mockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  scoreValue: { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, lineHeight: 44 },
  scoreOut: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  miniMap: { height: 74, borderRadius: 14, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 14 },
  miniRoute: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  miniNode: { width: 9, height: 9, borderRadius: 5 },
  miniBar: { flex: 1, height: 4, borderRadius: 2 },
  miniFlag: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  miniLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  miniLabel: { fontSize: 10, fontWeight: '700' },
  chipRow: { flexDirection: 'row', gap: 7 },
  miniChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  miniChipLabel: { fontSize: 9.5, fontWeight: '600' },
  miniChipValue: { fontSize: 12, fontWeight: '800', marginTop: 1 },

  // Location / SOS / Ready panels
  locateWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sosWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sosButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    elevation: 4,
  },
  sosLabel: { color: '#FFFFFF', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },
  nearPanel: {
    marginHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  panelLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 1, marginBottom: 2 },
  nearRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  nearIcon: { width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  nearLabel: { fontSize: 13, fontWeight: '700' },
  nearSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  nearValue: { fontSize: 11.5, fontWeight: '700' },
  divider: { height: 1, opacity: 0.8 },
  savedTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  savedTagText: { fontSize: 10, fontWeight: '800' },

  // Contacts
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 4 },
  dashedCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 2,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  dashedInner: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 12, lineHeight: 18, fontWeight: '600', textAlign: 'center' },

  // Ready
  readyTop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  readyRing: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  readyInner: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
});
