import { canonicalize } from '../lib/text.js';

// Numeric vital-sign parsing.
//
// These thresholds are simple, conservative heuristics meant for a demo care
// navigator, not clinical decision support. They only ever *raise* urgency — a
// normal reading never lowers the level produced by the red-flag rules.

const BP_RE = /(?:bp|blood pressure|pressure|shugar|रक्तचाप)?\s*\b(\d{2,3})\s*(?:\/|by|over)\s*(\d{2,3})\b/g;
const SPO2_RE = /\b(?:spo2|sp02|sao2|oxygen|o2|saturation|sat)\D{0,12}(\d{2,3})\s*(?:%|percent)?/i;
const TEMP_RE = /\b(?:temp|temperature|fever|bukhar|body temp)\D{0,12}(\d{2,3}(?:\.\d)?)\s*(°?\s*[fc]|degree|fahrenheit|celsius)?/i;
const TEMP_STANDALONE_RE = /\b(9[5-9]|10[0-9]|11[0-5])(?:\.\d)?\s*(?:°?\s*f|fahrenheit)\b|\b(3[5-9]|4[0-5])(?:\.\d)?\s*(?:°?\s*c|celsius)\b/i;
// Hindi and Hinglish usually put the reading first: "103 bukhar", "102 fever hai".
const TEMP_BEFORE_RE = /\b(\d{2,3}(?:\.\d)?)\s*(?:°?\s*[fc]\b|degree\b)?\s*(?:ka\s+)?(?:bukhar|fever|tap|temperature|temp)\b/i;
const HR_RE = /\b(?:pulse|heart rate|hr|dhadkan|nabz)\D{0,12}(\d{2,3})/i;
const GLUCOSE_RE = /\b(?:sugar|glucose|shugar|rbs|fbs)\D{0,12}(\d{2,4})\s*(?:mg)?/i;

function plausibleSystolic(v) { return v >= 60 && v <= 260; }
function plausibleDiastolic(v) { return v >= 30 && v <= 180; }

function parseBloodPressure(text) {
  let best = null;
  for (const match of text.matchAll(BP_RE)) {
    const systolic = Number(match[1]);
    const diastolic = Number(match[2]);
    if (!plausibleSystolic(systolic) || !plausibleDiastolic(diastolic)) continue;
    if (systolic <= diastolic) continue;
    best = { systolic, diastolic, text: `${systolic}/${diastolic}` };
  }
  return best;
}

function parseTemperature(text) {
  let celsius = null;
  let raw = null;

  const labelled = TEMP_RE.exec(text) || TEMP_BEFORE_RE.exec(text);
  if (labelled) raw = Number(labelled[1]);
  else {
    const standalone = TEMP_STANDALONE_RE.exec(text);
    if (standalone) raw = Number(standalone[1] ?? standalone[2]);
  }
  if (raw === null) return null;

  // Infer the unit when it was not stated: 35–45 is Celsius, 90–115 is Fahrenheit.
  if (raw >= 34 && raw <= 45) celsius = raw;
  else if (raw >= 90 && raw <= 115) celsius = (raw - 32) * 5 / 9;
  else return null;

  const unit = celsius === raw ? 'C' : 'F';
  return {
    celsius: Number(celsius.toFixed(1)),
    fahrenheit: Number(((celsius * 9) / 5 + 32).toFixed(1)),
    reportedUnit: unit,
    text: `${raw}${unit === 'C' ? '°C' : '°F'}`
  };
}

function parseNumber(re, text) {
  const match = re.exec(text);
  return match ? Number(match[1]) : null;
}

export function parseVitals(input) {
  const text = canonicalize(input);
  if (!text) return { bloodPressure: null, spo2: null, temperature: null, heartRate: null, glucose: null };

  const spo2 = parseNumber(SPO2_RE, text);
  const heartRate = parseNumber(HR_RE, text);
  const glucose = parseNumber(GLUCOSE_RE, text);

  return {
    bloodPressure: parseBloodPressure(text),
    spo2: spo2 !== null && spo2 >= 40 && spo2 <= 100 ? spo2 : null,
    temperature: parseTemperature(text),
    heartRate: heartRate !== null && heartRate >= 25 && heartRate <= 250 ? heartRate : null,
    glucose: glucose !== null && glucose >= 20 && glucose <= 900 ? glucose : null
  };
}

// Returns alert objects: { metric, value, level, label, advice }
export function assessVitals(vitals, context = {}) {
  const alerts = [];
  const push = (metric, value, level, label, advice) => alerts.push({ metric, value, level, label, advice });

  const { spo2, bloodPressure: bp, temperature, heartRate: hr, glucose } = vitals;

  if (spo2 !== null) {
    if (spo2 < 90) push('spo2', spo2, 'emergency', `Oxygen saturation ${spo2}% is critically low`, 'Seek emergency care now; this usually needs oxygen support.');
    else if (spo2 < 94) push('spo2', spo2, 'urgent', `Oxygen saturation ${spo2}% is below normal`, 'Get medical assessment today, sooner if breathing is difficult.');
  }

  if (bp) {
    if (bp.systolic >= 180 || bp.diastolic >= 120) {
      push('bp', bp.text, 'emergency', `Blood pressure ${bp.text} is in crisis range`, 'Emergency assessment is needed, especially with chest pain, breathlessness, headache or vision change.');
    } else if (bp.systolic <= 90 || bp.diastolic <= 55) {
      push('bp', bp.text, 'emergency', `Blood pressure ${bp.text} is dangerously low`, 'Possible shock — seek emergency care, particularly with cold sweat, confusion or fainting.');
    } else if (bp.systolic >= 160 || bp.diastolic >= 100) {
      push('bp', bp.text, 'urgent', `Blood pressure ${bp.text} is high`, 'Contact a clinician within 24 hours and repeat the reading while rested.');
    }
  }

  if (temperature) {
    const c = temperature.celsius;
    const isInfant = Boolean(context.infant);
    // 38.5°C (101.3°F) is the accepted fever threshold; 40°C (104°F) is where fever
    // itself becomes dangerous independent of its cause.
    if (c >= 40) push('temperature', temperature.text, 'emergency', `Temperature ${temperature.text} is dangerously high`, 'Emergency care is needed, especially with confusion, seizure or stiffness.');
    else if (isInfant && c >= 38) push('temperature', temperature.text, 'emergency', `Fever ${temperature.text} in a young infant`, 'Any fever in a baby under 3 months needs urgent in-person assessment.');
    else if (c >= 38.5) push('temperature', temperature.text, 'urgent', `Temperature ${temperature.text} is a significant fever`, 'Use fluids and paracetamol as previously advised, and get reviewed if it persists beyond 3 days or worsens.');
  }

  if (hr !== null) {
    if (hr >= 130) push('heartRate', hr, 'emergency', `Pulse ${hr}/min is very fast at rest`, 'Emergency assessment is needed if accompanied by chest pain, breathlessness or fainting.');
    else if (hr >= 120 || hr <= 45) push('heartRate', hr, 'urgent', `Pulse ${hr}/min is outside the normal resting range`, 'Get a clinician to review this, ideally with an ECG.');
  }

  if (glucose !== null) {
    if (glucose <= 54) push('glucose', glucose, 'emergency', `Blood sugar ${glucose} mg/dL is severely low`, 'Give fast-acting sugar now if the person is fully awake, and seek emergency care.');
    else if (glucose < 70) push('glucose', glucose, 'urgent', `Blood sugar ${glucose} mg/dL is low`, 'Treat with fast-acting carbohydrate and recheck in 15 minutes.');
    else if (glucose >= 400) push('glucose', glucose, 'emergency', `Blood sugar ${glucose} mg/dL is dangerously high`, 'Emergency assessment is needed, especially with vomiting, drowsiness or deep breathing.');
    else if (glucose >= 300) push('glucose', glucose, 'urgent', `Blood sugar ${glucose} mg/dL is very high`, 'Contact the treating clinician today and check for ketones if advised.');
  }

  return alerts;
}
