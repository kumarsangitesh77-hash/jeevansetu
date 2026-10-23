import config from '../config.js';
import { canonicalize, compileMatcher, isNegated, isDenied, extractDuration, extractAge, truncate } from '../lib/text.js';
import { parseVitals, assessVitals } from './vitals.js';
import {
  RED_FLAGS, URGENT_FLAGS, CRISIS_FLAGS, BODY_SITES, COMBINATION_RULES,
  THIRD_PERSON, PREGNANCY_CONTEXT, INFANT_CONTEXT, CHILD_CONTEXT, ELDERLY_CONTEXT
} from './triageRules.js';
import emergencyData from '../data/emergency-contacts.json' with { type: 'json' };

// --- Rule compilation ------------------------------------------------------
// Compile every phrase once at module load. Matching is then a regex/substring
// test over already-canonicalized text, which keeps the hot path allocation-free.

function compileRules(rules, level) {
  return rules.map(rule => ({
    id: rule.id,
    label: rule.label,
    group: rule.group || level,
    level,
    matchers: rule.keys.map(key => ({ key, match: compileMatcher(key) }))
  }));
}

const COMPILED_RED = compileRules(RED_FLAGS, 'emergency');
const COMPILED_URGENT = compileRules(URGENT_FLAGS, 'urgent');
const COMPILED_CRISIS = compileRules(CRISIS_FLAGS, 'emergency');
const COMPILED_SITES = BODY_SITES.map(site => ({
  id: site.id,
  label: site.label,
  matchers: site.keys.map(key => ({ key, match: compileMatcher(key) }))
}));
const COMPILED_THIRD_PERSON = THIRD_PERSON.map(compileMatcher);
const COMPILED_PREGNANCY = PREGNANCY_CONTEXT.map(compileMatcher);
const COMPILED_INFANT = INFANT_CONTEXT.map(compileMatcher);
const COMPILED_CHILD = CHILD_CONTEXT.map(compileMatcher);
const COMPILED_ELDERLY = ELDERLY_CONTEXT.map(compileMatcher);
const COMPILED_FEVER_WORD = ['bukhar', 'fever', 'temperature', 'garam'].map(compileMatcher);

const COMPILED_COMBOS = COMBINATION_RULES.map(rule => ({
  id: rule.id,
  label: rule.label,
  level: rule.level,
  group: rule.group,
  groups: rule.allOf.map(alternatives =>
    alternatives.map(key => ({ key, match: compileMatcher(key) }))
  )
}));

const LEVEL_RANK = { routine: 0, urgent: 1, emergency: 2 };

// --- Localized flag labels -------------------------------------------------

const FLAG_LABELS = {
  chest_pain: { hi: 'सीने में दर्द', hinglish: 'Seene me dard' },
  radiating_pain: { hi: 'बांह या जबड़े में दर्द', hinglish: 'Arm ya jaw me dard' },
  breathing_difficulty: { hi: 'सांस लेने में परेशानी', hinglish: 'Saans lene me pareshani' },
  cyanosis: { hi: 'होंठ या चेहरा नीला', hinglish: 'Hoth ya chehra neela' },
  choking: { hi: 'दम घुटना', hinglish: 'Dam ghutna' },
  unconsciousness: { hi: 'बेहोशी', hinglish: 'Behoshi' },
  seizure: { hi: 'दौरा', hinglish: 'Daura' },
  stroke_signs: { hi: 'लकवा के लक्षण', hinglish: 'Lakwa ke lakshan' },
  sudden_weakness: { hi: 'अचानक तेज़ कमजोरी', hinglish: 'Achanak tez kamzori' },
  thunderclap_headache: { hi: 'अचानक बहुत तेज सिरदर्द', hinglish: 'Achanak bahut tez sir dard' },
  severe_bleeding: { hi: 'बहुत खून बहना', hinglish: 'Bahut khoon behna' },
  major_trauma: { hi: 'गंभीर चोट या दुर्घटना', hinglish: 'Gambhir chot ya accident' },
  head_injury: { hi: 'सिर में चोट', hinglish: 'Sir me chot' },
  severe_burns: { hi: 'गंभीर जलन', hinglish: 'Gambhir jalna' },
  poisoning: { hi: 'जहर या अधिक दवा', hinglish: 'Zehar ya zyada dawa' },
  snake_bite: { hi: 'सांप का काटना', hinglish: 'Saamp ka kaatna' },
  anaphylaxis: { hi: 'गंभीर एलर्जी', hinglish: 'Gambhir allergy' },
  pregnancy_emergency: { hi: 'गर्भावस्था आपातकाल', hinglish: 'Pregnancy emergency' },
  infant_danger: { hi: 'शिशु के खतरे के संकेत', hinglish: 'Baby ke danger signs' },
  meningism: { hi: 'बुखार के साथ गर्दन अकड़न', hinglish: 'Bukhar ke saath gardan akad' },
  shock: { hi: 'शॉक के लक्षण', hinglish: 'Shock ke lakshan' },
  vomiting_blood: { hi: 'उल्टी या मल में खून', hinglish: 'Ulti ya mal me khoon' },
  urinary_obstruction: { hi: 'पेशाब न होना', hinglish: 'Peshab na hona' },
  self_harm: { hi: 'आत्महत्या का विचार', hinglish: 'Self-harm ke thoughts' },
  harm_others: { hi: 'किसी को नुकसान पहुंचाने का विचार', hinglish: 'Kisi ko nuksan pahunchane ka thought' },
  high_fever: { hi: 'तेज बुखार', hinglish: 'Tez bukhar' },
  persistent_vomiting: { hi: 'बार-बार उल्टी', hinglish: 'Bar bar ulti' },
  severe_pain: { hi: 'बहुत तेज दर्द', hinglish: 'Bahut tez dard' },
  dehydration: { hi: 'पानी की कमी', hinglish: 'Paani ki kami' },
  blood_urine_stool: { hi: 'पेशाब या मल में खून', hinglish: 'Peshab ya mal me khoon' },
  breathless_exertion: { hi: 'थोड़ी मेहनत में सांस फूलना', hinglish: 'Thodi mehnat me saans phoolna' },
  swelling: { hi: 'नई सूजन', hinglish: 'Nayi soojan' },
  laceration: { hi: 'गहरा घाव', hinglish: 'Gehra ghav' },
  fracture: { hi: 'हड्डी टूटने की आशंका', hinglish: 'Haddi tootne ki doubt' },
  animal_bite: { hi: 'जानवर के काटने पर', hinglish: 'Janwar ke kaatne par' },
  jaundice: { hi: 'पीलिया', hinglish: 'Peeliya' },
  urinary_pain: { hi: 'पेशाब में जलन', hinglish: 'Peshab me jalan' },
  persistent_diarrhoea: { hi: 'लगातार दस्त', hinglish: 'Lagatar dast' },
  eye_injury: { hi: 'आंख में चोट', hinglish: 'Aankh me chot' },
  mental_distress: { hi: 'मानसिक तनाव', hinglish: 'Mental distress' },
  pregnancy_concern: { hi: 'गर्भावस्था संबंधी दिक्कत', hinglish: 'Pregnancy related problem' },
  chronic_uncontrolled: { hi: 'बिगड़ती पुरानी बीमारी', hinglish: 'Bigadti purani bimari' },
  pregnancy_bleeding: { hi: 'गर्भावस्था आपातकाल', hinglish: 'Pregnancy emergency' },
  pregnancy_seizure: { hi: 'गर्भावस्था आपातकाल', hinglish: 'Pregnancy emergency' },
  head_injury_warning: { hi: 'सिर की चोट के खतरे के संकेत', hinglish: 'Head injury ke danger signs' },
  fever_meningism: { hi: 'बुखार के साथ गर्दन अकड़न या दाने', hinglish: 'Bukhar ke saath gardan akad ya daane' },
  bleeding_shock: { hi: 'खून की कमी से शॉक', hinglish: 'Khoon ki kami se shock' },
  burn_critical_area: { hi: 'गंभीर जलन', hinglish: 'Gambhir jalna' },
  fluid_loss_dehydration: { hi: 'पानी की कमी', hinglish: 'Paani ki kami' },
  chest_pain_free_order: { hi: 'सीने में दर्द', hinglish: 'Seene me dard' },
  breathing_difficulty_free_order: { hi: 'सांस लेने में परेशानी', hinglish: 'Saans lene me pareshani' },
  infant_fever: { hi: '3 महीने से छोटे शिशु को बुखार', hinglish: '3 mahine se chhote baby ko bukhar' },
  vital_spo2: { hi: 'ऑक्सीजन स्तर कम', hinglish: 'Oxygen level kam' },
  vital_bp: { hi: 'रक्तचाप असामान्य', hinglish: 'BP abnormal' },
  vital_temperature: { hi: 'तापमान बहुत अधिक', hinglish: 'Temperature bahut zyada' },
  vital_heartRate: { hi: 'नाड़ी असामान्य', hinglish: 'Pulse abnormal' },
  vital_glucose: { hi: 'शुगर असामान्य', hinglish: 'Sugar abnormal' }
};

const COPY = {
  emergency: {
    en: {
      title: 'Emergency warning',
      next: 'Do not wait for further chat. Call 112 or 108 now, or go to the nearest emergency facility. Do not drive yourself.',
      cta: 'Call emergency now'
    },
    hi: {
      title: 'आपातकालीन चेतावनी',
      next: 'चैट का इंतज़ार न करें। अभी 112 या 108 पर कॉल करें, या नज़दीकी इमरजेंसी जाएं। खुद गाड़ी न चलाएं।',
      cta: 'अभी इमरजेंसी कॉल करें'
    },
    hinglish: {
      title: 'Emergency warning',
      next: 'Chat ka wait mat kijiye. Abhi 112 ya 108 par call karein, ya nearest emergency facility jayein. Khud drive na karein.',
      cta: 'Abhi emergency call karein'
    }
  },
  urgent: {
    en: {
      title: 'Timely medical attention recommended',
      next: 'Arrange a same-day consultation. Go to an emergency department immediately if symptoms worsen or any red flag appears.',
      cta: 'Find urgent care'
    },
    hi: {
      title: 'समय पर चिकित्सा सलाह आवश्यक',
      next: 'आज ही डॉक्टर से मिलें। लक्षण बिगड़ें या कोई गंभीर संकेत दिखे तो तुरंत इमरजेंसी जाएं।',
      cta: 'Urgent care खोजें'
    },
    hinglish: {
      title: 'Timely medical attention recommended',
      next: 'Aaj hi doctor se consult karein. Symptoms worse hon ya koi red flag dikhe to turant emergency jayein.',
      cta: 'Urgent care dhoondhein'
    }
  },
  routine: {
    en: {
      title: 'Routine consultation guidance',
      next: 'No predefined red flag was detected. See a healthcare professional if symptoms continue, worsen, or concern you.',
      cta: 'Find a clinic'
    },
    hi: {
      title: 'सामान्य परामर्श मार्गदर्शन',
      next: 'कोई गंभीर संकेत नहीं मिला। लक्षण बने रहें या बिगड़ें तो डॉक्टर से मिलें।',
      cta: 'Clinic खोजें'
    },
    hinglish: {
      title: 'Routine consultation guidance',
      next: 'Koi red flag nahi mila. Symptoms continue ya worse hon to healthcare professional se milo.',
      cta: 'Clinic dhoondhein'
    }
  }
};

// --- Session memory --------------------------------------------------------
// A session escalates only. Once a red flag has been seen, a later reassuring
// message such as "ok thanks" can never lower the level — that reversal is the
// single most dangerous failure mode for a chat triage tool.

const sessions = new Map();

function sweepSessions() {
  const cutoff = Date.now() - config.triage.sessionTtlMs;
  for (const [id, session] of sessions) {
    if (session.updatedAt < cutoff) sessions.delete(id);
  }
  // Hard bound so a long-running server cannot leak memory.
  while (sessions.size > 5000) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) break;
    sessions.delete(oldest[0]);
  }
}

function getSession(sessionId) {
  if (!sessionId) return null;
  const existing = sessions.get(sessionId);
  if (!existing) return null;
  if (Date.now() - existing.updatedAt > config.triage.sessionTtlMs) {
    sessions.delete(sessionId);
    return null;
  }
  return existing;
}

function touchSession(sessionId, level, flags) {
  if (!sessionId) return;
  const existing = sessions.get(sessionId);
  const now = Date.now();
  if (existing) {
    existing.updatedAt = now;
    existing.level = LEVEL_RANK[level] >= LEVEL_RANK[existing.level] ? level : existing.level;
    for (const flag of flags) if (!existing.flags.includes(flag)) existing.flags.push(flag);
    existing.flagCount = existing.flags.length;
  } else {
    sweepSessions();
    sessions.set(sessionId, { id: sessionId, createdAt: now, updatedAt: now, level, flags: [...flags] });
  }
}

export function resetSession(sessionId) {
  if (sessionId) sessions.delete(sessionId);
}

export function getSessionState(sessionId) {
  return getSession(sessionId);
}

// --- Matching --------------------------------------------------------------

function matchRules(rules, canonicalText) {
  const hits = [];
  for (const rule of rules) {
    const matched = rule.matchers.find(m => m.match(canonicalText));
    if (!matched) continue;
    hits.push({
      id: rule.id,
      label: rule.label,
      level: rule.level,
      group: rule.group,
      evidence: truncate(matched.key, 60),
      negated: isNegated(canonicalText, matched.key)
    });
  }
  return hits;
}

function matchCombinationRules(canonicalText) {
  const hits = [];
  for (const rule of COMPILED_COMBOS) {
    const evidence = [];
    let satisfied = true;
    let denied = false;
    for (const group of rule.groups) {
      const hit = group.find(m => m.match(canonicalText));
      if (!hit) {
        satisfied = false;
        break;
      }
      if (isDenied(canonicalText, hit.key)) denied = true;
      evidence.push(hit.key);
    }
    if (!satisfied) continue;
    hits.push({
      id: rule.id,
      label: rule.label,
      level: rule.level,
      group: rule.group,
      evidence: truncate(evidence.join(' + '), 60),
      negated: denied,
      combined: true
    });
  }
  return hits;
}

function matchSites(canonicalText) {
  return COMPILED_SITES
    .filter(site => site.matchers.some(m => m.match(canonicalText)))
    .map(site => site.label);
}

function buildContext(canonicalText) {
  return {
    thirdPerson: COMPILED_THIRD_PERSON.some(m => m(canonicalText)),
    pregnancy: COMPILED_PREGNANCY.some(m => m(canonicalText)),
    infant: COMPILED_INFANT.some(m => m(canonicalText)),
    child: COMPILED_CHILD.some(m => m(canonicalText)),
    elderly: COMPILED_ELDERLY.some(m => m(canonicalText))
  };
}

// Any fever in a baby under 3 months is an emergency regardless of how mild it
// looks, because serious bacterial infection cannot be ruled out at home. The rule
// is age-driven rather than phrase-driven so "2 mahine ka beta, bukhar 100" is
// caught even though it contains no recognised danger phrase.
function infantFeverRule(canonicalText, context, vitals, age) {
  const infantByAge = age !== null && age.months < 3;
  const infantByContext = context.infant && age === null;
  if (!infantByAge && !infantByContext) return null;

  const temperature = vitals.temperature?.celsius ?? null;
  const feverMentioned = COMPILED_FEVER_WORD.some(m => m(canonicalText));
  const isFever = temperature !== null ? temperature >= 38 : feverMentioned;
  if (!isFever) return null;

  return {
    id: 'infant_fever',
    label: 'Fever in an infant under 3 months',
    level: 'emergency',
    group: 'pediatric',
    evidence: age ? age.text : 'young infant',
    negated: false,
    rule: 'age-threshold'
  };
}

function localLabel(id, label, language) {
  const entry = FLAG_LABELS[id];
  if (entry && entry[language]) return entry[language];
  return label;
}

// A standalone rule and a combination rule can describe the same finding (e.g.
// "Pregnancy emergency"). Keep the first — standalone hits carry richer evidence.
function dedupeByLabel(hits) {
  const seen = new Set();
  return hits.filter(hit => {
    if (seen.has(hit.label)) return false;
    seen.add(hit.label);
    return true;
  });
}

function emergencyContactsFor(level, crisis) {
  const all = emergencyData.contacts;
  if (level !== 'emergency') {
    return all.filter(c => ['medical_advice', 'ambulance'].includes(c.category)).slice(0, 3);
  }
  const wanted = crisis ? ['mental_health', 'emergency'] : ['emergency', 'ambulance'];
  const filtered = all.filter(c => wanted.includes(c.category));
  return (filtered.length ? filtered : all).sort((a, b) => a.priority - b.priority).slice(0, 4);
}

// Combination and age-based rule ids reuse the first-aid copy of the finding they
// describe, so the safety text stays maintained in exactly one place.
const FIRST_AID_ALIAS = {
  pregnancy_bleeding: 'pregnancy_emergency',
  pregnancy_seizure: 'pregnancy_emergency',
  head_injury_warning: 'head_injury',
  fever_meningism: 'meningism',
  bleeding_shock: 'severe_bleeding',
  burn_critical_area: 'severe_burns',
  fluid_loss_dehydration: 'default',
  infant_fever: 'infant_danger'
};

function firstAidFor(flagIds, language) {
  // Only English first-aid copy is maintained; it is clinically reviewed text and
  // translating it ad hoc would risk a mistranslation in a safety-critical block.
  const map = emergencyData.firstAid.en;
  const steps = [];
  for (const rawId of flagIds) {
    const id = FIRST_AID_ALIAS[rawId] || rawId;
    if (map[id] && !steps.includes(map[id])) steps.push(map[id]);
  }
  if (!steps.length) steps.push(map.default);
  return { language: 'en', steps: steps.slice(0, 3) };
}

// --- Public API ------------------------------------------------------------

export function assessRisk(text, options = {}) {
  const language = ['en', 'hi', 'hinglish'].includes(options.language) ? options.language : 'en';
  const canonicalText = canonicalize(text);
  const evaluatedAt = new Date().toISOString();

  const redHits = matchRules(COMPILED_RED, canonicalText);
  const crisisHits = matchRules(COMPILED_CRISIS, canonicalText);
  const urgentHits = matchRules(COMPILED_URGENT, canonicalText);

  const context = buildContext(canonicalText);
  const age = extractAge(text);
  const vitals = parseVitals(text);

  // Word-order-independent rules. They can land at either level, so split them.
  const comboHits = matchCombinationRules(canonicalText);
  const infantHit = infantFeverRule(canonicalText, context, vitals, age);

  const emergencyHits = [
    ...redHits,
    ...comboHits.filter(h => h.level === 'emergency'),
    ...(infantHit ? [infantHit] : [])
  ];
  const allUrgentHits = [...urgentHits, ...comboHits.filter(h => h.level === 'urgent')];

  // Negation is honoured only when nothing else escalated. See lib/text.js.
  const activeRed = emergencyHits.filter(h => !h.negated);
  const activeCrisis = crisisHits.filter(h => !h.negated);
  const suppressedRed = [...emergencyHits, ...crisisHits].filter(h => h.negated);

  const vitalAlerts = assessVitals(vitals, {
    ...context,
    // An explicitly stated age overrides keyword guesses like "baby".
    infant: age ? age.months < 3 : context.infant
  });

  const emergencyVitalAlerts = vitalAlerts.filter(a => a.level === 'emergency');
  const urgentVitalAlerts = vitalAlerts.filter(a => a.level === 'urgent');

  const vitalFlags = vitalAlerts.map(alert => ({
    id: `vital_${alert.metric}`,
    label: alert.label,
    level: alert.level,
    group: 'vitals',
    evidence: String(alert.value),
    negated: false,
    advice: alert.advice
  }));

  const isEmergency = Boolean(activeRed.length || activeCrisis.length || emergencyVitalAlerts.length);
  const isUrgent = Boolean(allUrgentHits.length || urgentVitalAlerts.length);
  let level = isEmergency ? 'emergency' : isUrgent ? 'urgent' : 'routine';

  const activeHits = dedupeByLabel([...activeCrisis, ...activeRed, ...allUrgentHits, ...vitalFlags]);

  // Session escalation.
  const prior = getSession(options.sessionId);
  let escalatedFromSession = false;
  let sessionFlags = [];
  if (prior) {
    sessionFlags = prior.flags.filter(f => !activeHits.some(h => h.label === f));
    if (LEVEL_RANK[prior.level] > LEVEL_RANK[level]) {
      level = prior.level;
      escalatedFromSession = true;
    }
  }

  const flags = [...new Set([...activeHits.map(h => h.label), ...sessionFlags])];
  const crisis = activeCrisis.length > 0;

  touchSession(options.sessionId, level, flags);

  const copy = COPY[level][language];
  const duration = extractDuration(text);
  const symptoms = flags.length
    ? flags
    : canonicalText
      ? [truncate(String(text).trim(), 140)]
      : [];

  const explanationParts = [];
  if (flags.length) {
    explanationParts.push(
      level === 'emergency'
        ? `${flags.map(f => f).join(', ')} — detected.`
        : `${flags.join(', ')} — may need prompt professional assessment.`
    );
  } else {
    explanationParts.push(
      level === 'routine'
        ? 'No predefined emergency red flag was detected in this safety check.'
        : 'Recorded values are outside the expected range.'
    );
  }
  if (escalatedFromSession) {
    explanationParts.push(
      language === 'hi'
        ? 'इस सत्र में पहले मिले गंभीर संकेत सुरक्षा हेतु बने हुए हैं।'
        : language === 'hinglish'
          ? 'Is session me pehle mile serious signs safety ke liye retained hain.'
          : 'An earlier red flag in this session is retained for safety and cannot be cleared by a later message.'
    );
  }
  if (suppressedRed.length && level === 'routine') {
    explanationParts.push(
      language === 'hi'
        ? 'कुछ वाक्य नकारात्मक रूप में थे, इसलिए गंभीर नहीं माने गए।'
        : language === 'hinglish'
          ? 'Kuch phrases negative form me the, isliye unhe serious nahi maana gaya.'
          : 'Some phrases appeared negated, so they were not escalated. If in doubt, treat them as real.'
    );
  }

  const result = {
    level,
    title: copy.title,
    explanation: explanationParts.join(' '),
    next: copy.next,
    flags,
    language,
    localized: {
      level: copy.title,
      callToAction: copy.cta,
      title: copy.title,
      explanation: explanationParts.join(' '),
      next: copy.next
    },
    flagsDetail: activeHits.map(h => ({
      id: h.id,
      label: h.label,
      labelLocal: localLabel(h.id, h.label, language),
      level: h.level,
      group: h.group,
      evidence: h.evidence,
      advice: h.advice || null
    })),
    negatedFlags: suppressedRed.map(h => ({
      id: h.id,
      label: h.label,
      evidence: h.evidence,
      note: 'Phrase appeared in a negated context; not escalated. Treat as real if uncertain.'
    })),
    structured: {
      symptoms,
      duration: duration ? duration.text : 'Not provided',
      durationDetail: duration,
      age: age ? age.text : null,
      ageDetail: age,
      bodySites: matchSites(canonicalText),
      vitals,
      vitalAlerts,
      context,
      language,
      freeText: truncate(String(text ?? ''), 600)
    },
    emergency: {
      required: level === 'emergency',
      crisis,
      contacts: emergencyContactsFor(level, crisis),
      whatToSay: emergencyData.whatToSay[language] || emergencyData.whatToSay.en,
      firstAid: level === 'emergency' ? firstAidFor(activeHits.map(h => h.id), language) : null
    },
    safety: {
      engineVersion: config.triage.engineVersion,
      deterministic: true,
      evaluatedAt,
      escalatedFromSession,
      sessionId: options.sessionId || null,
      isDiagnosis: false
    }
  };

  return result;
}

// Convenience wrapper kept for the original single-shot endpoint shape.
export function assessRiskLegacy(text) {
  const full = assessRisk(text);
  return {
    level: full.level,
    title: full.title,
    explanation: full.explanation,
    next: full.next,
    flags: full.flags
  };
}

export const engineVersion = config.triage.engineVersion;
export default { assessRisk, assessRiskLegacy, resetSession, getSessionState, engineVersion };
