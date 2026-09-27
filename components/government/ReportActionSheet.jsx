import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AlertTriangle, Camera, Check, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../lib/theme';
import { useAuth } from '../../lib/auth';
import { closeReport, submitOfficerAction, updateReportStatus } from '../../lib/government/govApi';
import {
  PrimaryButton,
  SecondaryButton,
  STATUS_LABEL,
  STATUS_TRANSITIONS,
} from './GovUI';

/**
 * Officer action sheet for a report.
 *
 * Covers the full workflow in one surface so actions are never buried in deep
 * navigation:
 *   - Update status  (Stage 6)
 *   - Take action / assign  (Stage 9)
 *   - Resolve / Close with confirmation  (Stage 10)
 *
 * Invalid transitions are never offered: the selectable list comes from
 * `STATUS_TRANSITIONS` for the report's current status.
 */
export default function ReportActionSheet({ visible, report, onClose, onCompleted }) {
  const { colors } = useTheme();
  const { profile } = useAuth();

  const [mode, setMode] = useState('menu');
  const [statusTarget, setStatusTarget] = useState(null);
  const [actionType, setActionType] = useState('PATROL');
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setMode('menu');
    setStatusTarget(null);
    setActionType('PATROL');
    setAssignee('');
    setNotes('');
    setEvidence([]);
    setError('');
  };

  function close() {
    reset();
    onClose();
  }

  async function addPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setEvidence((prev) => [...prev, result.assets[0].uri]);
      }
    } catch {
      /* ignore */
    }
  }

  async function run(fn) {
    setBusy(true);
    setError('');
    try {
      const result = await fn();
      if (result && result.offline === false) {
        reset();
        onCompleted?.(result);
        onClose();
      } else {
        setError('The response server could not be reached. Your action was not saved.');
      }
    } catch (err) {
      setError(err?.message || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  const officer = {
    officer: profile?.full_name || 'Officer',
    department: profile?.agency || 'SafeHer Response Desk',
  };

  const submitStatus = () =>
    run(() => updateReportStatus(report.id, statusTarget, notes));

  const submitAction = () =>
    run(() =>
      submitOfficerAction(report.id, {
        type: 'ACTION',
        action_type: actionType,
        assigned_to: assignee.trim() || null,
        notes: notes.trim(),
        has_evidence: evidence.length > 0,
        ...officer,
      })
    );

  const submitClose = () =>
    run(() =>
      submitOfficerAction(report.id, {
        type: 'CLOSE',
        to_status: 'CLOSED',
        notes: notes.trim(),
        resolution_notes: notes.trim(),
        ...officer,
      })
    );

  const transitions = STATUS_TRANSITIONS[report?.status] || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          style={styles.sheetWrap}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, { backgroundColor: colors.cardBg }]}>
            <View style={[styles.header, { borderBottomColor: colors.line }]}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.ink }]}>
                  {mode === 'status'
                    ? 'Update Status'
                    : mode === 'action'
                      ? 'Take Action'
                      : mode === 'resolve'
                        ? 'Resolve Report'
                        : mode === 'close'
                          ? 'Close Report'
                          : 'Report Actions'}
                </Text>
                <Text style={[styles.subtitle, { color: colors.muted }]}>
                  {report?.id} · currently {STATUS_LABEL[report?.status] || report?.status}
                </Text>
              </View>
              <Pressable
                onPress={close}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close"
                style={[styles.closeBtn, { backgroundColor: colors.paper }]}
              >
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {error ? (
                <View style={[styles.error, { backgroundColor: colors.pinkSoft }]}>
                  <AlertTriangle color={colors.pink} size={14} />
                  <Text style={[styles.errorText, { color: colors.pink }]}>{error}</Text>
                </View>
              ) : null}

              {/* ── MENU ── */}
              {mode === 'menu' ? (
                <View style={styles.menu}>
                  {report?.status === 'NEW' ? (
                    <MenuRow
                      label="Start review"
                      hint="Mark this report as Under Review"
                      onPress={() => setMode('status')}
                    />
                  ) : null}

                  {transitions
                    .filter((s) => s !== 'CLOSED' && s !== 'RESOLVED')
                    .map((s) => (
                      <MenuRow
                        key={s}
                        label={`Set status: ${STATUS_LABEL[s]}`}
                        hint="Record a workflow status change"
                        onPress={() => {
                          setStatusTarget(s);
                          setMode('status');
                        }}
                      />
                    ))}

                  <MenuRow
                    label="Take action"
                    hint="Log patrol, response or advisory action"
                    onPress={() => setMode('action')}
                  />

                  {transitions.includes('RESOLVED') && report?.status !== 'RESOLVED' ? (
                    <MenuRow
                      label="Resolve report"
                      hint="Mark the matter as resolved"
                      onPress={() => setMode('resolve')}
                    />
                  ) : null}

                  {transitions.includes('CLOSED') ? (
                    <MenuRow
                      label="Close report"
                      hint="Permanently close this case"
                      destructive
                      onPress={() => setMode('close')}
                    />
                  ) : null}

                  {transitions.length === 0 ? (
                    <Text style={[styles.locked, { color: colors.muted }]}>
                      This report is closed. No further workflow actions are available.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* ── STATUS ── */}
              {mode === 'status' ? (
                <View style={styles.form}>
                  <Text style={[styles.label, { color: colors.muted }]}>NEW STATUS</Text>
                  <View style={styles.chipRow}>
                    {(statusTarget ? [statusTarget] : transitions).map((s) => (
                      <Pressable
                        key={s}
                        onPress={() => setStatusTarget(s)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: statusTarget === s }}
                        style={({ pressed }) => [
                          styles.chip,
                          {
                            backgroundColor: statusTarget === s ? colors.primary : colors.paper,
                            borderColor: statusTarget === s ? colors.primary : colors.line,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: statusTarget === s ? '#FFFFFF' : colors.ink },
                          ]}
                        >
                          {STATUS_LABEL[s]}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    OFFICER NOTE
                  </Text>
                  <NotesInput value={notes} onChange={setNotes} placeholder="Optional note for the record" />

                  <PrimaryButton
                    label="Save status"
                    icon={Check}
                    busy={busy}
                    disabled={!statusTarget}
                    onPress={submitStatus}
                    style={styles.actionBtn}
                  />
                  <SecondaryButton label="Back" onPress={() => setMode('menu')} style={styles.actionBtn} />
                </View>
              ) : null}

              {/* ── TAKE ACTION ── */}
              {mode === 'action' ? (
                <View style={styles.form}>
                  <Text style={[styles.label, { color: colors.muted }]}>ACTION TYPE</Text>
                  <View style={styles.chipRow}>
                    {['PATROL', 'INSPECTION', 'CCTV_CHECK', 'ADVISORY', 'ESCORT'].map((t) => (
                      <Pressable
                        key={t}
                        onPress={() => setActionType(t)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: actionType === t }}
                        style={({ pressed }) => [
                          styles.chip,
                          {
                            backgroundColor: actionType === t ? colors.primary : colors.paper,
                            borderColor: actionType === t ? colors.primary : colors.line,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            { color: actionType === t ? '#FFFFFF' : colors.ink },
                          ]}
                        >
                          {t.replace('_', ' ')}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    ASSIGNED OFFICER / TEAM
                  </Text>
                  <TextInput
                    value={assignee}
                    onChangeText={setAssignee}
                    placeholder="e.g. Station 4 patrol"
                    placeholderTextColor={colors.muted}
                    accessibilityLabel="Assigned officer or team"
                    style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
                  />

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    ACTION NOTES
                  </Text>
                  <NotesInput
                    value={notes}
                    onChange={setNotes}
                    placeholder="What was done? (required)"
                    multiline
                  />

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    EVIDENCE
                  </Text>
                  <View style={styles.evidenceRow}>
                    <Pressable
                      onPress={addPhoto}
                      accessibilityRole="button"
                      accessibilityLabel="Attach photo"
                      style={({ pressed }) => [
                        styles.addPhoto,
                        { borderColor: colors.line, backgroundColor: colors.paper },
                        pressed && styles.pressed,
                      ]}
                    >
                      <Camera color={colors.primary} size={17} />
                      <Text style={[styles.addPhotoText, { color: colors.primary }]}>Add</Text>
                    </Pressable>
                    {evidence.map((uri, i) => (
                      <View key={`${uri}-${i}`} style={[styles.thumb, { borderColor: colors.line }]}>
                        <Image source={{ uri }} style={styles.thumbImage} />
                      </View>
                    ))}
                  </View>

                  <PrimaryButton
                    label="Submit action"
                    icon={Check}
                    busy={busy}
                    disabled={!notes.trim()}
                    onPress={submitAction}
                    style={styles.actionBtn}
                  />
                  <SecondaryButton label="Back" onPress={() => setMode('menu')} style={styles.actionBtn} />
                </View>
              ) : null}

              {/* ── RESOLVE ── */}
              {mode === 'resolve' ? (
                <View style={styles.form}>
                  <Text style={[styles.label, { color: colors.muted }]}>RESOLUTION NOTES</Text>
                  <NotesInput
                    value={notes}
                    onChange={setNotes}
                    placeholder="How was this resolved? (required)"
                    multiline
                  />
                  <PrimaryButton
                    label="Mark as Resolved"
                    icon={Check}
                    tone={colors.teal}
                    busy={busy}
                    disabled={!notes.trim()}
                    onPress={() =>
                      run(() =>
                        submitOfficerAction(report.id, {
                          type: 'RESOLVE',
                          to_status: 'RESOLVED',
                          notes: notes.trim(),
                          resolution_notes: notes.trim(),
                          ...officer,
                        })
                      )
                    }
                    style={styles.actionBtn}
                  />
                  <SecondaryButton label="Back" onPress={() => setMode('menu')} style={styles.actionBtn} />
                </View>
              ) : null}

              {/* ── CLOSE (deliberate confirmation) ── */}
              {mode === 'close' ? (
                <View style={styles.form}>
                  <View style={[styles.warn, { backgroundColor: colors.pinkSoft, borderColor: colors.pink }]}>
                    <AlertTriangle color={colors.pink} size={16} />
                    <Text style={[styles.warnText, { color: colors.ink }]}>
                      Closing is permanent. The report moves to Closed and no further workflow
                      actions will be available.
                    </Text>
                  </View>

                  <Text style={[styles.label, { color: colors.muted }]}>REPORT ID</Text>
                  <Text style={[styles.mono, { color: colors.ink }]}>{report?.id}</Text>

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    CURRENT STATUS
                  </Text>
                  <Text style={[styles.mono, { color: colors.ink }]}>
                    {STATUS_LABEL[report?.status] || report?.status}
                  </Text>

                  <Text style={[styles.label, styles.labelSpaced, { color: colors.muted }]}>
                    CLOSURE NOTES
                  </Text>
                  <NotesInput
                    value={notes}
                    onChange={setNotes}
                    placeholder="Resolution summary (required)"
                    multiline
                  />

                  <PrimaryButton
                    label="Close Report"
                    icon={Check}
                    tone={colors.pink}
                    busy={busy}
                    disabled={!notes.trim()}
                    onPress={submitClose}
                    style={styles.actionBtn}
                  />
                  <SecondaryButton label="Back" onPress={() => setMode('menu')} style={styles.actionBtn} />
                </View>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function MenuRow({ label, hint, onPress, destructive }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.menuRow,
        { backgroundColor: colors.paper, borderColor: colors.line },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.flex}>
        <Text style={[styles.menuLabel, { color: destructive ? colors.pink : colors.ink }]}>
          {label}
        </Text>
        <Text style={[styles.menuHint, { color: colors.muted }]}>{hint}</Text>
      </View>
    </Pressable>
  );
}

function NotesInput({ value, onChange, placeholder, multiline }) {
  const { colors } = useTheme();

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      accessibilityLabel={placeholder}
      style={[
        styles.input,
        styles.notes,
        { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,12,35,0.55)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '92%' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerText: { flex: 1, paddingRight: 10 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  body: { padding: 16, paddingBottom: 28 },
  flex: { flex: 1 },
  pressed: { opacity: 0.75 },

  menu: { gap: 9 },
  menuRow: { borderRadius: 14, borderWidth: 1, padding: 14, minHeight: 56, justifyContent: 'center' },
  menuLabel: { fontSize: 14, fontWeight: '800' },
  menuHint: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  locked: { fontSize: 12.5, fontWeight: '600', textAlign: 'center', paddingVertical: 16 },

  form: { gap: 0 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  labelSpaced: { marginTop: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5 },
  chipText: { fontSize: 12, fontWeight: '800' },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 13,
    height: 48,
    fontSize: 14,
    fontWeight: '600',
  },
  notes: { height: 92, paddingTop: 12, paddingBottom: 12 },
  actionBtn: { marginTop: 16 },
  mono: { fontSize: 14, fontWeight: '800' },

  evidenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  addPhoto: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoText: { fontSize: 10.5, fontWeight: '800' },
  thumb: { width: 64, height: 64, borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },

  error: { flexDirection: 'row', gap: 7, alignItems: 'center', borderRadius: 12, padding: 11, marginBottom: 14 },
  errorText: { flex: 1, fontSize: 12, fontWeight: '700' },
  warn: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', borderRadius: 14, borderWidth: 1, padding: 13, marginBottom: 16 },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
});
