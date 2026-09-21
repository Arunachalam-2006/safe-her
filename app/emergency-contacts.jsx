import { useEffect, useState } from 'react';
import { Link, Stack, useRouter } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View, FlatList } from 'react-native';
import {
  ArrowLeft, Plus, Pencil, Trash2, X, UserRound, Phone, Heart, AlertCircle, Check, UsersRound,
} from 'lucide-react-native';
import { useTheme } from '../lib/theme';
import { Screen, Card, Pill } from '../components/ui';
import {
  addEmergencyContact,
  deleteEmergencyContact,
  formatPhoneDisplay,
  getEmergencyContacts,
  RELATIONSHIPS,
  updateEmergencyContact,
  validateEmergencyContact,
} from '../lib/emergencyContacts';
import { useSOS } from '../lib/sos';

export default function EmergencyContactsScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { refreshContactCount } = useSOS();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', relationship: 'Parent' });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const list = await getEmergencyContacts();
    setContacts(list);
    setLoading(false);
  }

  function openAdd() {
    setEditingId(null);
    setFormData({ name: '', phone: '', relationship: 'Parent' });
    setFormErrors({});
    setModalVisible(true);
  }

  function openEdit(contact) {
    setEditingId(contact.id);
    setFormData({ name: contact.name, phone: contact.phone, relationship: contact.relationship });
    setFormErrors({});
    setModalVisible(true);
  }

  function confirmDelete(contact) {
    Alert.alert(
      'Delete emergency contact?',
      `${contact.name} (${formatPhoneDisplay(contact.phone)}) will be removed from your emergency list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteEmergencyContact(contact.id);
            if (result.ok) {
              await loadAll();
              await refreshContactCount();
            }
          },
        },
      ]
    );
  }

  async function handleSubmit() {
    const check = validateEmergencyContact(formData);
    setFormErrors(check.errors || {});
    if (!check.valid) return;
    setSubmitting(true);
    const result = editingId
      ? await updateEmergencyContact(editingId, formData)
      : await addEmergencyContact(formData);
    setSubmitting(false);
    if (!result.ok) {
      setFormErrors(result.errors || {});
      return;
    }
    setModalVisible(false);
    await loadAll();
    await refreshContactCount();
  }

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.navBar}>
        <Pressable onPress={() => router.back()} style={s.backBtn}><ArrowLeft color={colors.ink} size={22} /></Pressable>
        <Text style={[s.navTitle, { color: colors.ink }]}>Emergency Contacts</Text>
        <Pressable onPress={openAdd} style={[s.addBtn, { backgroundColor: colors.primary }]}>
          <Plus color="#FFFFFF" size={18} />
        </Pressable>
      </View>

      <View style={s.introRow}>
        <View style={[s.introIcon, { backgroundColor: colors.pinkSoft }]}>
          <UsersRound color={colors.pink} size={20} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.introTitle, { color: colors.ink }]}>Trusted contacts</Text>
          <Text style={[s.introSub, { color: colors.muted }]}>
            Add people Safe-Her will prepare an emergency message for when you activate SOS.
          </Text>
        </View>
      </View>

      {contacts.length > 0 ? (
        <View style={s.countRow}>
          <Pill tone="pink">{contacts.length} contact{contacts.length === 1 ? '' : 's'} saved</Pill>
          {contacts.length < 2 ? (
            <Text style={[s.hint, { color: colors.orange }]}>Tip: add 2+ contacts for better coverage.</Text>
          ) : null}
        </View>
      ) : null}

      <FlatList
        data={contacts}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={{ gap: 12 }}
        ListEmptyComponent={
          <Card style={[s.empty, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
            <View style={[s.emptyIcon, { backgroundColor: colors.cardBg }]}>
              <Heart color={colors.primary} size={28} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.ink }]}>No emergency contacts yet</Text>
            <Text style={[s.emptySub, { color: colors.muted }]}>
              Add at least one trusted contact before activating SOS.
            </Text>
            <Pressable onPress={openAdd} style={({ pressed }) => [s.emptyBtn, { backgroundColor: colors.primary }, pressed && s.pressed]}>
              <Plus color="#FFFFFF" size={16} />
              <Text style={s.emptyBtnText}>Add your first contact</Text>
            </Pressable>
          </Card>
        }
        renderItem={({ item }) => (
          <Card style={s.rowCard}>
            <View style={[s.avatar, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
              <UserRound color={colors.primary} size={22} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.contactName, { color: colors.ink }]}>{item.name}</Text>
              <View style={s.phoneRow}>
                <Phone color={colors.muted} size={13} />
                <Text style={[s.phoneText, { color: colors.muted }]}>{formatPhoneDisplay(item.phone)}</Text>
              </View>
              <Text style={[s.relText, { color: colors.primary }]}>{item.relationship}</Text>
            </View>
            <Pressable onPress={() => openEdit(item)} style={[s.rowBtn, { backgroundColor: colors.paper }]}>
              <Pencil color={colors.primary} size={16} />
            </Pressable>
            <Pressable onPress={() => confirmDelete(item)} style={[s.rowBtn, { backgroundColor: isDark ? '#4C1D24' : '#FFE8F0' }]}>
              <Trash2 color={colors.pink} size={16} />
            </Pressable>
          </Card>
        )}
      />

      {/* Add / Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent={true} onRequestClose={() => !submitting && setModalVisible(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.cardBg }]}>
            <View style={[s.modalHeader, { borderBottomColor: colors.line }]}>
              <Text style={[s.modalTitle, { color: colors.ink }]}>
                {editingId ? 'Edit contact' : 'Add emergency contact'}
              </Text>
              <Pressable disabled={submitting} onPress={() => setModalVisible(false)} style={[s.closeBtn, { backgroundColor: colors.paper }]}>
                <X color={colors.ink} size={18} />
              </Pressable>
            </View>

            <FlatList
              data={[{ key: 'form' }]}
              keyExtractor={(i) => i.key}
              showsVerticalScrollIndicator={false}
              renderItem={() => (
                <View style={{ gap: 14, paddingVertical: 4 }}>
                  <Field
                    label="Full name"
                    value={formData.name}
                    onChangeText={(t) => setFormData((f) => ({ ...f, name: t }))}
                    placeholder="e.g. Priya Sharma"
                    error={formErrors.name}
                    icon={<UserRound color={formErrors.name ? colors.pink : colors.muted} size={16} />}
                  />
                  <Field
                    label="Phone number"
                    value={formData.phone}
                    onChangeText={(t) => setFormData((f) => ({ ...f, phone: t }))}
                    placeholder="+91 98765 43210"
                    keyboardType="phone-pad"
                    error={formErrors.phone}
                    icon={<Phone color={formErrors.phone ? colors.pink : colors.muted} size={16} />}
                  />

                  <Text style={[s.fieldLabel, { color: colors.muted }]}>Relationship</Text>
                  <View style={s.relWrap}>
                    {RELATIONSHIPS.map((r) => {
                      const active = formData.relationship === r;
                      return (
                        <Pressable
                          key={r}
                          onPress={() => setFormData((f) => ({ ...f, relationship: r }))}
                          style={({ pressed }) => [
                            s.relChip,
                            {
                              backgroundColor: active ? colors.primary : colors.paper,
                              borderColor: active ? colors.primary : colors.line,
                            },
                            pressed && s.pressed,
                          ]}
                        >
                          <Text style={[s.relChipText, { color: active ? '#FFFFFF' : colors.ink }]}>{r}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {formErrors.relationship ? (
                    <View style={s.errorBox}><AlertCircle color={colors.pink} size={14} /><Text style={s.errorText}>{formErrors.relationship}</Text></View>
                  ) : null}

                  <Card style={[s.notice, { backgroundColor: colors.primarySoft, borderColor: colors.primarySoft }]}>
                    <AlertCircle color={colors.primary} size={18} />
                    <Text style={[s.noticeText, { color: colors.ink }]}>
                      Safe-Her never sends messages automatically. When SOS is active, you choose to share via SMS or other apps.
                    </Text>
                  </Card>

                  <Pressable disabled={submitting} onPress={handleSubmit} style={({ pressed }) => [s.submitBtn, { backgroundColor: colors.pink }, pressed && s.pressed]}>
                    {submitting ? null : <Check color="#FFFFFF" size={18} />}
                    <Text style={s.submitBtnText}>{submitting ? 'Saving…' : editingId ? 'Save changes' : 'Add contact'}</Text>
                  </Pressable>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Field({ label, value, onChangeText, placeholder, icon, error, keyboardType }) {
  const { colors } = useTheme();
  return (
    <View>
      {label ? <Text style={[s.fieldLabel, { color: colors.muted }]}>{label}</Text> : null}
      <View style={[s.inputWrap, { borderColor: error ? colors.pink : colors.line, backgroundColor: colors.cardBg }]}>
        {icon}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          keyboardType={keyboardType || 'default'}
          style={[s.input, { color: colors.ink }]}
          autoCapitalize="words"
          autoCorrect={false}
        />
      </View>
      {error ? (
        <View style={s.errorBox}><AlertCircle color={colors.pink} size={14} /><Text style={s.errorText}>{error}</Text></View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 14 },
  backBtn: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontSize: 18, fontWeight: '800' },
  addBtn: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  introRow: { flexDirection: 'row', gap: 12, marginHorizontal: 20, marginBottom: 16, alignItems: 'center' },
  introIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  introTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  introSub: { fontSize: 12, lineHeight: 18 },
  countRow: { marginHorizontal: 20, marginBottom: 12, gap: 6, alignItems: 'center', flexDirection: 'row' },
  hint: { fontSize: 11, fontWeight: '700' },
  empty: { marginHorizontal: 20, padding: 22, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptySub: { fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 8 },
  emptyBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  emptyBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  avatar: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  contactName: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  phoneText: { fontSize: 12, fontWeight: '600' },
  relText: { fontSize: 11, fontWeight: '700' },
  rowBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  pressed: { opacity: 0.7 },
  modalOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '88%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1 },
  modalTitle: { fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  fieldLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3, marginBottom: 6, marginTop: 4, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 12, height: 48, borderWidth: 1, borderRadius: 14 },
  input: { flex: 1, fontSize: 14, fontWeight: '600', outlineStyle: 'none', outlineWidth: 0, outlineColor: 'transparent' },
  errorBox: { marginTop: 6, flexDirection: 'row', alignItems: 'center', gap: 6 },
  errorText: { color: '#C24141', fontSize: 12, fontWeight: '700' },
  relWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  relChipText: { fontSize: 12, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  submitBtn: { marginTop: 4, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
});
