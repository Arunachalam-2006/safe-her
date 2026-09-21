import { storageGet, storageSet } from './storage';

const KEY = 'safeher_sos_emergency_contacts_v1';
const RELATIONSHIPS = ['Parent', 'Spouse', 'Sibling', 'Friend', 'Guardian', 'Colleague', 'Neighbor', 'Other'];

function uid() {
  return `ec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d+]/g, '');
  return digits;
}

export function validateEmergencyContact(contact) {
  const errors = {};
  const name = (contact?.name || '').trim();
  const phone = normalizePhone(contact?.phone);
  const relationship = (contact?.relationship || '').trim();

  if (!name) errors.name = 'Contact name is required.';
  else if (name.length < 2) errors.name = 'Contact name is too short.';
  else if (name.length > 60) errors.name = 'Contact name is too long.';

  if (!phone) errors.phone = 'Phone number is required.';
  else {
    const digits = phone.replace(/[+]/g, '');
    if (digits.length < 8) errors.phone = 'Phone number looks too short.';
    else if (digits.length > 15) errors.phone = 'Phone number looks too long.';
  }

  if (!relationship) errors.relationship = 'Please choose a relationship.';
  else if (!RELATIONSHIPS.includes(relationship)) errors.relationship = 'Invalid relationship.';

  const valid = Object.keys(errors).length === 0;
  return { valid, errors };
}

export async function getEmergencyContacts() {
  const list = await storageGet(KEY, []);
  if (!Array.isArray(list)) return [];
  return list
    .filter((c) => c && c.id)
    .map((c) => ({ id: c.id, name: c.name || '', phone: c.phone || '', relationship: c.relationship || '' }));
}

async function saveAll(list) {
  await storageSet(KEY, list);
  return list;
}

export async function addEmergencyContact(data) {
  const incoming = {
    name: (data?.name || '').trim(),
    phone: normalizePhone(data?.phone),
    relationship: data?.relationship || 'Other',
  };
  const check = validateEmergencyContact(incoming);
  if (!check.valid) return { ok: false, errors: check.errors };

  const list = await getEmergencyContacts();
  const duplicate = list.some(
    (c) => c.phone === incoming.phone,
  );
  if (duplicate) {
    return { ok: false, errors: { phone: 'This phone number is already saved.' } };
  }

  const record = { id: uid(), ...incoming };
  list.push(record);
  await saveAll(list);
  return { ok: true, contact: record };
}

export async function updateEmergencyContact(id, data) {
  if (!id) return { ok: false, errors: { id: 'Missing contact ID.' } };
  const incoming = {
    name: (data?.name || '').trim(),
    phone: normalizePhone(data?.phone),
    relationship: data?.relationship || 'Other',
  };
  const check = validateEmergencyContact(incoming);
  if (!check.valid) return { ok: false, errors: check.errors };

  const list = await getEmergencyContacts();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, errors: { id: 'Contact not found.' } };

  const duplicate = list.some((c, i) => i !== idx && c.phone === incoming.phone);
  if (duplicate) {
    return { ok: false, errors: { phone: 'This phone number is already saved.' } };
  }

  list[idx] = { ...list[idx], ...incoming };
  await saveAll(list);
  return { ok: true, contact: list[idx] };
}

export async function deleteEmergencyContact(id) {
  if (!id) return { ok: false };
  const list = await getEmergencyContacts();
  const filtered = list.filter((c) => c.id !== id);
  await saveAll(filtered);
  return { ok: true, deleted: filtered.length !== list.length };
}

export function formatPhoneDisplay(phone) {
  if (!phone) return '';
  const p = String(phone);
  if (p.length <= 5) return p;
  if (p.startsWith('+')) {
    const rest = p.slice(1);
    return `+${rest.slice(0, 2)} ${rest.slice(2, 7)} ${rest.slice(7)}`;
  }
  return `${p.slice(0, Math.ceil(p.length / 2))} ${p.slice(Math.ceil(p.length / 2))}`;
}

export { RELATIONSHIPS };
