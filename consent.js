import crypto from 'node:crypto';
import config from '../config.js';
import { readJson, writeJson, statePath } from '../lib/store.js';
import { HttpError } from '../lib/errors.js';

// Consent service.
//
// The privacy guarantee is structural, not decorative: only the fields the user
// ticked are ever copied into the share snapshot. A recipient redeeming the token
// cannot see anything else, because the rest was never written to the record.

const FILE = statePath(config.storage.consentFile);

export const FIELD_CATALOGUE = [
  { key: 'symptoms', label: 'Symptoms', labelHi: 'लक्षण', sensitivity: 'medium', defaultSelected: true, description: 'Red-flag and urgent flags detected in this consultation.' },
  { key: 'riskLevel', label: 'Risk result', labelHi: 'जोखिम स्तर', sensitivity: 'medium', defaultSelected: true, description: 'Emergency / Urgent / Routine and the reason.' },
  { key: 'duration', label: 'Symptom duration', labelHi: 'अवधि', sensitivity: 'low', defaultSelected: false, description: 'How long the symptoms have been present.' },
  { key: 'bodySites', label: 'Affected body areas', labelHi: 'प्रभावित अंग', sensitivity: 'low', defaultSelected: false, description: 'Body sites mentioned in the description.' },
  { key: 'vitals', label: 'Vital signs', labelHi: 'वाइटल साइन्स', sensitivity: 'high', defaultSelected: false, description: 'BP, SpO2, temperature, pulse and sugar readings you entered.' },
  { key: 'carePlan', label: 'Recommended next step', labelHi: 'अगला कदम', sensitivity: 'low', defaultSelected: false, description: 'The navigation guidance and first-aid steps shown to you.' },
  { key: 'allergies', label: 'Allergies', labelHi: 'एलर्जी', sensitivity: 'high', defaultSelected: false, description: 'Known allergies.' },
  { key: 'medications', label: 'Medications', labelHi: 'दवाइयां', sensitivity: 'high', defaultSelected: false, description: 'Current medicines.' },
  { key: 'notes', label: 'Notes', labelHi: 'टिप्पणी', sensitivity: 'medium', defaultSelected: false, description: 'Anything you wrote in the notes field.' },
  { key: 'fullHistory', label: 'Full medical history', labelHi: 'पूरा चिकित्सा इतिहास', sensitivity: 'critical', defaultSelected: false, description: 'Complete history. Never selected by default — share only when truly required.' },
  { key: 'transcript', label: 'Full conversation transcript', labelHi: 'पूरी बातचीत', sensitivity: 'critical', defaultSelected: false, description: 'The verbatim chat. Includes your exact wording.' }
];

const FIELD_KEYS = new Set(FIELD_CATALOGUE.map(f => f.key));
const RECIPIENTS = new Set(['caregiver', 'clinic', 'ambulance', 'doctor', 'family', 'self']);

// Unambiguous alphabet (no 0/O/1/I) so a token can be read aloud over a phone call.
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateToken() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
    if (i === 3 || i === 7 || i === 11) out += '-';
  }
  return `JSC-${out}`;
}

function load() {
  return readJson(FILE, { records: [] });
}

function save(state) {
  writeJson(FILE, state);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Builds the snapshot from the source payload, copying ONLY consented fields.
function buildSnapshot(fields, payload = {}) {
  const snapshot = {};
  for (const field of fields) {
    if (!FIELD_KEYS.has(field)) continue;
    if (payload[field] === undefined || payload[field] === null) continue;
    snapshot[field] = payload[field];
  }
  return snapshot;
}

export function getCatalogue(language = 'en') {
  return FIELD_CATALOGUE.map(f => ({
    ...f,
    labelLocal: language === 'hi' ? (f.labelHi || f.label) : f.label
  }));
}

export function validateFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new HttpError(400, 'Nothing selected to share', [{ field: 'selectedFields', message: 'Select at least one field' }]);
  }
  const unique = [...new Set(fields)];
  const invalid = unique.filter(f => !FIELD_KEYS.has(f));
  if (invalid.length) {
    throw new HttpError(400, `Unsupported field(s): ${invalid.join(', ')}`, [
      { field: 'selectedFields', message: `Allowed values: ${[...FIELD_KEYS].join(', ')}` }
    ]);
  }
  return unique;
}

/**
 * @param {object} input
 * @param {string[]} input.selectedFields
 * @param {string} input.recipient
 * @param {string} input.purpose
 * @param {object} [input.payload]  full consultation data; only consented keys are copied
 * @param {string} [input.actorRole]
 * @param {string} [input.sessionId]
 */
export function grantConsent(input) {
  const fields = validateFields(input.selectedFields);
  const recipient = RECIPIENTS.has(input.recipient) ? input.recipient : 'caregiver';
  const purpose = String(input.purpose || 'Care coordination').slice(0, 120);
  const ttlMs = Number.isFinite(input.ttlMs) ? input.ttlMs : config.consent.ttlMs;

  const now = Date.now();
  const snapshot = buildSnapshot(fields, input.payload);

  const record = {
    id: `CSN-${now.toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    token: generateToken(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
    ttlMs,
    actorRole: input.actorRole || 'patient',
    sessionId: input.sessionId || null,
    recipient,
    purpose,
    fields,
    sensitivity: [...new Set(fields.map(f => FIELD_CATALOGUE.find(c => c.key === f)?.sensitivity).filter(Boolean))],
    maxViews: config.consent.maxViews,
    viewCount: 0,
    status: 'active',
    snapshot,
    snapshotHash: sha256(JSON.stringify(snapshot)),
    accesses: []
  };

  const state = load();
  state.records.unshift(record);
  // Bounded growth: keep the most recent 500 consents.
  state.records = state.records.slice(0, 500);
  save(state);

  return publicView(record);
}

function publicView(record) {
  return {
    id: record.id,
    token: record.token,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    expiresInMs: Math.max(0, new Date(record.expiresAt).getTime() - Date.now()),
    actorRole: record.actorRole,
    recipient: record.recipient,
    purpose: record.purpose,
    fields: record.fields,
    sensitivity: record.sensitivity,
    maxViews: record.maxViews,
    viewsRemaining: Math.max(0, record.maxViews - record.viewCount),
    viewCount: record.viewCount,
    status: effectiveStatus(record),
    snapshotHash: record.snapshotHash,
    accesses: record.accesses.slice(-10)
  };
}

function effectiveStatus(record) {
  if (record.status === 'revoked') return 'revoked';
  if (new Date(record.expiresAt).getTime() < Date.now()) return 'expired';
  if (record.viewCount >= record.maxViews) return 'exhausted';
  return 'active';
}

export function listConsents({ sessionId = null } = {}) {
  const state = load();
  let records = state.records;
  if (sessionId) records = records.filter(r => r.sessionId === sessionId);
  return records.map(publicView);
}

export function getConsent(idOrToken) {
  const state = load();
  const needle = String(idOrToken).trim().toUpperCase();
  return state.records.find(r => r.id === needle || r.token === needle) || null;
}

/**
 * Redeem a share token. Returns only the consented snapshot.
 * Throws 403/404/410 so the route can audit the outcome.
 */
export function redeemShare(token, { requesterRole = 'caregiver', requesterIp = null } = {}) {
  const state = load();
  const needle = String(token || '').trim().toUpperCase();
  const record = state.records.find(r => r.token === needle);

  if (!record) {
    const error = new HttpError(404, 'This share link is not valid.');
    error.audit = { action: 'SHARE_TOKEN_REJECTED', status: 'denied', reason: 'unknown_token' };
    throw error;
  }

  const status = effectiveStatus(record);
  const access = {
    at: new Date().toISOString(),
    requesterRole,
    requesterIp: requesterIp ? sha256(requesterIp).slice(0, 16) : null,
    status
  };
  record.accesses.push(access);

  if (status !== 'active') {
    save(state);
    const message = {
      revoked: 'This share link was revoked by the patient.',
      expired: 'This share link has expired. Ask the patient to share again.',
      exhausted: 'This share link reached its maximum number of views.'
    }[status];
    const error = new HttpError(status === 'expired' ? 410 : 403, message);
    error.audit = { action: 'SHARE_TOKEN_REJECTED', status: 'denied', reason: status };
    throw error;
  }

  record.viewCount += 1;
  save(state);

  return {
    sharedAt: record.createdAt,
    expiresAt: record.expiresAt,
    purpose: record.purpose,
    grantedBy: record.actorRole,
    recipient: record.recipient,
    fields: record.fields,
    viewsRemaining: Math.max(0, record.maxViews - record.viewCount),
    snapshot: record.snapshot,
    snapshotHash: record.snapshotHash,
    notice: 'You are seeing only the fields the patient explicitly consented to share.',
    access
  };
}

export function revokeConsent(id) {
  const state = load();
  const needle = String(id).trim().toUpperCase();
  const record = state.records.find(r => r.id === needle || r.token === needle);
  if (!record) throw new HttpError(404, 'Consent record not found');
  if (record.status === 'revoked') return publicView(record);

  record.status = 'revoked';
  record.revokedAt = new Date().toISOString();
  // Purge the snapshot on revocation — consent withdrawn means data withdrawn.
  record.snapshot = {};
  save(state);
  return publicView(record);
}

export function resetConsents() {
  save({ records: [] });
  return { cleared: true };
}

export default {
  FIELD_CATALOGUE,
  getCatalogue,
  grantConsent,
  listConsents,
  getConsent,
  redeemShare,
  revokeConsent,
  resetConsents,
  validateFields
};
