import express from 'express';
import config from './config.js';
import { asyncHandler, badRequest, notFound } from './lib/errors.js';
import { validate, LANGUAGES, ROLES, RISK_LEVELS } from './lib/validate.js';
import { clientIp, readLimiter, writeLimiter } from './lib/http.js';
import { truncate } from './lib/text.js';
import { assessRisk, getSessionState } from './services/triage.js';
import { detectScam, redactSecrets } from './services/scam.js';
import { findCareOptions, getFacilityById, getEmergencyContacts } from './services/care.js';
import {
  appendEvent, listEvents, verifyChain, rotateLog, stats as auditStats, KNOWN_ACTIONS
} from './services/audit.js';
import {
  getCatalogue, grantConsent, listConsents, redeemShare, revokeConsent
} from './services/consent.js';
import {
  handleUserMessage, createSession, clearSession, listSessions, getGreeting, llmStatus
} from './services/chat.js';

export const router = express.Router();
const startedAt = Date.now();

// One read budget for every endpoint; mutations get a second, tighter budget.
router.use(readLimiter);

const textSchema = {
  text: { type: 'string', required: true, minLength: 1, maxLength: config.maxTextLength },
  language: { type: 'string', oneOf: LANGUAGES, default: 'en' },
  sessionId: { type: 'string', maxLength: 80 }
};

const querySchema = {
  lat: { type: 'number', min: -90, max: 90 },
  lng: { type: 'number', min: -180, max: 180 },
  level: { type: 'string', oneOf: RISK_LEVELS, default: 'routine' },
  emergencyOnly: { type: 'boolean', default: false },
  crisis: { type: 'boolean', default: false },
  groups: { type: 'array', maxItems: 12 },
  specialty: { type: 'string', maxLength: 60 },
  service: { type: 'string', maxLength: 60 },
  q: { type: 'string', maxLength: 120 },
  radiusKm: { type: 'number', min: 1, max: 500 },
  limit: { type: 'number', min: 1, max: 50, default: 6 },
  types: { type: 'array', maxItems: 8 },
  useRealData: { type: 'boolean', default: false }
};

// Comma-separated list params arrive as strings from a query string.
const LIST_PARAMS = ['types', 'groups'];

// --- Meta ------------------------------------------------------------------

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'jeevansetu-api',
    version: '2.0.0',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    env: config.env,
    checks: {
      storage: true,
      triageEngine: true,
      careDirectory: true,
      auditChain: true
    },
    llm: llmStatus(),
    timestamp: new Date().toISOString()
  });
});

// Tells the browser client what it can rely on, so the UI can degrade instead of
// guessing (e.g. speech input is Chromium-only, geolocation needs HTTPS).
router.get('/capabilities', (req, res) => {
  res.json({
    version: '2.0.0',
    languages: LANGUAGES,
    roles: ROLES,
    defaultLanguage: 'hinglish',
    speech: {
      // Web Speech API is not implemented in Firefox and only partially in Safari;
      // it also requires a secure context. The UI must offer a text fallback.
      requiresSecureContext: true,
      browserApi: 'SpeechRecognition | webkitSpeechRecognition',
      widelySupported: false,
      fallback: 'text-input'
    },
    geolocation: {
      supported: true,
      requiresSecureContext: true,
      fallback: 'manual-city-or-default'
    },
    llm: llmStatus(),
    shareTokens: { ttlMs: config.consent.ttlMs, maxViews: config.consent.maxViews },
    demoDataOnly: true,
    isDiagnosis: false
  });
});

router.get('/stats', (req, res) => {
  const audit = auditStats();
  res.json({
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    audit,
    activeSessions: listSessions().length,
    consentRecords: listConsents().length,
    triageEngineVersion: config.triage.engineVersion,
    llm: llmStatus()
  });
});

// --- Triage & conversation -------------------------------------------------

router.post('/triage', writeLimiter, asyncHandler((req, res) => {
  const { text, language, sessionId } = validate(req.body, textSchema);
  const result = assessRisk(text, { language, sessionId });

  if (result.level === 'emergency') {
    appendEvent({
      action: 'EMERGENCY_FLAGGED',
      actorRole: req.body.actorRole || 'patient',
      status: 'allowed',
      purpose: 'Deterministic red-flag engine',
      fields: result.flags,
      detail: {
        level: result.level,
        flagIds: result.flagsDetail.map(f => f.id),
        sessionId: sessionId || null,
        // Store only rule identifiers, never the patient's free text.
        textLength: text.length
      }
    });
  } else {
    appendEvent({
      action: 'TRIAGE_ASSESSED',
      actorRole: req.body.actorRole || 'patient',
      status: 'recorded',
      purpose: 'Deterministic red-flag engine',
      fields: result.flags,
      detail: { level: result.level, flagIds: result.flagsDetail.map(f => f.id), textLength: text.length }
    });
  }

  res.json(result);
}));

router.post('/chat/session', writeLimiter, (req, res) => {
  const { language } = validate(req.body || {}, {
    language: { type: 'string', oneOf: LANGUAGES, default: 'hinglish' }
  });
  res.status(201).json(createSession(language));
});

router.post('/chat', writeLimiter, asyncHandler(async (req, res) => {
  const { text, language, sessionId } = validate(req.body, textSchema);
  const result = await handleUserMessage({ text, language, sessionId });

  appendEvent({
    action: result.triage.level === 'emergency' ? 'EMERGENCY_FLAGGED' : 'CONSULTATION_STARTED',
    actorRole: req.body.actorRole || 'patient',
    status: 'allowed',
    purpose: 'Chat consultation',
    fields: result.triage.flags,
    detail: {
      level: result.triage.level,
      flagIds: result.triage.flagsDetail.map(f => f.id),
      sessionId: result.sessionId,
      replySource: result.reply.source
    }
  });

  res.json(result);
}));

router.get('/chat/greeting', (req, res) => {
  const { language } = validate(req.query, {
    language: { type: 'string', oneOf: LANGUAGES, default: 'hinglish' }
  });
  res.json(getGreeting(language));
});

router.delete('/chat/session/:sessionId', writeLimiter, (req, res) => {
  const sessionId = truncate(req.params.sessionId, 80);
  const result = clearSession(sessionId);
  appendEvent({
    action: 'SESSION_RESET',
    actorRole: 'patient',
    status: 'recorded',
    detail: { sessionId }
  });
  res.json(result);
});

router.get('/chat/session/:sessionId', (req, res) => {
  const sessionId = truncate(req.params.sessionId, 80);
  const session = getSessionState(sessionId);
  if (!session) throw notFound('Session not found or expired');
  res.json({ sessionId, ...session });
});

// --- Care navigation -------------------------------------------------------

router.get('/care-options', async (req, res) => {
  // List params may arrive as ?groups=cardiac,neuro or as repeated params;
  // normalise first so validation sees arrays.
  const rawQuery = { ...req.query };
  for (const key of LIST_PARAMS) {
    if (typeof rawQuery[key] === 'string') {
      rawQuery[key] = rawQuery[key].split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  const query = validate(rawQuery, querySchema);
  const result = await findCareOptions(query);

  appendEvent({
    action: 'CARE_OPTIONS_VIEWED',
    actorRole: ROLES.includes(req.query.actorRole) ? req.query.actorRole : 'patient',
    status: 'recorded',
    detail: {
      level: query.level,
      count: result.count,
      geoSource: result.origin.source,
      groups: query.groups || []
    }
  });

  res.json(result);
});

router.get('/care-options/:id', (req, res) => {
  const facility = getFacilityById(req.params.id);
  if (!facility) throw notFound('Care facility not found');
  res.json(facility);
});

// Replaces the browser alert() stubs with a real, audited action.
router.post('/care-options/:id/contact', writeLimiter, (req, res) => {
  const facility = getFacilityById(req.params.id);
  if (!facility) throw notFound('Care facility not found');

  const { mode, level } = validate(req.body || {}, {
    mode: { type: 'string', oneOf: ['call', 'directions', 'ambulance'], default: 'call' },
    level: { type: 'string', oneOf: RISK_LEVELS, default: 'routine' }
  });

  const number = mode === 'ambulance' ? facility.ambulancePhone : facility.phone;
  const contacts = getEmergencyContacts('en');

  appendEvent({
    action: 'CARE_PROVIDER_CONTACTED',
    actorRole: req.body?.actorRole || 'patient',
    recipientRole: facility.name,
    status: 'allowed',
    purpose: mode,
    detail: { facilityId: facility.id, mode, level }
  });

  res.json({
    facility: { id: facility.id, name: facility.name, address: facility.address },
    mode,
    number,
    telUri: `tel:${String(number).replace(/[^\d+]/g, '')}`,
    mapsUrl: facility.mapsUrl,
    whatToSay: contacts.whatToSay,
    isDemoData: true,
    note: 'JeevanSetu does not place calls or dispatch ambulances. This gives you the number and what to say.'
  });
});

router.get('/emergency-contacts', (req, res) => {
  const { language, category } = validate(req.query, {
    language: { type: 'string', oneOf: LANGUAGES, default: 'en' },
    category: { type: 'string', maxLength: 30 }
  });
  res.json(getEmergencyContacts(language, category || null));
});

// --- Scam scanner ----------------------------------------------------------

router.post('/security-scan', writeLimiter, (req, res) => {
  const { text, language } = validate(req.body, {
    text: { type: 'string', required: true, minLength: 1, maxLength: config.maxTextLength * 2 },
    language: { type: 'string', oneOf: LANGUAGES, default: 'en' }
  });

  const result = detectScam(text, { language });

  appendEvent({
    action: 'SECURITY_SCAN',
    actorRole: req.body.actorRole || 'patient',
    status: result.isSuspicious ? 'blocked' : 'allowed',
    purpose: 'Medical payment / impersonation scam check',
    detail: {
      verdict: result.verdict,
      confidence: result.confidence,
      indicatorIds: result.indicatorsDetail.map(i => i.id)
    }
  });

  res.json(result);
});

// Lets the UI redact a pasted message *before* the user screenshots or forwards it.
router.post('/redact', writeLimiter, (req, res) => {
  const { text } = validate(req.body, {
    text: { type: 'string', required: true, minLength: 1, maxLength: config.maxTextLength * 2 }
  });
  res.json({ redactedText: redactSecrets(text) });
});

// --- Consent & sharing -----------------------------------------------------

router.get('/consent/fields', (req, res) => {
  const { language } = validate(req.query, {
    language: { type: 'string', oneOf: LANGUAGES, default: 'en' }
  });
  res.json({ fields: getCatalogue(language), recipients: ['caregiver', 'clinic', 'ambulance', 'doctor', 'family', 'self'] });
});

router.post('/consent', writeLimiter, (req, res) => {
  const body = validate(req.body, {
    selectedFields: { type: 'array', required: true, minItems: 1, maxItems: 20 },
    recipient: { type: 'string', default: 'caregiver', maxLength: 30 },
    purpose: { type: 'string', default: 'Care coordination', maxLength: 120 },
    actorRole: { type: 'string', oneOf: ROLES, default: 'patient' },
    sessionId: { type: 'string', maxLength: 80 },
    ttlMs: { type: 'number', min: 60_000, max: 24 * 60 * 60 * 1000 },
    payload: { type: 'object' }
  });

  const record = grantConsent(body);

  appendEvent({
    action: 'CONSENT_GRANTED',
    actorRole: body.actorRole,
    recipientRole: body.recipient,
    status: 'allowed',
    purpose: body.purpose,
    fields: record.fields,
    detail: { consentId: record.id, expiresAt: record.expiresAt, maxViews: record.maxViews, sensitivity: record.sensitivity }
  });
  appendEvent({
    action: 'SHARE_TOKEN_ISSUED',
    actorRole: body.actorRole,
    recipientRole: body.recipient,
    status: 'allowed',
    purpose: body.purpose,
    detail: { consentId: record.id, snapshotHash: record.snapshotHash, fieldCount: record.fields.length }
  });

  res.status(201).json({
    success: true,
    message: 'Consent recorded securely',
    consent: record,
    share: {
      token: record.token,
      path: `/api/share/${record.token}`,
      expiresAt: record.expiresAt,
      viewsRemaining: record.viewsRemaining,
      instruction: 'Share this token only with the person you selected. It shows them only the ticked fields.'
    }
  });
});

router.get('/consent', (req, res) => {
  const { sessionId } = validate(req.query, { sessionId: { type: 'string', maxLength: 80 } });
  res.json({ records: listConsents({ sessionId: sessionId || null }) });
});

router.post('/consent/:id/revoke', writeLimiter, (req, res) => {
  const record = revokeConsent(req.params.id);
  appendEvent({
    action: 'CONSENT_REVOKED',
    actorRole: record.actorRole || 'patient',
    recipientRole: record.recipient,
    status: 'allowed',
    purpose: 'Patient withdrew consent',
    fields: record.fields,
    detail: { consentId: record.id }
  });
  res.json({ success: true, message: 'Consent revoked and shared data deleted', consent: record });
});

// Recipient-facing endpoint: returns only the consented snapshot.
router.get('/share/:token', (req, res) => {
  try {
    const result = redeemShare(req.params.token, {
      requesterRole: ROLES.includes(req.query.requesterRole) ? req.query.requesterRole : 'caregiver',
      requesterIp: clientIp(req)
    });
    appendEvent({
      action: 'SHARE_TOKEN_VIEWED',
      actorRole: result.grantedBy,
      recipientRole: req.query.requesterRole || 'caregiver',
      status: 'allowed',
      purpose: result.purpose,
      fields: result.fields,
      detail: { snapshotHash: result.snapshotHash, viewsRemaining: result.viewsRemaining }
    });
    res.json({ success: true, ...result });
  } catch (error) {
    if (error.audit) {
      appendEvent({
        action: error.audit.action,
        actorRole: req.query.requesterRole || 'caregiver',
        status: 'denied',
        purpose: 'Share token redemption refused',
        detail: { reason: error.audit.reason, ipHash: null }
      });
    }
    throw error;
  }
});

// --- Audit -----------------------------------------------------------------

router.get('/audit', (req, res) => {
  const query = validate(req.query, {
    limit: { type: 'number', min: 1, max: 500, default: 50 },
    offset: { type: 'number', min: 0, default: 0 },
    action: { type: 'string', maxLength: 40 },
    status: { type: 'string', oneOf: ['allowed', 'denied', 'recorded', 'blocked'] }
  });
  res.json(listEvents(query));
});

router.post('/audit', writeLimiter, (req, res) => {
  const body = validate(req.body, {
    action: { type: 'string', required: true, maxLength: 40 },
    actorRole: { type: 'string', oneOf: ROLES, default: 'patient' },
    recipientRole: { type: 'string', maxLength: 40 },
    fields: { type: 'array', maxItems: 30 },
    purpose: { type: 'string', maxLength: 160 },
    status: { type: 'string', oneOf: ['allowed', 'denied', 'recorded', 'blocked'], default: 'recorded' }
  });

  const normalizedAction = body.action.toUpperCase();
  if (!KNOWN_ACTIONS.includes(normalizedAction)) {
    throw badRequest(`Unknown audit action "${body.action}". Allowed: ${KNOWN_ACTIONS.join(', ')}`);
  }

  const event = appendEvent({ ...body, action: normalizedAction });
  res.status(201).json({ success: true, event });
});

router.get('/audit/verify', (req, res) => {
  res.json(verifyChain());
});

router.post('/audit/rotate', writeLimiter, (req, res) => {
  if (!config.storage.allowDemoReset) {
    throw badRequest('Audit rotation is disabled on this server (ALLOW_DEMO_RESET=false)');
  }
  const { reason } = validate(req.body || {}, { reason: { type: 'string', default: 'Manual demo reset', maxLength: 160 } });
  res.json(rotateLog(reason));
});
