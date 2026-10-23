import crypto from 'node:crypto';
import config from '../config.js';
import { logger } from '../lib/http.js';
import { truncate } from '../lib/text.js';
import { assessRisk, resetSession } from './triage.js';

// Conversation layer.
//
// The reply text may come from an LLM when one is configured, but the safety
// verdict never does. `triage` is always produced by the deterministic engine and
// is returned alongside the reply, so a model hallucination can reword guidance but
// cannot downgrade an emergency. That split is the whole point of this module.

const conversations = new Map();

function sweep() {
  const cutoff = Date.now() - config.triage.sessionTtlMs;
  for (const [id, convo] of conversations) {
    if (convo.updatedAt < cutoff) conversations.delete(id);
  }
  while (conversations.size > 5000) {
    const oldest = [...conversations.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0];
    if (!oldest) break;
    conversations.delete(oldest[0]);
  }
}

function messageId() {
  return `MSG-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

export function createSession(language = 'hinglish') {
  sweep();
  const id = `SES-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const now = Date.now();
  conversations.set(id, {
    id,
    language,
    createdAt: now,
    updatedAt: now,
    messages: [],
    highestLevel: 'routine'
  });
  return { sessionId: id, language };
}

function getConversation(sessionId) {
  const convo = conversations.get(sessionId);
  if (!convo) return null;
  if (Date.now() - convo.updatedAt > config.triage.sessionTtlMs) {
    conversations.delete(sessionId);
    return null;
  }
  return convo;
}

export function listSessions() {
  return [...conversations.values()].map(c => ({
    sessionId: c.id,
    language: c.language,
    messageCount: c.messages.length,
    highestLevel: c.highestLevel,
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString()
  }));
}

export function clearSession(sessionId) {
  conversations.delete(sessionId);
  resetSession(sessionId);
  return { cleared: true, sessionId };
}

// --- Deterministic reply composition --------------------------------------

const GREETING = {
  en: 'Hello. Please describe the health concern in your own words. You can type or use the microphone.',
  hi: 'नमस्ते। अपनी स्वास्थ्य समस्या अपने शब्दों में बताएं। आप टाइप कर सकते हैं या माइक का उपयोग कर सकते हैं।',
  hinglish: 'Namaste. Apni health problem apne words mein bataiye. Aap type kar sakte hain ya mic use kar sakte hain.'
};

const EMERGENCY_REPLY = {
  en: (flags, contacts) =>
    `STOP. I found possible emergency signs: ${flags}. Please do not continue chatting for help. ` +
    `Call ${contacts} right now, or go to the nearest emergency department. Do not drive yourself. ` +
    `If someone is with you, ask them to make the call while you stay with the person.`,
  hi: (flags, contacts) =>
    `रुकिए। मुझे संभावित आपात संकेत मिले हैं: ${flags}। कृपया मदद के लिए चैट जारी न रखें। ` +
    `अभी ${contacts} पर कॉल करें या नज़दीकी इमरजेंसी विभाग जाएं। खुद गाड़ी न चलाएं। ` +
    `यदि कोई आपके साथ है तो उनसे कॉल करने को कहें और आप मरीज़ के पास रहें।`,
  hinglish: (flags, contacts) =>
    `Rukiye. Mujhe possible emergency signs mile hain: ${flags}. Please help ke liye chat continue na karein. ` +
    `Abhi ${contacts} par call karein ya nearest emergency department jayein. Khud drive na karein. ` +
    `Agar koi aapke saath hai to unhe call karne ko kahein aur aap patient ke paas rahein.`
};

const URGENT_REPLY = {
  en: (flags, question) =>
    `I noted ${flags}. This is not a diagnosis, but it does need prompt professional review — ideally today. ` +
    `${question} If any emergency sign appears (chest pain, breathlessness, fainting, severe bleeding, one-sided weakness), go to an emergency department immediately.`,
  hi: (flags, question) =>
    `मैंने ${flags} दर्ज किया है। यह निदान नहीं है, लेकिन इसकी समय पर डॉक्टरी जांच ज़रूरी है — आदर्श रूप से आज ही। ` +
    `${question} यदि कोई गंभीर संकेत दिखे (सीने में दर्द, सांस की तकलीफ़, बेहोशी, बहुत खून, एक तरफ़ कमजोरी) तो तुरंत इमरजेंसी जाएं।`,
  hinglish: (flags, question) =>
    `Maine ${flags} note kiya hai. Ye diagnosis nahi hai, lekin iske liye prompt professional review zaroori hai — ideally aaj hi. ` +
    `${question} Agar koi emergency sign dikhe (seene me dard, saans me takleef, behoshi, bahut khoon, ek taraf kamzori) to turant emergency jayein.`
};

const ROUTINE_REPLY = {
  en: (question) =>
    `Thank you. I did not find any predefined red-flag emergency sign in what you described. This is general information, not a diagnosis. ` +
    `${question} See a healthcare professional if it continues, worsens, or worries you.`,
  hi: (question) =>
    `धन्यवाद। आपने जो बताया उसमें मुझे कोई गंभीर आपात संकेत नहीं मिला। यह सामान्य जानकारी है, निदान नहीं। ` +
    `${question} यदि यह बना रहे, बिगड़े या चिंता करे तो डॉक्टर से मिलें।`,
  hinglish: (question) =>
    `Thank you. Aapne jo bataya usme mujhe koi red-flag emergency sign nahi mila. Ye general information hai, diagnosis nahi. ` +
    `${question} Agar ye continue rahe, worse ho, ya tension ho to healthcare professional se miliye.`
};

const QUESTIONS = {
  duration: {
    en: 'How long has this been going on — minutes, hours or days?',
    hi: 'यह कब से हो रहा है — मिनट, घंटे या दिन?',
    hinglish: 'Ye kab se ho raha hai — minutes, hours ya days?'
  },
  vitals: {
    en: 'If you have any readings — blood pressure, oxygen level (SpO2), temperature or sugar — please type them, for example "BP 160/100, SpO2 94".',
    hi: 'यदि कोई रीडिंग है — ब्लड प्रेशर, ऑक्सीजन (SpO2), तापमान या शुगर — तो लिखें, जैसे "BP 160/100, SpO2 94"।',
    hinglish: 'Agar koi reading hai — BP, oxygen (SpO2), temperature ya sugar — to type karein, jaise "BP 160/100, SpO2 94".'
  },
  consciousness: {
    en: 'Is the person fully awake, able to speak normally, and breathing comfortably right now?',
    hi: 'क्या व्यक्ति अभी पूरी तरह होश में है, सामान्य रूप से बोल पा रहा है और आराम से सांस ले रहा है?',
    hinglish: 'Kya person abhi poori tarah conscious hai, normally bol pa raha hai aur aaram se saans le raha hai?'
  },
  infantAge: {
    en: 'How old is the baby — days, weeks or months?',
    hi: 'बच्चे की उम्र कितनी है — दिन, हफ़्ते या महीने?',
    hinglish: 'Baby ki age kitni hai — days, weeks ya months?'
  },
  pregnancyWeeks: {
    en: 'How many weeks pregnant is she, and is she under regular antenatal check-up?',
    hi: 'वह कितने हफ़्ते की गर्भवती हैं और क्या नियमित जांच हो रही है?',
    hinglish: 'Wo kitne weeks pregnant hai aur regular check-up ho raha hai?'
  },
  severity: {
    en: 'On a scale of 0 to 10, how severe is it, and is it getting worse, better or staying the same?',
    hi: '0 से 10 तक, यह कितना गंभीर है, और बढ़ रहा है, कम हो रहा है या वैसा ही है?',
    hinglish: '0 se 10 tak, ye kitna severe hai, aur badh raha hai, kam ho raha hai ya same hai?'
  },
  medicines: {
    en: 'Are there any current medicines, allergies or ongoing conditions like diabetes or high BP?',
    hi: 'क्या कोई चल रही दवा, एलर्जी या बीमारी जैसे शुगर या हाई बीपी है?',
    hinglish: 'Koi current dawa, allergy ya ongoing condition jaise sugar ya high BP hai?'
  }
};

function pickQuestions(triage, lang) {
  const chosen = [];
  const { structured } = triage;
  const hasDuration = Boolean(structured.durationDetail);
  const hasVitals = Object.values(structured.vitals).some(v => v !== null);

  const candidate = (key, condition) => {
    if (condition) chosen.push(key);
  };

  candidate('consciousness', structured.context.thirdPerson);
  candidate('infantAge', structured.context.infant);
  candidate('pregnancyWeeks', structured.context.pregnancy);
  candidate('duration', !hasDuration);
  candidate('vitals', !hasVitals && triage.level !== 'routine');
  candidate('severity', true);
  candidate('medicines', chosen.length < 2);

  return chosen.slice(0, 2).map(k => QUESTIONS[k][lang] || QUESTIONS[k].en).join(' ');
}

// An LLM reply that tries to soften an emergency is refused outright.
const DOWNGRADE_PATTERNS = [
  /you are (probably )?(fine|okay|ok)\b/i,
  /nothing to worry/i,
  /no need (to|for) (see a doctor|go to hospital|call)/i,
  /wait and watch/i,
  /aap (bilkul )?(theek|thik) hain/i,
  /chinta ki (koi )?baat nahi/i,
  /doctor ke paas jaane ki zaroorat nahi/i
];

function isUnsafeLlmReply(text, level) {
  if (level !== 'emergency' && level !== 'urgent') return false;
  return DOWNGRADE_PATTERNS.some(re => re.test(text || ''));
}

async function callLlm({ language, history, triage }) {
  if (!config.llm.enabled || !config.llm.apiKey) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);

  const system = [
    'You are JeevanSetu, a care-navigation assistant for India. You are NOT a doctor and must never diagnose, prescribe or claim certainty.',
    'Reply in the user language: ' + language + '. Keep it under 70 words, warm, plain language, no markdown.',
    'A separate deterministic safety engine has already classified this message. Its verdict is authoritative and you must NOT contradict, soften or downgrade it.',
    'SAFETY VERDICT: ' + triage.level.toUpperCase(),
    'FLAGS: ' + (triage.flags.join('; ') || 'none'),
    'MANDATORY NEXT STEP: ' + triage.next,
    'Ask at most one clarifying question that helps the person reach care faster.'
  ].join('\n');

  try {
    // Detect API provider from base URL
    const isOpenRouter = config.llm.baseUrl.includes('openrouter.ai');
    const url = `${config.llm.baseUrl.replace(/\/$/, '')}/chat/completions`;

    logger.info('llm call starting', { 
      model: config.llm.model, 
      baseUrl: config.llm.baseUrl,
      provider: isOpenRouter ? 'OpenRouter' : 'Other',
      timeoutMs: config.llm.timeoutMs 
    });

    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.llm.apiKey}`,
        accept: 'application/json'
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.2,
        max_tokens: 220,
        messages: [
          { role: 'system', content: system },
          ...history.slice(-8).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: truncate(m.text, 1200) }))
        ]
      })
    });
    
    const elapsed = Date.now() - startTime;
    logger.info('llm response received', { status: response.status, elapsedMs: elapsed });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      logger.warn('llm request failed', { 
        status: response.status, 
        error: errorText.substring(0, 500),
        elapsedMs: elapsed 
      });
      return null;
    }
    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) {
      logger.warn('llm returned empty response', { data: JSON.stringify(data).substring(0, 200) });
      return null;
    }
    if (isUnsafeLlmReply(text, triage.level)) {
      logger.warn('llm reply rejected by safety guard', { level: triage.level });
      return null;
    }
    logger.info('llm reply accepted', { textLength: text.length });
    return truncate(text, 900);
  } catch (error) {
    logger.warn('llm call error, falling back to deterministic reply', { 
      error: error.message,
      errorType: error.constructor.name,
      stack: error.stack?.substring(0, 300)
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function composeDeterministicReply(triage, lang) {
  const level = triage.level;
  // Prefer the localized flag labels; fall back to plain labels if detail is absent.
  const namedFlags = (triage.flagsDetail.length
    ? triage.flagsDetail
    : triage.flags.map(f => ({ label: f, labelLocal: f })))
    .slice(0, 3)
    .map(f => (lang === 'en' ? f.label : f.labelLocal || f.label))
    .join(', ');

  if (level === 'emergency') {
    const contacts = triage.emergency.contacts.slice(0, 2).map(c => c.number).join(' or ');
    const base = EMERGENCY_REPLY[lang](namedFlags || 'serious symptoms', contacts);
    const firstAid = triage.emergency.firstAid?.steps?.[0];
    return firstAid ? `${base}\n\nUntil help arrives: ${firstAid}` : base;
  }

  const question = pickQuestions(triage, lang);

  if (level === 'urgent') {
    return URGENT_REPLY[lang](namedFlags || 'the symptoms you described', question);
  }

  return ROUTINE_REPLY[lang](question);
}

/**
 * Handle one user turn.
 * @param {object} input
 * @param {string} [input.sessionId]
 * @param {string} input.text
 * @param {'en'|'hi'|'hinglish'} [input.language]
 */
export async function handleUserMessage(input) {
  const lang = ['en', 'hi', 'hinglish'].includes(input.language) ? input.language : 'hinglish';
  let sessionId = input.sessionId;
  let created = false;

  if (!sessionId || !getConversation(sessionId)) {
    sessionId = createSession(lang).sessionId;
    created = true;
  }

  const convo = getConversation(sessionId);
  convo.language = lang;
  convo.updatedAt = Date.now();

  const userMessage = {
    id: messageId(),
    sender: 'user',
    text: truncate(String(input.text || ''), config.maxTextLength),
    time: new Date().toISOString()
  };
  convo.messages.push(userMessage);

  // Trim to the tail so an unbounded conversation cannot grow the prompt forever.
  if (convo.messages.length > config.triage.maxSessionMessages * 2) {
    convo.messages = convo.messages.slice(-config.triage.maxSessionMessages);
  }

  // Safety assessment runs over the whole conversation, not just the last turn,
  // and escalates only within the session.
  const fullText = convo.messages.filter(m => m.sender === 'user').map(m => m.text).join('. ');
  const triage = assessRisk(fullText, { language: lang, sessionId });

  const LEVEL_RANK = { routine: 0, urgent: 1, emergency: 2 };
  if (LEVEL_RANK[triage.level] > LEVEL_RANK[convo.highestLevel]) convo.highestLevel = triage.level;

  const deterministic = composeDeterministicReply(triage, lang);
  const llmText = await callLlm({ language: lang, history: convo.messages, triage });

  const assistantText = llmText || deterministic;
  const assistantMessage = {
    id: messageId(),
    sender: 'assistant',
    text: assistantText,
    time: new Date().toISOString(),
    source: llmText ? 'llm+rules' : 'rules',
    level: triage.level
  };
  convo.messages.push(assistantMessage);
  convo.updatedAt = Date.now();

  return {
    sessionId,
    sessionCreated: created,
    messages: convo.messages.slice(-40),
    reply: assistantMessage,
    triage,
    highestLevel: convo.highestLevel,
    greeting: GREETING[lang]
  };
}

export function getGreeting(language = 'hinglish') {
  const lang = ['en', 'hi', 'hinglish'].includes(language) ? language : 'hinglish';
  return {
    sessionId: null,
    message: { id: messageId(), sender: 'assistant', text: GREETING[lang], time: new Date().toISOString(), source: 'static' }
  };
}

export function llmStatus() {
  return {
    enabled: config.llm.enabled,
    model: config.llm.enabled ? config.llm.model : null,
    note: config.llm.enabled
      ? 'An LLM may phrase replies, but the deterministic safety engine always decides the risk level.'
      : 'No LLM configured. Replies are generated by the built-in deterministic engine — the demo works fully offline.'
  };
}

export default { handleUserMessage, createSession, clearSession, listSessions, getGreeting, llmStatus };
