import { canonicalize, compileMatcher } from '../lib/text.js';

// Medical-payment / impersonation scam detector.
//
// Weighted rather than binary: a lone "OTP" in a genuine hospital message should
// not scream fraud, but "OTP + urgent payment + unknown link" is the textbook
// pattern seen in Indian medical-payment scams.

const RULES = [
  {
    id: 'otp_request',
    label: 'Asks for an OTP',
    weight: 30,
    keys: ['otp', 'one time password', 'share the otp', 'enter otp', 'ओटीपी', 'otp bhejo', 'otp batao']
  },
  {
    id: 'upi_pin',
    label: 'Asks for a UPI PIN or card PIN',
    weight: 34,
    keys: ['upi pin', 'upi id', 'pin number', 'atm pin', 'card pin', 'cvv', 'cvv number', 'यूपीआई पिन', 'pin batao', 'pin daalo']
  },
  {
    id: 'card_details',
    label: 'Asks for card or bank credentials',
    weight: 34,
    keys: [
      'card number', 'debit card details', 'credit card details', 'net banking password',
      'account password', 'bank password', 'expiry date and cvv', 'aadhaar number', 'pan number',
      'कार्ड नंबर', 'card details bhejo', 'account details share'
    ]
  },
  {
    id: 'urgent_payment',
    label: 'Pressure to pay immediately',
    weight: 26,
    keys: [
      'pay immediately', 'urgent payment', 'pay now', 'pay within', 'immediate payment required',
      'payment required urgently', 'last chance to pay', 'pay before', 'pending payment urgent',
      'तुरंत भुगतान', 'turant payment', 'abhi payment karo', 'jaldi payment', 'aaj hi pay karo'
    ]
  },
  {
    id: 'unknown_link',
    label: 'Directs to an unknown link',
    weight: 22,
    keys: [
      'click this link', 'click the link', 'tap this link', 'open this link', 'follow the link',
      'link par click', 'install this app', 'download this app', 'scan the code',
      'इस लिंक पर क्लिक', 'link pe click karo', 'ye link kholo'
    ]
  },
  {
    id: 'remote_access',
    label: 'Requests remote access to your device',
    weight: 40,
    keys: [
      'anydesk', 'teamviewer', 'quick support', 'rustdesk', 'remote access', 'share your screen',
      'install remote app', 'screen share karo', 'remote se help karte'
    ]
  },
  {
    id: 'treatment_threat',
    label: 'Threatens treatment, discharge or account',
    weight: 30,
    keys: [
      'treatment will be cancelled', 'treatment cancelled', 'patient will be discharged',
      'discharge the patient', 'account will be blocked', 'admission cancelled', 'surgery will be cancelled',
      'operation cancel', 'report blocked', 'इलाज बंद', 'ilaj band kar denge', 'discharge kar denge',
      'account block ho jayega', 'mariz ko nikal denge'
    ]
  },
  {
    id: 'impersonation',
    label: 'Impersonates a hospital, insurer or official',
    weight: 18,
    keys: [
      'hospital administration', 'hospital billing department', 'medical department',
      'insurance department', 'insurance claim desk', 'kyc update', 'kyc pending',
      'ayushman card update', 'health card blocked', 'govt refund', 'government scheme refund',
      'अस्पताल प्रशासन', 'hospital se bol rahe', 'insurance company se', 'kyc karwao'
    ]
  },
  {
    id: 'secrecy',
    label: 'Asks you to keep it secret or act fast',
    weight: 20,
    keys: [
      'do not tell anyone', 'dont tell anyone', 'keep it confidential', 'do not inform the hospital',
      'secret code', 'only you can do this', 'kisi ko batana mat', 'kisi ko mat batana',
      'confidential rakho', 'family ko mat batao'
    ]
  },
  {
    id: 'too_good',
    label: 'Unexpected refund, prize or waiver',
    weight: 24,
    keys: [
      'you have won', 'congratulations you won', 'lottery', 'refund approved', 'refund credited',
      'free treatment prize', 'claim your refund', 'winner', 'prize money',
      'aap jeet gaye', 'refund aa gaya', 'lottery lag gayi', 'free me ilaj'
    ]
  },
  {
    id: 'unusual_payee',
    label: 'Payment to a personal account or QR code',
    weight: 28,
    keys: [
      'pay to my personal account', 'transfer to this upi', 'scan this qr', 'scan qr code',
      'pay to google pay number', 'send to my phonepe', 'personal account me daalo',
      'qr scan karo', 'isi upi pe bhejo', 'mere account me transfer'
    ]
  }
];

const COMPILED = RULES.map(rule => ({
  ...rule,
  matchers: rule.keys.map(key => ({ key, match: compileMatcher(key) }))
}));

// Combination rules. Scam wording is rarely contiguous — "your admission will be
// cancelled" contains no phrase like "admission cancelled". Fire only when every
// group matches (any key within a group satisfies it), which keeps precision while
// tolerating word order and intervening words.
const COMBOS = [
  {
    id: 'treatment_threat_combo',
    label: 'Threatens treatment, discharge or account',
    weight: 30,
    allOf: [
      ['admission', 'treatment', 'ilaj', 'discharge', 'surgery', 'operation', 'report', 'account', 'card', 'appointment', 'bed'],
      ['cancel', 'cancelled', 'canceled', 'block', 'blocked', 'stop', 'band', 'rokh', 'nikal', 'deny', 'denied', 'reject']
    ]
  },
  {
    id: 'payment_pressure_combo',
    label: 'Pressure to pay immediately',
    weight: 26,
    allOf: [
      ['pay', 'payment', 'paisa', 'paise', 'transfer', 'bhugtan', 'bhejo', 'recharge', 'settle'],
      ['now', 'abhi', 'turant', 'immediately', 'jaldi', 'within', 'today', 'aaj', 'urgent', 'last', 'deadline']
    ]
  },
  {
    id: 'impersonation_combo',
    label: 'Impersonates a hospital, insurer or official',
    weight: 18,
    allOf: [
      ['hospital', 'aspatal', 'medical', 'clinic', 'insurance', 'ayushman', 'bank', 'government', 'sarkar', 'department', 'dept', 'administration', 'billing', 'office'],
      ['billing', 'department', 'dept', 'administration', 'team', 'office', 'manager', 'executive', 'claim', 'refund', 'update', 'verify', 'pending', 'head']
    ]
  },
  {
    id: 'verification_pressure_combo',
    label: 'Demands immediate verification of personal details',
    weight: 24,
    allOf: [
      ['verify', 'verification', 'update', 'kyc', 'confirm', 'validate', 'unblock', 'reactivate'],
      ['aadhaar', 'pan', 'account', 'card', 'number', 'details', 'password', 'pin', 'otp', 'document']
    ]
  }
];

const COMPILED_COMBOS = COMBOS.map(combo => ({
  ...combo,
  groups: combo.allOf.map(alternatives => alternatives.map(key => ({ key, match: compileMatcher(key) })))
}));

function matchCombos(canonical) {
  const hits = [];
  for (const combo of COMPILED_COMBOS) {
    const evidence = [];
    let satisfied = true;
    for (const group of combo.groups) {
      const hit = group.find(m => m.match(canonical));
      if (!hit) { satisfied = false; break; }
      evidence.push(hit.key);
    }
    if (satisfied) {
      hits.push({ id: combo.id, label: combo.label, weight: combo.weight, evidence: evidence.join(' + ') });
    }
  }
  return hits;
}

// Structural signals — patterns that are scams regardless of wording.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']{4,}/gi;
const SHORTLINK_RE = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|cutt\.ly|rb\.gy|reurl\.cc|shorturl\.at)\/\S+/gi;
const SUSPICIOUS_TLD_RE = /\.[a-z]{2,}\b/i;
const TRUSTED_TLD = /\.(gov\.in|nic\.in|aiims\.edu|\.edu|\.ac\.in|org)$/i;
const PHONE_RE = /(?:\+91[\s-]?)?(?:\b[6-9]\d{9}\b|\b0?\d{2,4}[\s-]?\d{6,8}\b)/g;
const UPI_ID_RE = /\b[\w.\-]{2,}@[a-z]{2,}\b/gi;
const QR_RE = /\bqr\s*code\b|\bscan\s*qr\b/i;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g;
const CURRENCY_RE = /(?:rs\.?|₹|inr)\s*\d[\d,]*(?:\.\d+)?/gi;
const FREE_PHONE = new Set(['112', '108', '102', '100', '101', '104', '14416', '1098', '181', '1910', '1033', '1075']);

function analyzeStructure(text) {
  const findings = [];
  const urls = [...new Set(text.match(URL_RE) || [])];
  const shortlinks = [...new Set(text.match(SHORTLINK_RE) || [])];
  const upiIds = [...new Set(text.match(UPI_ID_RE) || [])].filter(id => !/gmail|yahoo|outlook|rediff/i.test(id));
  const phones = [...new Set(text.match(PHONE_RE) || [])];
  const emails = [...new Set(text.match(EMAIL_RE) || [])];
  const amounts = [...new Set(text.match(CURRENCY_RE) || [])];
  const hasQr = QR_RE.test(text);

  const untrustedUrls = urls.filter(u => !TRUSTED_TLD.test(u));

  if (shortlinks.length) {
    findings.push({ id: 'shortened_link', label: 'Uses a URL shortener to hide the destination', weight: 24, evidence: shortlinks[0] });
  } else if (untrustedUrls.length) {
    findings.push({ id: 'unknown_url', label: 'Contains a non-government / unfamiliar web link', weight: 16, evidence: untrustedUrls[0] });
  }
  if (upiIds.length) {
    findings.push({ id: 'upi_id', label: 'Contains a UPI ID to transfer money to', weight: 22, evidence: upiIds[0] });
  }
  if (hasQr) {
    findings.push({ id: 'qr_code', label: 'Asks you to scan a QR code', weight: 20, evidence: 'QR code' });
  }
  const nonHelplinePhones = phones.filter(p => !FREE_PHONE.has(p.replace(/\D/g, '').slice(-10)) && !FREE_PHONE.has(p.replace(/\D/g, '')));
  if (nonHelplinePhones.length && (amounts.length || upiIds.length)) {
    findings.push({ id: 'callback_number', label: 'Gives a call-back number alongside a payment demand', weight: 14, evidence: nonHelplinePhones[0] });
  }
  if (amounts.length && /immediate|urgent|now|within|abhi|turant|jaldi/i.test(text)) {
    findings.push({ id: 'amount_pressure', label: 'States a specific amount with time pressure', weight: 18, evidence: amounts[0] });
  }
  if (emails.length && !/@(?:gov\.in|nic\.in|hospital|aiims)/i.test(emails[0])) {
    findings.push({ id: 'free_email', label: 'Contact address is a personal/free email domain', weight: 12, evidence: emails[0] });
  }

  return { findings, urls, shortlinks, upiIds, phones: nonHelplinePhones, emails, amounts, hasQr };
}

// Mask anything a victim could accidentally leak in a screenshot.
export function redactSecrets(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD-NUMBER]')
    .replace(/\b\d{3}\s*(?:cvv|CVV)|\bcvv\s*:?\s*\d{3,4}\b/g, '[CVV]')
    .replace(/(?<![a-z0-9])(?:otp|ओटीपी)\s*(?:is|:)?\s*\d{4,8}(?!\d)/gi, 'OTP [REDACTED]')
    .replace(/(?<![a-z0-9])(?:upi\s*)?(?:pin|mpin|पिन)\s*(?:is|:)?\s*\d{4,6}(?!\d)/gi, 'PIN [REDACTED]')
    .replace(/\b\d{4,8}\b(?=\s*(?:is your|is the)?\s*(?:otp|ओटीपी))/gi, '[REDACTED]')
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]{2,}\b/g, '[EMAIL]')
    .replace(/\b(?:\+91[\s-]?)?[6-9]\d{9}\b/g, '[PHONE]')
    .replace(/\b[\w.-]{2,}@(?:okaxis|okicici|okhdfcbank|ybl|paytm|apl|upi|ibl|axl|sbi|barodampay|kaypay|fbl|pur|jup|timecosmos)\b/gi, '[UPI-ID]')
    .replace(/\b\d{12}\b/g, '[AADHAAR-LIKE]');
}

const ADVICE = {
  en: [
    'Never share an OTP, UPI PIN, CVV, card number, Aadhaar or net-banking password — not with a hospital, bank or government office.',
    'Hospitals do not cancel treatment over a phone call asking for immediate payment.',
    'Verify independently: hang up and call the hospital on the number printed on your bill or discharge summary.',
    'Do not install remote-access apps such as AnyDesk or TeamViewer for anyone claiming to help with a payment.',
    'Report it on the national cybercrime portal (1930) and keep the message as evidence.'
  ],
  hi: [
    'ओटीपी, यूपीआई पिन, सीवीवी, कार्ड नंबर, आधार या नेट-बैंकिंग पासवर्ड कभी साझा न करें — न अस्पताल से, न बैंक से, न सरकारी दफ़्तर से।',
    'अस्पताल फ़ोन पर तुरंत भुगतान मांगकर इलाज रद्द नहीं करते।',
    'खुद जांच करें: फ़ोन काटकर अस्पताल को बिल या डिस्चार्ज सारांश पर छपे नंबर पर कॉल करें।',
    'भुगतान में मदद के नाम पर AnyDesk या TeamViewer जैसे रिमोट-एक्सेस ऐप इंस्टॉल न करें।',
    'राष्ट्रीय साइबर अपराध हेल्पलाइन 1930 पर शिकायत करें और संदेश सबूत के तौर पर सहेजें।'
  ],
  hinglish: [
    'OTP, UPI PIN, CVV, card number, Aadhaar ya net-banking password kabhi share na karein — na hospital se, na bank se, na government office se.',
    'Hospital phone par turant payment maang kar treatment cancel nahi karte.',
    'Khud verify karein: call kaat kar hospital ko bill ya discharge summary par chhape number par call karein.',
    'Payment me help ke naam par AnyDesk ya TeamViewer jaise remote-access apps install na karein.',
    'National cybercrime helpline 1930 par report karein aur message ko evidence ki tarah save rakhein.'
  ]
};

export function detectScam(text, options = {}) {
  const language = ['en', 'hi', 'hinglish'].includes(options.language) ? options.language : 'en';
  const raw = typeof text === 'string' ? text : '';
  const canonical = canonicalize(raw);

  const indicators = [];
  const seenLabels = new Set();
  let score = 0;

  const record = (hit) => {
    // A phrase rule and a combination rule can describe the same tactic; count once.
    if (seenLabels.has(hit.label)) return;
    seenLabels.add(hit.label);
    indicators.push(hit);
    score += hit.weight;
  };

  for (const rule of COMPILED) {
    const hit = rule.matchers.find(m => m.match(canonical));
    if (hit) record({ id: rule.id, label: rule.label, weight: rule.weight, evidence: hit.key });
  }
  for (const hit of matchCombos(canonical)) record(hit);

  const structural = analyzeStructure(raw);
  for (const finding of structural.findings) {
    indicators.push(finding);
    score += finding.weight;
  }

  // Cap so the score stays a readable 0–100 confidence rather than an open sum.
  const confidence = Math.min(100, Math.round(score));
  const verdict = confidence >= 55 ? 'likely_scam' : confidence >= 22 ? 'suspicious' : 'low_risk';

  return {
    isSuspicious: confidence >= 22,
    verdict,
    severity: confidence >= 55 ? 'high' : confidence >= 22 ? 'medium' : 'low',
    confidence,
    indicators: indicators.map(i => i.label),
    indicatorsDetail: indicators.sort((a, b) => b.weight - a.weight),
    structural: {
      urls: structural.urls,
      shortenedUrls: structural.shortlinks,
      upiIds: structural.upiIds,
      phoneNumbers: structural.phones,
      emails: structural.emails,
      amounts: structural.amounts,
      qrCodeMentioned: structural.hasQr
    },
    redactedText: redactSecrets(raw),
    advice: ADVICE[language],
    reportHelpline: { number: '1930', purpose: 'National cybercrime helpline', telUri: 'tel:1930' },
    meta: { language, engineVersion: '2.0.0', isGuarantee: false }
  };
}

export default { detectScam, redactSecrets };
