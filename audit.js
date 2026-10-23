import crypto from 'node:crypto';
import fs from 'node:fs';
import config from '../config.js';
import { appendLine, readLines, rotate, statePath } from '../lib/store.js';
import { logger } from '../lib/http.js';

// Append-only audit log with a SHA-256 hash chain.
//
// Each record embeds the hash of the previous record, so editing or deleting any
// historical entry breaks verification for everything after it. That gives the demo
// a genuinely tamper-evident trail instead of an array that anything can rewrite.

const AUDIT_FILE = statePath(config.storage.auditFile);

const ACTIONS = new Set([
  'CONSULTATION_STARTED',
  'TRIAGE_ASSESSED',
  'EMERGENCY_FLAGGED',
  'CARE_OPTIONS_VIEWED',
  'CARE_PROVIDER_CONTACTED',
  'CONSENT_GRANTED',
  'CONSENT_REVOKED',
  'SHARE_TOKEN_ISSUED',
  'SHARE_TOKEN_VIEWED',
  'SHARE_TOKEN_REJECTED',
  'ACCESS_DENIED',
  'SECURITY_SCAN',
  'AUDIT_LOG_VERIFIED',
  'AUDIT_LOG_ROTATED',
  'SESSION_RESET'
]);

const GENESIS_ID = 'GENESIS';

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// Recursive key-sorted JSON. JSON.stringify's array replacer would silently drop
// nested keys inside `detail`, which would leave that field outside the hash and
// therefore outside tamper protection.
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function canonicalizeForHash(record) {
  const { hash, ...rest } = record;
  return stableStringify(rest);
}

// Head hash and length are cached so appending stays O(1) instead of re-reading
// and re-hashing the whole chain on every event.
let chainHead = '0'.repeat(64);
let chainLength = 0;

function readAll() {
  return readLines(AUDIT_FILE);
}

function ensureGenesis() {
  const existing = readAll();
  if (fs.existsSync(AUDIT_FILE) && existing.length > 0) {
    chainLength = existing.length;
    chainHead = existing[existing.length - 1].hash;
    return;
  }
  const genesis = {
    seq: 0,
    id: GENESIS_ID,
    ts: new Date().toISOString(),
    action: 'AUDIT_LOG_ROTATED',
    actorRole: 'system',
    recipientRole: 'system',
    fields: [],
    purpose: 'Log initialisation',
    status: 'recorded',
    detail: 'Genesis record — start of this audit chain.',
    prevHash: '0'.repeat(64)
  };
  genesis.hash = sha256(canonicalizeForHash(genesis));
  appendLine(AUDIT_FILE, genesis);
  chainHead = genesis.hash;
  chainLength = 1;
}

ensureGenesis();

/**
 * Append an event to the chain.
 * @param {object} event
 * @param {string} event.action  one of ACTIONS
 * @param {string} [event.actorRole]
 * @param {string} [event.recipientRole]
 * @param {string[]} [event.fields]
 * @param {string} [event.purpose]
 * @param {'allowed'|'denied'|'recorded'|'blocked'} [event.status]
 * @param {object} [event.detail] extra structured context (never free-text PHI)
 */
export function appendEvent(event) {
  const action = String(event.action || 'UNKNOWN').toUpperCase();
  if (!ACTIONS.has(action)) {
    logger.warn('audit: unrecognised action recorded as-is', { action });
  }

  const record = {
    seq: chainLength,
    id: event.id || `AUD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    ts: new Date().toISOString(),
    action,
    actorRole: event.actorRole || 'system',
    recipientRole: event.recipientRole || null,
    fields: Array.isArray(event.fields)
      ? event.fields.filter(Boolean).map(f => String(f).slice(0, 120)).slice(0, 40)
      : [],
    purpose: event.purpose || null,
    status: event.status || 'recorded',
    detail: event.detail ?? null,
    prevHash: chainHead
  };
  record.hash = sha256(canonicalizeForHash(record));

  appendLine(AUDIT_FILE, record);
  chainHead = record.hash;
  chainLength += 1;

  // The client renders `createdAt`; keep both names so the existing UI works.
  return { ...record, createdAt: record.ts };
}

export function listEvents({ limit = 50, offset = 0, action = null, status = null } = {}) {
  let records = readAll().reverse(); // newest first
  if (action) records = records.filter(r => r.action === String(action).toUpperCase());
  if (status) records = records.filter(r => r.status === status);

  const total = records.length;
  const paged = records.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(limit, 500));

  return {
    total,
    limit,
    offset,
    events: paged.map(r => ({ ...r, createdAt: r.ts }))
  };
}

export function verifyChain() {
  const records = readAll();
  let prevHash = '0'.repeat(64);
  let brokenAt = null;
  let reason = null;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (record.seq !== i) {
      brokenAt = i;
      reason = `Sequence gap: expected ${i}, found ${record.seq}`;
      break;
    }
    if (record.prevHash !== prevHash) {
      brokenAt = i;
      reason = 'Previous-hash link does not match the preceding record';
      break;
    }
    if (record.hash !== sha256(canonicalizeForHash(record))) {
      brokenAt = i;
      reason = 'Record hash does not match its contents — the entry was modified';
      break;
    }
    prevHash = record.hash;
  }

  const result = {
    valid: brokenAt === null,
    recordCount: records.length,
    brokenAt,
    reason,
    genesisHash: records[0]?.hash || null,
    headHash: records.length ? records[records.length - 1].hash : null,
    algorithm: 'sha256',
    verifiedAt: new Date().toISOString()
  };

  // Re-sync the cache with what is actually on disk before appending the verdict.
  chainLength = records.length;
  chainHead = result.headHash || '0'.repeat(64);

  appendEvent({
    action: 'AUDIT_LOG_VERIFIED',
    actorRole: 'system',
    status: result.valid ? 'allowed' : 'denied',
    detail: { recordCount: result.recordCount, valid: result.valid, brokenAt: result.brokenAt }
  });

  return result;
}

export function rotateLog(reason = 'Manual demo reset') {
  if (!config.storage.allowDemoReset) {
    const err = new Error('Audit log rotation is disabled (ALLOW_DEMO_RESET=false)');
    err.status = 403;
    throw err;
  }
  const archived = rotate(AUDIT_FILE);
  ensureGenesis();
  appendEvent({
    action: 'AUDIT_LOG_ROTATED',
    actorRole: 'system',
    status: 'recorded',
    purpose: reason,
    detail: { archivedTo: archived ? archived.split('/').pop() : null }
  });
  return { rotated: true, archivedFile: archived ? archived.split('/').pop() : null };
}

export function stats() {
  const records = readAll();
  const byAction = {};
  const byStatus = {};
  let denied = 0;
  let emergencies = 0;

  for (const record of records) {
    byAction[record.action] = (byAction[record.action] || 0) + 1;
    byStatus[record.status] = (byStatus[record.status] || 0) + 1;
    if (record.status === 'denied' || record.status === 'blocked') denied += 1;
    if (record.action === 'EMERGENCY_FLAGGED') emergencies += 1;
  }

  return {
    totalEvents: records.length,
    byAction,
    byStatus,
    deniedOrBlocked: denied,
    emergencyFlags: emergencies,
    oldest: records[0]?.ts || null,
    newest: records.length ? records[records.length - 1].ts : null
  };
}

export const KNOWN_ACTIONS = [...ACTIONS];

export default { appendEvent, listEvents, verifyChain, rotateLog, stats, KNOWN_ACTIONS };
