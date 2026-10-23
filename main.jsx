import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity, AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight,
  ClipboardCheck, Clock3, Copy, ExternalLink, Eye, EyeOff, Gauge,
  HeartPulse, Hospital, Info, LockKeyhole, MapPin, Menu, Mic, MicOff,
  Navigation, Phone, RefreshCw, ScanSearch, Send, Shield, ShieldAlert,
  ShieldCheck, Siren, Sparkles, Stethoscope, Thermometer, Timer,
  Trash2, Users, WifiOff, X
} from "lucide-react";
import {
  api, ApiError, resolveApiBase, getApiBase, isBackendOnline,
  getSessionId, setSessionId, clearSessionId,
  getStoredLanguage, setStoredLanguage, getStoredRole, setStoredRole,
  speechSupported, getSpeechRecognition, currentPosition, copyText
} from "./api.js";
import "./styles.css";

const COPY = {
  en: {
    home: "The safe bridge from symptoms to care.",
    start: "Start Consultation",
    security: "Security Center",
    emergencyScreen: "Emergency help",
    notice: "If this may be an emergency, contact local emergency services immediately.",
    consult: "Health consultation",
    placeholder: "Describe what is happening in your own words…",
    send: "Send",
    listen: "Speak",
    listening: "Listening…",
    risk: "Safety assessment",
    care: "Nearby care",
    share: "Share securely",
    disclaimer: "JeevanSetu provides general information and care navigation. It does not diagnose conditions or replace a qualified healthcare professional.",
    demo: "DEMO DATA",
    routine: "Routine",
    urgent: "Urgent",
    emergency: "Emergency",
    new: "New consultation",
    securityTitle: "Security & Privacy Center",
    offline: "Cannot reach the JeevanSetu server.",
    offlineHint: "Start it with npm start, then reload this page."
  },
  hi: {
    home: "लक्षणों से सही देखभाल तक सुरक्षित पुल।",
    start: "परामर्श शुरू करें",
    security: "सुरक्षा केंद्र",
    emergencyScreen: "आपातकालीन सहायता",
    notice: "अगर यह आपात स्थिति हो सकती है, तुरंत स्थानीय आपातकालीन सेवाओं से संपर्क करें।",
    consult: "स्वास्थ्य परामर्श",
    placeholder: "अपनी समस्या अपने शब्दों में बताएं…",
    send: "भेजें",
    listen: "बोलें",
    listening: "सुन रहे हैं…",
    risk: "सुरक्षा आकलन",
    care: "नज़दीकी देखभाल",
    share: "सुरक्षित रूप से साझा करें",
    disclaimer: "JeevanSetu सामान्य जानकारी और देखभाल नेविगेशन देता है। यह बीमारी का निदान नहीं करता और डॉक्टर का विकल्प नहीं है।",
    demo: "डेमो डेटा",
    routine: "सामान्य",
    urgent: "तत्काल",
    emergency: "आपातकाल",
    new: "नया परामर्श",
    securityTitle: "सुरक्षा और गोपनीयता केंद्र",
    offline: "JeevanSetu सर्वर से संपर्क नहीं हो रहा।",
    offlineHint: "npm start चलाएं, फिर यह पेज दोबारा लोड करें।"
  },
  hinglish: {
    home: "Symptoms se care tak ka safe bridge.",
    start: "Consultation Start Karein",
    security: "Security Center",
    emergencyScreen: "Emergency help",
    notice: "Agar emergency lag rahi hai, turant local emergency services se contact karein.",
    consult: "Health consultation",
    placeholder: "Apni problem apne words mein bataiye…",
    send: "Send",
    listen: "Bolein",
    listening: "Sun rahe hain…",
    risk: "Safety assessment",
    care: "Nearby care",
    share: "Securely share karein",
    disclaimer: "JeevanSetu general information aur care navigation deta hai. Ye diagnosis nahi karta aur doctor ka replacement nahi hai.",
    demo: "DEMO DATA",
    routine: "Routine",
    urgent: "Urgent",
    emergency: "Emergency",
    new: "New consultation",
    securityTitle: "Security & Privacy Center",
    offline: "JeevanSetu server se connect nahi ho pa raha.",
    offlineHint: "npm start chalayein, phir ye page reload karein."
  }
};

function contactName(contact, lang) {
  if (!contact) return "";
  if (lang === "hi") return contact.nameHi || contact.name;
  if (lang === "hinglish") return contact.nameHinglish || contact.name;
  return contact.name;
}

function formatVitals(vitals) {
  if (!vitals) return [];
  const out = [];
  if (vitals.bloodPressure) out.push({ label: "Blood pressure", value: vitals.bloodPressure.text });
  if (vitals.spo2 != null) out.push({ label: "Oxygen (SpO2)", value: `${vitals.spo2}%` });
  if (vitals.temperature) out.push({ label: "Temperature", value: vitals.temperature.text });
  if (vitals.heartRate != null) out.push({ label: "Pulse", value: `${vitals.heartRate} bpm` });
  if (vitals.glucose != null) out.push({ label: "Blood sugar", value: `${vitals.glucose} mg/dL` });
  return out;
}

function timeLabel(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  try { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

function shortHash(hash) {
  return typeof hash === "string" && hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash || "—";
}

function errorMessage(err, fallback) {
  if (err instanceof ApiError) {
    const first = Array.isArray(err.details) ? err.details[0]?.message : null;
    return [err.message, first].filter(Boolean).join(" — ");
  }
  if (err && err.name === "AbortError") return "The request timed out. Please try again.";
  return err?.message || fallback;
}

function telUri(number) {
  return `tel:${String(number || "").replace(/[^\d+]/g, "")}`;
}

function IconButton({ children, title, onClick, danger = false, disabled = false }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`iconBtn ${danger ? "danger" : ""}`}>{children}</button>
  );
}

function RiskBadge({ level }) {
  const meta = {
    emergency: ["emergency", "Emergency"],
    urgent: ["urgent", "Urgent"],
    routine: ["routine", "Routine"]
  }[level] || ["routine", "Unknown"];
  return <span className={`riskBadge ${meta[0]}`}><span className="dot" /> {meta[1]}</span>;
}

function SummaryRow({ label, value }) {
  return <div className="summaryRow"><span>{label}</span><b>{value}</b></div>;
}

function Feature({ icon, title, text }) {
  return <div className="feature card"><div className="featureIcon">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, toast.kind === "error" ? 7000 : 3500);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;
  const icon = toast.kind === "error" ? <ShieldAlert size={16} />
    : toast.kind === "ok" ? <Check size={16} /> : <Info size={16} />;
  return (
    <div className={`toast ${toast.kind}`} role="status">
      {icon}<span>{toast.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss"><X size={14} /></button>
    </div>
  );
}

function App() {
  const [screen, setScreen] = useState("home");
  const [lang, setLang] = useState(() => getStoredLanguage() || "hinglish");
  const [role, setRole] = useState(() => getStoredRole() || "patient");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [risk, setRisk] = useState(null);
  const [sessionId, setSession] = useState(() => getSessionId());
  const [backend, setBackend] = useState({ checked: false, online: false, version: null, llm: null });
  const [toast, setToast] = useState(null);
  const [speech, setSpeech] = useState({ supported: false, state: "idle", error: null });

  const [care, setCare] = useState(null);
  const [careLoading, setCareLoading] = useState(false);
  const [geo, setGeo] = useState(null);
  const [useRealData, setUseRealData] = useState(false);
  const [contactSheet, setContactSheet] = useState(null);

  const [fieldCatalogue, setFieldCatalogue] = useState([]);
  const [recipients, setRecipients] = useState(["caregiver", "clinic", "ambulance", "doctor", "family"]);
  const [selectedFields, setSelectedFields] = useState(["symptoms", "riskLevel"]);
  const [recipient, setRecipient] = useState("caregiver");
  const [purpose, setPurpose] = useState("Care coordination");
  const [notes, setNotes] = useState("");
  const [share, setShare] = useState(null);
  const [shareBusy, setShareBusy] = useState(false);

  const [audit, setAudit] = useState({ total: 0, events: [] });
  const [auditCheck, setAuditCheck] = useState(null);
  const [securityText, setSecurityText] = useState("");
  const [securityResult, setSecurityResult] = useState(null);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [redacted, setRedacted] = useState(null);
  const [menu, setMenu] = useState(false);

  const recognitionRef = useRef(null);
  const t = COPY[lang] || COPY.en;
  const notify = useCallback((kind, text) => setToast({ kind, text }), []);

  useEffect(() => { setStoredLanguage(lang); }, [lang]);
  useEffect(() => { setStoredRole(role); }, [role]);
  useEffect(() => { setSpeech({ supported: speechSupported(), state: "idle", error: null }); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await resolveApiBase();
      if (!alive) return;
      if (!isBackendOnline()) {
        setBackend({ checked: true, online: false, version: null, llm: null });
        return;
      }
      setBackend({ checked: true, online: true, version: null, llm: null });
      try {
        const health = await api.get("/health");
        if (alive) setBackend({ checked: true, online: true, version: health.version, llm: health.llm });
      } catch {
        if (alive) setBackend({ checked: true, online: false, version: null, llm: null });
      }
    })();
    return () => { alive = false; };
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const data = await api.get("/audit", { limit: 40 });
      setAudit({ total: data.total, events: data.events });
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadGreeting = useCallback(async (language) => {
    try {
      const data = await api.get("/chat/greeting", { language });
      setMessages([data.message]);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const consultation = useMemo(() => {
    const structured = risk?.structured || {};
    return {
      symptoms: structured.symptoms?.length ? structured.symptoms : (risk?.flags || []),
      duration: structured.duration || "Not provided",
      age: structured.age || null,
      bodySites: structured.bodySites || [],
      vitals: formatVitals(structured.vitals),
      vitalAlerts: structured.vitalAlerts || [],
      riskLevel: risk?.level || "unknown",
      language: risk?.language || lang,
      thirdPerson: Boolean(structured.context?.thirdPerson)
    };
  }, [risk, lang]);

  // Only keys the server recognises can ever leave the browser, and only when
  // the matching checkbox is ticked.
  const consentPayload = useMemo(() => {
    const base = { notes: notes.trim() || null };
    if (!risk) return base;
    const s = risk.structured || {};
    return {
      ...base,
      symptoms: s.symptoms?.length ? s.symptoms : (risk.flags || []),
      riskLevel: risk.level,
      duration: s.duration || null,
      bodySites: s.bodySites || [],
      vitals: formatVitals(s.vitals),
      carePlan: risk.next || null,
      transcript: messages.filter(m => m.sender === "user").map(m => m.text).join(" | ") || null
    };
  }, [risk, notes, messages]);

  const startConsultation = useCallback(() => {
    setMessages([]);
    setRisk(null);
    setScreen("consult");
    if (backend.online) loadGreeting(lang);
  }, [backend.online, lang, loadGreeting]);

  useEffect(() => {
    if (screen === "consult" && backend.online && messages.length === 0) loadGreeting(lang);
  }, [screen, lang, backend.online, messages.length, loadGreeting]);

  const sendMessage = useCallback(async (forcedText = null) => {
    const text = String(forcedText ?? input).trim();
    if (!text || loading) return;
    if (!backend.online) { notify("error", t.offline); return; }

    setInput("");
    const optimistic = { id: `local-${Date.now()}`, sender: "user", text, time: new Date().toISOString() };
    setMessages(prev => [...prev, optimistic]);
    setLoading(true);

    try {
      const data = await api.post("/chat", {
        text, language: lang, sessionId: sessionId || undefined, actorRole: role
      });
      if (data.sessionId) { setSessionId(data.sessionId); setSession(data.sessionId); }
      setMessages(data.messages?.length
        ? data.messages
        : [...(data.reply ? [optimistic, data.reply] : [optimistic])]);
      setRisk(data.triage || null);
      if (data.triage?.level === "emergency") loadAudit();
    } catch (err) {
      console.error(err);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(text);
      notify("error", errorMessage(err, "Could not reach the safety engine."));
      setBackend(b => ({ ...b, online: false }));
    } finally {
      setLoading(false);
    }
  }, [backend.online, input, lang, loadAudit, loading, notify, role, sessionId, t.offline]);

  function useVoice() {
    if (!speech.supported) {
      setSpeech(s => ({ ...s, error: "unsupported" }));
      notify("info", "Voice input is not supported in this browser. Please type your symptoms instead.");
      return;
    }
    if (speech.state === "listening" && recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* already stopping */ }
      return;
    }

    const Recognition = getSpeechRecognition();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = lang === "en" ? "en-IN" : "hi-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript.trim()) setInput(prev => (prev ? `${prev} ${transcript.trim()}` : transcript.trim()));
      setSpeech(s => ({ ...s, state: "idle", error: null }));
    };
    recognition.onerror = (event) => {
      const reason = event?.error || "unknown";
      const message = reason === "not-allowed" || reason === "service-not-allowed"
        ? "Microphone permission was blocked. You can still type your symptoms."
        : reason === "no-speech"
          ? "No speech was detected. Please try again, or type instead."
          : "Voice recognition failed. Text input works as a fallback.";
      setSpeech(s => ({ ...s, state: "idle", error: reason }));
      notify("info", message);
    };
    recognition.onend = () => setSpeech(s => (s.state === "listening" ? { ...s, state: "idle" } : s));

    try {
      recognition.start();
      setSpeech(s => ({ ...s, state: "listening", error: null }));
    } catch {
      setSpeech(s => ({ ...s, state: "idle", error: "start-failed" }));
      notify("info", "Could not start the microphone. Please type your symptoms.");
    }
  }

  useEffect(() => () => {
    try { recognitionRef.current?.abort(); } catch { /* ignore */ }
  }, []);

  const loadCare = useCallback(async (level, options = {}) => {
    if (!backend.online) { notify("error", t.offline); return; }
    setCareLoading(true);
    try {
      let origin = geo;
      if (options.useGeo && !origin) {
        origin = await currentPosition();
        setGeo(origin);
      }
      const groups = [...new Set((risk?.flagsDetail || []).map(f => f.group).filter(Boolean))];
      const data = await api.get("/care-options", {
        level,
        limit: options.limit || 8,
        lat: origin?.lat,
        lng: origin?.lng,
        groups: groups.length ? groups : undefined,
        crisis: risk?.emergency?.crisis ? true : undefined,
        useRealData: useRealData && origin ? true : undefined
      });
      setCare(data);
    } catch (err) {
      console.error(err);
      notify("error", errorMessage(err, "Could not load the care directory."));
    } finally {
      setCareLoading(false);
    }
  }, [backend.online, geo, notify, risk, t.offline, useRealData]);

  const openContact = useCallback(async (facility, mode) => {
    try {
      const data = await api.post(`/care-options/${facility.id}/contact`, {
        mode, level: risk?.level || "routine", actorRole: role
      });
      setContactSheet(data);
      loadAudit();
    } catch (err) {
      console.error(err);
      notify("error", errorMessage(err, "Could not fetch contact details."));
    }
  }, [loadAudit, notify, risk, role]);

  const loadConsentFields = useCallback(async (language) => {
    if (!backend.online) return;
    try {
      const data = await api.get("/consent/fields", { language });
      const fields = data.fields || [];
      setFieldCatalogue(fields);
      if (Array.isArray(data.recipients) && data.recipients.length) setRecipients(data.recipients);
      setSelectedFields(prev => (prev.length
        ? prev.filter(key => fields.some(f => f.key === key))
        : fields.filter(f => f.defaultSelected).map(f => f.key)));
    } catch (err) {
      console.error(err);
    }
  }, [backend.online]);

  async function shareSecurely() {
    if (!selectedFields.length) return;
    setShareBusy(true);
    try {
      const data = await api.post("/consent", {
        selectedFields,
        recipient,
        purpose,
        actorRole: role,
        sessionId: sessionId || undefined,
        payload: consentPayload
      });
      setShare(data);
      setScreen("share");
      loadAudit();
    } catch (err) {
      console.error(err);
      notify("error", errorMessage(err, "Could not record consent."));
    } finally {
      setShareBusy(false);
    }
  }

  async function revokeShare() {
    if (!share?.consent?.id) return;
    try {
      await api.post(`/consent/${share.consent.id}/revoke`, {});
      setShare(prev => ({ ...prev, revoked: true }));
      notify("ok", "Consent revoked. The shared snapshot has been deleted.");
      loadAudit();
    } catch (err) {
      notify("error", errorMessage(err, "Could not revoke consent."));
    }
  }

  async function runScamScan() {
    const text = securityText.trim();
    if (!text) return;
    setSecurityBusy(true);
    try {
      const data = await api.post("/security-scan", { text, language: lang });
      setSecurityResult(data);
      setRedacted(data.redactedText);
      loadAudit();
    } catch (err) {
      setSecurityResult(null);
      notify("error", errorMessage(err, "Could not scan the message."));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function redactOnly() {
    const text = securityText.trim();
    if (!text) return;
    try {
      const data = await api.post("/redact", { text });
      setRedacted(data.redactedText);
      notify("ok", "Secrets masked. Safe to screenshot or forward.");
    } catch (err) {
      notify("error", errorMessage(err, "Could not redact the message."));
    }
  }

  async function verifyAudit() {
    try {
      const data = await api.get("/audit/verify");
      setAuditCheck(data);
      loadAudit();
    } catch (err) {
      notify("error", errorMessage(err, "Could not verify the audit chain."));
    }
  }

  async function denyAccess() {
    try {
      const data = await api.post("/audit", {
        action: "ACCESS_DENIED",
        actorRole: role,
        recipientRole: "clinic",
        status: "denied",
        purpose: "Patient refused a data request",
        fields: []
      });
      setAudit(prev => ({ total: prev.total + 1, events: [data.event, ...prev.events] }));
      notify("ok", "Denied request recorded in the audit chain.");
    } catch (err) {
      notify("error", errorMessage(err, "Could not record the event."));
    }
  }

  async function resetDemo() {
    setMenu(false);
    if (sessionId && backend.online) {
      try { await api.del(`/chat/session/${sessionId}`); } catch { /* ignore */ }
    }
    clearSessionId();
    setSession(null);
    setMessages([]); setRisk(null); setInput("");
    setSelectedFields(["symptoms", "riskLevel"]);
    setShare(null); setNotes("");
    setSecurityText(""); setSecurityResult(null); setRedacted(null);
    setCare(null); setContactSheet(null); setAuditCheck(null);
    setScreen("home");
    notify("ok", "Demo reset.");
  }

  const nav = useCallback((next) => {
    setMenu(false);
    setContactSheet(null);
    if (next === "care") loadCare(risk?.level || "routine", { useGeo: true });
    if (next === "consent") { setShare(null); loadConsentFields(lang); }
    if (next === "security") loadAudit();
    setScreen(next);
  }, [lang, loadAudit, loadCare, loadConsentFields, risk]);

  return (
    <div className="appShell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => nav("home")}>
          <span className="brandMark"><HeartPulse size={22} /></span>
          <span>
            <b>JeevanSetu</b>
            <small>
              {backend.checked && !backend.online
                ? "Server offline"
                : backend.version ? `AI · Care Navigation · v${backend.version}` : "AI · Care Navigation"}
            </small>
          </span>
        </button>
        <div className="topActions">
          <select value={lang} onChange={e => setLang(e.target.value)} aria-label="Language">
            <option value="hinglish">Hinglish</option>
            <option value="hi">हिन्दी</option>
            <option value="en">English</option>
          </select>
          <select value={role} onChange={e => setRole(e.target.value)} aria-label="Demo role">
            <option value="patient">Patient</option>
            <option value="caregiver">Caregiver</option>
            <option value="clinic">Clinic</option>
          </select>
          <IconButton title="Emergency numbers" onClick={() => nav("emergency")} danger><Siren size={19} /></IconButton>
          <IconButton title="Menu" onClick={() => setMenu(!menu)}><Menu size={20} /></IconButton>
        </div>
      </header>

      {menu && (
        <div className="menuPanel" role="menu">
          <button type="button" onClick={() => nav("home")}>Home</button>
          <button type="button" onClick={startConsultation}>Consultation</button>
          <button type="button" onClick={() => nav("care")}>Nearby care</button>
          <button type="button" onClick={() => nav("emergency")}>Emergency numbers</button>
          <button type="button" onClick={() => nav("security")}>Security Center</button>
          <button type="button" onClick={resetDemo}>Reset demo</button>
        </div>
      )}

      {backend.checked && !backend.online && (
        <div className="offlineBar">
          <WifiOff size={17} />
          <div><b>{t.offline}</b><span>{t.offlineHint} Looking at {getApiBase()}.</span></div>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />

      <main className="main">
        {screen === "home" && (
          <Home t={t} backend={backend} risk={risk}
            onStart={startConsultation} onSecurity={() => nav("security")}
            onEmergency={() => nav("emergency")} onResult={() => nav("result")} />
        )}

        {screen === "consult" && (
          <Consultation t={t} lang={lang} messages={messages} input={input} setInput={setInput}
            loading={loading} onSend={sendMessage} onVoice={useVoice} speech={speech}
            backend={backend} risk={risk} onBack={() => nav("home")} onResult={() => nav("result")} />
        )}

        {screen === "result" && (
          <RiskResult t={t} lang={lang} risk={risk} consultation={consultation}
            onBack={() => nav("consult")} onCare={() => nav("care")}
            onShare={() => nav("consent")} onNew={resetDemo}
            onEmergency={() => nav("emergency")} />
        )}

        {screen === "care" && (
          <CareOptions t={t} risk={risk} care={care} loading={careLoading} geo={geo}
            onRetryGeo={() => loadCare(risk?.level || "routine", { useGeo: true })}
            onReload={() => loadCare(risk?.level || "routine")}
            onBack={() => nav("result")} onShare={() => nav("consent")} onContact={openContact}
            useRealData={useRealData} setUseRealData={setUseRealData} />
        )}

        {screen === "consent" && (
          <Consent lang={lang} fields={fieldCatalogue} recipients={recipients}
            selectedFields={selectedFields} setSelectedFields={setSelectedFields}
            recipient={recipient} setRecipient={setRecipient}
            purpose={purpose} setPurpose={setPurpose}
            notes={notes} setNotes={setNotes} payload={consentPayload} busy={shareBusy}
            onCancel={() => nav("result")} onShare={shareSecurely} />
        )}

        {screen === "share" && (
          <ShareReceipt share={share} onRevoke={revokeShare}
            onDone={() => nav("security")} onNotify={notify} />
        )}

        {screen === "emergency" && (
          <EmergencyScreen t={t} lang={lang} risk={risk}
            onBack={() => nav("home")} onConsult={startConsultation} onNotify={notify} />
        )}

        {screen === "security" && (
          <Security t={t} audit={audit} auditCheck={auditCheck} share={share}
            securityText={securityText} setSecurityText={setSecurityText}
            securityResult={securityResult} redacted={redacted} busy={securityBusy}
            onScan={runScamScan} onRedact={redactOnly} onVerify={verifyAudit}
            onDeny={denyAccess} onBack={() => nav("home")} onNotify={notify} />
        )}
      </main>

      {contactSheet && <ContactSheet sheet={contactSheet} onClose={() => setContactSheet(null)} />}

      <footer className="footer">
        <Shield size={14} /> Privacy-first demo · Synthetic data only · Not a diagnosis or emergency service
      </footer>
    </div>
  );
}

function Home({ t, backend, risk, onStart, onSecurity, onEmergency, onResult }) {
  return (
    <div className="page homePage">
      <section className="hero">
        <div className="eyebrow"><Sparkles size={15} /> MULTILINGUAL · VOICE-FIRST · PRIVACY-AWARE</div>
        <h1>{t.home}</h1>
        <p>JeevanSetu turns a voice or message about a health concern into cautious next steps, care-navigation options, consent-controlled sharing, and medical-scam protection.</p>
        <div className="heroBtns">
          <button type="button" className="primary big" onClick={onStart} disabled={!backend.online}>
            <Stethoscope size={19} /> {t.start}<ArrowRight size={18} />
          </button>
          <button type="button" className="dangerBtn big" onClick={onEmergency}><Siren size={18} /> {t.emergencyScreen}</button>
          <button type="button" className="secondary big" onClick={onSecurity}><Shield size={18} /> {t.security}</button>
        </div>
        {risk && (
          <button type="button" className="resumeBar" onClick={onResult}>
            <Activity size={16} />
            <span>Continue your last safety assessment — currently <b>{risk.level}</b></span>
            <ChevronRight size={16} />
          </button>
        )}
        <div className="emergencyNotice">
          <Siren size={20} />
          <div><b>{t.notice}</b><span>JeevanSetu is not a doctor and does not replace emergency responders.</span></div>
        </div>
      </section>
      <section className="featureGrid">
        <Feature icon={<Mic size={20} />} title="Voice + language" text="Hindi, English and Hinglish input, with a text fallback wherever speech recognition is unavailable." />
        <Feature icon={<ShieldAlert size={20} />} title="Deterministic safety engine" text="Red-flag rules run outside the AI reply and can only escalate a session, never downgrade it." />
        <Feature icon={<Gauge size={20} />} title="Vitals aware" text="BP, SpO2, temperature, pulse and sugar readings are parsed and checked against clinical thresholds." />
        <Feature icon={<Hospital size={20} />} title="Capability-matched care" text="Facilities are ranked by distance and matched to the body system behind the red flag." />
        <Feature icon={<LockKeyhole size={20} />} title="Consent-scoped tokens" text="Only ticked fields are copied into a snapshot behind an expiring, view-limited token you can revoke." />
        <Feature icon={<ClipboardCheck size={20} />} title="Hash-chained audit" text="Every access is appended to a SHA-256 chain that can be re-verified to prove nothing was edited." />
        <Feature icon={<ScanSearch size={20} />} title="Scam protection" text="Flags OTP, UPI PIN, payment-pressure, impersonation and suspicious-link patterns in medical messages." />
        <Feature icon={<EyeOff size={20} />} title="Secret redaction" text="Masks OTPs, PINs, card numbers and phone numbers before you screenshot or forward a message." />
        <Feature icon={<Users size={20} />} title="Human in the loop" text="Professional healthcare remains responsible for diagnosis and treatment." />
      </section>
    </div>
  );
}

function Consultation({ t, lang, messages, input, setInput, loading, onSend, onVoice, speech, backend, risk, onBack, onResult }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messages.length, loading]);

  const scenarios = lang === "hi" ? [
    { icon: <Siren size={17} />, text: "मेरी माँ को सीने में दर्द और सांस लेने में तकलीफ है, 20 मिनट से।" },
    { icon: <Clock3 size={17} />, text: "मुझे 2 दिन से बहुत तेज बुखार है।" },
    { icon: <Activity size={17} />, text: "मुझे कल से हल्का सिरदर्द है।" }
  ] : [
    { icon: <Siren size={17} />, text: "Meri maa ko chest pain aur saans lene mein dikkat hai, 20 minutes se." },
    { icon: <Clock3 size={17} />, text: "Mujhe 2 din se bahut tez bukhar hai." },
    { icon: <Activity size={17} />, text: "I have a mild headache since yesterday." }
  ];

  return (
    <div className="page">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <div><div className="eyebrow">CONSULTATION</div><h2>{t.consult}</h2></div>
        <span className="safePill"><Shield size={14} /> Safety mode</span>
      </div>

      <div className="consultLayout">
        <section className="chat card">
          <div className="chatHeader">
            <div className="avatar"><HeartPulse size={20} /></div>
            <div>
              <b>JeevanSetu Assistant</b>
              <small>
                Care navigation · not a doctor ·{" "}
                {backend.llm?.enabled ? `AI layer (${backend.llm.model})` : "deterministic engine"}
              </small>
            </div>
            {risk && <span className="riskPill"><RiskBadge level={risk.level} /></span>}
          </div>

          <div className="messages">
            {messages.length === 0 && !loading && <div className="empty">Loading the assistant…</div>}
            {messages.map(m => (
              <div key={m.id} className={`bubbleRow ${m.sender === "user" ? "user" : ""}`}>
                <div className={`bubble ${m.sender} ${m.sender === "assistant" && m.level === "emergency" ? "danger" : ""}`}>
                  {m.text}
                  <time>{timeLabel(m.time)}</time>
                </div>
              </div>
            ))}
            {loading && <div className="bubble assistant loadingDots"><i /><i /><i /></div>}
            <div ref={endRef} />
          </div>

          <div className="composer">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder={t.placeholder}
              maxLength={4000}
              aria-label={t.placeholder}
            />
            {!speech.supported && (
              <div className="inlineHint">
                <MicOff size={14} /> Voice input is unavailable in this browser — typing works everywhere.
              </div>
            )}
            <div className="composerBtns">
              <button type="button"
                className={`voiceBtn ${speech.state === "listening" ? "listening" : ""}`}
                onClick={onVoice}
                title={speech.supported ? t.listen : "Speech recognition is not available in this browser"}>
                {speech.supported ? <Mic size={18} /> : <MicOff size={18} />}
                {speech.state === "listening" ? t.listening : t.listen}
              </button>
              <button type="button" className="primary" onClick={() => onSend()}
                disabled={loading || !input.trim() || !backend.online}>
                <Send size={17} /> {t.send}
              </button>
            </div>
          </div>

          {messages.some(m => m.sender === "user") && (
            <button type="button" className="resultLink" onClick={onResult}>
              View safety assessment <ChevronRight size={16} />
            </button>
          )}
        </section>

        <aside className="side card">
          <h3>Try the demo</h3>
          <p>Paste or say a scripted scenario. The red-flag engine runs independently of the assistant reply.</p>
          {scenarios.map(s => (
            <button type="button" key={s.text} className="scenario" onClick={() => onSend(s.text)} disabled={loading}>
              {s.icon}<span>{s.text}</span>
            </button>
          ))}
          <div className="sideNote">
            <Shield size={15} /> Risk can only go up within a session. A later “I feel fine” never clears an earlier red flag.
          </div>
        </aside>
      </div>
    </div>
  );
}

function RiskResult({ t, lang, risk, consultation, onBack, onCare, onShare, onNew, onEmergency }) {
  const r = risk || {
    level: "routine", title: "Routine consultation guidance",
    explanation: "No predefined emergency red flag was detected.",
    next: "Consider a healthcare professional if symptoms continue, worsen, or concern you.",
    flags: [], flagsDetail: [], emergency: null, safety: null, localized: null
  };
  const local = r.localized || {};
  const emergency = r.emergency;

  return (
    <div className="page">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <div><div className="eyebrow">SAFETY ASSESSMENT</div><h2>{t.risk}</h2></div>
        <button type="button" className="secondary" onClick={onNew}><RefreshCw size={16} /> {t.new}</button>
      </div>

      <div className={`riskHero ${r.level}`}>
        <div className="riskIcon">{r.level === "emergency" ? <Siren size={24} /> : r.level === "urgent" ? <AlertCircle size={24} /> : <Check size={24} />}</div>
        <div>
          <RiskBadge level={r.level} />
          <h1>{local.title || r.title}</h1>
          <p>{local.explanation || r.explanation}</p>
          {r.safety && (
            <div className="engineNote">
              <ShieldCheck size={13} />
              Deterministic engine v{r.safety.engineVersion}
              {r.safety.escalatedFromSession ? " · escalated from an earlier message in this session" : ""}
            </div>
          )}
        </div>
      </div>

      {emergency?.required && (
        <section className="card emergencyCard">
          <div className="cardTitle danger"><Siren size={17} /> {local.callToAction || "Call now"}</div>
          <div className="contactList">
            {(emergency.contacts || []).slice(0, 4).map(c => (
              <a key={c.id} className="contactTile" href={c.telUri || telUri(c.number)}>
                <Phone size={17} />
                <span><b>{c.number}</b><small>{contactName(c, lang)}</small></span>
              </a>
            ))}
          </div>
          {emergency.whatToSay?.length > 0 && (
            <details className="foldBlock">
              <summary>What to say on the call</summary>
              <ul>{emergency.whatToSay.map(line => <li key={line}>{line}</li>)}</ul>
            </details>
          )}
          {emergency.firstAid?.steps?.length > 0 && (
            <details className="foldBlock">
              <summary>
                First aid while you wait{emergency.firstAid.language === "en" && lang !== "en" ? " (English)" : ""}
              </summary>
              <ol>{emergency.firstAid.steps.map(step => <li key={step}>{step}</li>)}</ol>
            </details>
          )}
        </section>
      )}

      <div className="twoCol">
        <section className="card nextCard">
          <div className="cardTitle"><ArrowRight size={17} /> Recommended next step</div>
          <p>{local.next || r.next}</p>
          {r.level === "emergency" && (
            <div className="dangerCall">
              <Siren size={18} /><b>Emergency care now</b>
              <span>Do not wait for additional chat questions.</span>
            </div>
          )}
          {r.flagsDetail?.length > 0 && (
            <div className="flagList">
              {r.flagsDetail.map((f, i) => (
                <span key={`${f.id}-${i}`} className={`flagChip ${f.level}`}>
                  {lang === "en" ? f.label : (f.labelLocal || f.label)}
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="card summaryCard">
          <div className="cardTitle"><ClipboardCheck size={17} /> Structured summary</div>
          <SummaryRow label="Symptoms" value={consultation.symptoms.join(", ") || "Not provided"} />
          <SummaryRow label="Duration" value={consultation.duration} />
          <SummaryRow label="Body area" value={consultation.bodySites.join(", ") || "Not provided"} />
          <SummaryRow label="About" value={consultation.thirdPerson ? "Someone else" : "Yourself"} />
          {consultation.age && <SummaryRow label="Age" value={consultation.age} />}
          {consultation.vitals.map(v => <SummaryRow key={v.label} label={v.label} value={v.value} />)}
          <SummaryRow label="Language" value={consultation.language} />
          <SummaryRow label="Diagnosis" value="Not provided — this is not a diagnosis" />
        </section>
      </div>

      {consultation.vitalAlerts.length > 0 && (
        <section className="card vitalsCard">
          <div className="cardTitle"><Thermometer size={17} /> Readings outside the expected range</div>
          {consultation.vitalAlerts.map((a, i) => (
            <div key={`${a.metric}-${i}`} className={`vitalAlert ${a.level}`}>
              <b>{a.label}</b>
              {a.advice && <span>{a.advice}</span>}
            </div>
          ))}
        </section>
      )}

      <div className="actionRow">
        <button type="button" className="primary big" onClick={onCare}><MapPin size={18} /> {t.care}</button>
        <button type="button" className="secondary big" onClick={onShare}><LockKeyhole size={18} /> {t.share}</button>
        <button type="button" className="secondary big" onClick={onEmergency}><Siren size={18} /> {t.emergencyScreen}</button>
      </div>

      <div className="disclaimer">
        <Shield size={16} />
        <span>{t.disclaimer} In an emergency, contact local emergency services immediately.</span>
      </div>
    </div>
  );
}

function CareOptions({ t, risk, care, loading, geo, onRetryGeo, onReload, onBack, onShare, onContact, useRealData, setUseRealData }) {
  const results = care?.results || [];
  return (
    <div className="page">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <div><div className="eyebrow">CARE NAVIGATION</div><h2>{t.care}</h2></div>
        <button type="button" className="secondary" onClick={onReload} disabled={loading}>
          <RefreshCw size={15} /> Refresh
        </button>
      </div>

      {!care?.isDemoData ? (
        <div className="demoBanner" style={{ background: '#e6f9e6', borderColor: '#4caf50' }}>
          <MapPin size={17} /><b>Live facility data</b>
          <span>
            Showing real-time hospitals near your location. Data sourced from Google Places API.
          </span>
        </div>
      ) : care?.origin?.source === 'client_gps' && useRealData ? (
        <div className="demoBanner" style={{ background: '#fff3cd', borderColor: '#ffc107' }}>
          <MapPin size={17} /><b>Google Maps API unavailable</b>
          <span>
            Using GPS coordinates ({geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}) but showing demo facilities. 
            The Google Maps API key may be invalid or missing required permissions.
          </span>
        </div>
      ) : (
        <div className="demoBanner">
          <MapPin size={17} /><b>Demo care directory</b>
          <span>
            {care?.origin?.source === "device"
              ? "Ranked from your device location. "
              : `Ranked around ${care?.origin?.city || "Lucknow"}. `}
            Names, numbers and availability are synthetic.
          </span>
        </div>
      )}

      {geo && (
        <div className="geoBar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Navigation size={16} />
            <span>
              {care?.origin?.address 
                ? `Location: ${care.origin.address}` 
                : `Using your location (${geo.lat.toFixed(4)}, ${geo.lng.toFixed(4)})`}
            </span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap' }}>
            <input 
              type="checkbox" 
              checked={useRealData} 
              onChange={(e) => setUseRealData(e.target.checked)}
              disabled={loading}
            />
            Use real hospitals
          </label>
        </div>
      )}

      {!geo && (
        <div className="geoBar">
          <Navigation size={16} />
          <span>Distances use a default city centre. Allow location for accurate distances.</span>
          <button type="button" className="secondary" onClick={onRetryGeo} disabled={loading}>Use my location</button>
        </div>
      )}

      {care?.rankedByGroups?.length > 0 && (
        <div className="flagList">
          <span className="chipLabel">Matched for:</span>
          {care.rankedByGroups.map(g => <span key={g} className="flagChip urgent">{g}</span>)}
        </div>
      )}

      {loading ? (
        <div className="emptyCard"><div className="loadingDots"><i /><i /><i /></div> Loading facilities…</div>
      ) : results.length === 0 ? (
        <div className="emptyCard">
          <Info size={24} /> No care facilities found for this assessment.
          <button type="button" className="secondary" onClick={onReload}>Try again</button>
        </div>
      ) : (
        <div className="careGrid">
          {results.map(h => (
            <div className="careCard card" key={h.id}>
              <div className="careTop">
                <div className="hospitalIcon"><Hospital size={20} /></div>
                <div>
                  <h3>{h.name}</h3>
                  <span>{h.distance} away · {h.type}</span>
                </div>
              </div>
              <p>{h.specialty || (h.specialties || []).join(", ") || h.address}</p>
              <div className="careMeta">
                {h.emergency
                  ? <span className="available"><Check size={14} /> {h.open24x7 ? "Emergency 24x7" : "Emergency"}</span>
                  : <span className="neutral">General care</span>}
                <span><Phone size={13} /> {h.phone}</span>
              </div>
              {(h.demoOccupancyPct != null || h.demoAvgWaitMinutes != null) && (
                <div className="careMeta">
                  {h.demoOccupancyPct != null && <span className="neutral"><Activity size={13} /> {h.demoOccupancyPct}% occupied</span>}
                  {h.demoAvgWaitMinutes != null && <span className="neutral"><Timer size={13} /> ~{h.demoAvgWaitMinutes} min wait</span>}
                </div>
              )}
              {h.matchedCapability && (
                <div className="matchedTag"><ShieldCheck size={13} /> Capability matched to your red flag</div>
              )}
              <div className="cardActions">
                <button type="button" className="secondary" onClick={() => onContact(h, "call")}><Phone size={15} /> Call</button>
                <button type="button" className="secondary" onClick={() => onContact(h, "directions")}><MapPin size={15} /> Directions</button>
                {h.ambulancePhone && (
                  <button type="button" className="secondary" onClick={() => onContact(h, "ambulance")}><Siren size={15} /> Ambulance</button>
                )}
              </div>
              <span className="demoTag">{t.demo}</span>
            </div>
          ))}
        </div>
      )}

      <div className="actionRow">
        <button type="button" className="primary big" onClick={onShare}><LockKeyhole size={18} /> Share a selected summary</button>
      </div>
    </div>
  );
}

function ContactSheet({ sheet, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="sheetBackdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="sheet card" onClick={e => e.stopPropagation()}>
        <div className="sheetHead">
          <div className="hospitalIcon"><Phone size={18} /></div>
          <div><b>{sheet.facility?.name}</b><small>{sheet.facility?.address}</small></div>
          <IconButton title="Close" onClick={onClose}><X size={17} /></IconButton>
        </div>

        <div className="sheetNumber">{sheet.number}</div>

        <div className="actionRow">
          <a className="primary big" href={sheet.telUri}><Phone size={17} /> Open dialler</a>
          {sheet.mapsUrl && (
            <a className="secondary big" href={sheet.mapsUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={17} /> Map directions
            </a>
          )}
        </div>

        {sheet.whatToSay?.length > 0 && (
          <div className="foldBlock open">
            <b>What to say</b>
            <ul>{sheet.whatToSay.map(line => <li key={line}>{line}</li>)}</ul>
          </div>
        )}

        <div className="disclaimer"><Info size={15} /><span>{sheet.note}</span></div>
      </div>
    </div>
  );
}

function Consent({ lang, fields, recipients, selectedFields, setSelectedFields, recipient, setRecipient,
  purpose, setPurpose, notes, setNotes, payload, busy, onCancel, onShare }) {
  const toggle = key => setSelectedFields(prev => (prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]));
  const criticalCount = fields.filter(f => selectedFields.includes(f.key) && f.sensitivity === "critical").length;

  return (
    <div className="page narrow">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onCancel}><ArrowLeft size={17} /> Cancel</button>
        <div><div className="eyebrow">CONSENT SERVICE</div><h2>Share only what you choose</h2></div>
      </div>

      <section className="card consentCard">
        <div className="privacyHeader">
          <div className="lockCircle"><LockKeyhole size={20} /></div>
          <div>
            <h3>Explicit consent required</h3>
            <p>Unticked fields are never copied into the snapshot — the server cannot leak what it never stored.</p>
          </div>
        </div>

        <label className="fieldLabel" htmlFor="recipient">Recipient</label>
        <select id="recipient" value={recipient} onChange={e => setRecipient(e.target.value)}>
          {recipients.map(r => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
        </select>

        <label className="fieldLabel" htmlFor="purpose">Purpose</label>
        <select id="purpose" value={purpose} onChange={e => setPurpose(e.target.value)}>
          <option>Care coordination</option>
          <option>Ambulance handover</option>
          <option>Appointment preparation</option>
          <option>Follow-up support</option>
          <option>Second opinion</option>
        </select>

        <label className="fieldLabel">Information to share</label>
        <div className="checks">
          {fields.map(f => {
            const value = payload[f.key];
            const hasValue = value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0);
            return (
              <label key={f.key} className={`checkRow ${selectedFields.includes(f.key) ? "selected" : ""} ${hasValue ? "" : "novalue"}`}>
                <input type="checkbox" checked={selectedFields.includes(f.key)} onChange={() => toggle(f.key)} />
                <span>
                  <b>{lang === "hi" ? (f.labelHi || f.label) : f.label}</b>
                  <small>{f.description}</small>
                </span>
                <em className={`sens ${f.sensitivity}`}>{f.sensitivity}</em>
              </label>
            );
          })}
        </div>

        {criticalCount > 0 && (
          <div className="warnBar">
            <ShieldAlert size={15} /> You selected {criticalCount} highly sensitive field(s). Share these only when truly required.
          </div>
        )}

        <label className="fieldLabel" htmlFor="notes">Optional note for the recipient</label>
        <textarea id="notes" className="noteInput" value={notes} onChange={e => setNotes(e.target.value)}
          maxLength={400} placeholder="Only shared if you tick Notes above." />

        <div className="consentPreview">
          <b>Preview — exactly what the recipient can see</b>
          {selectedFields.length === 0 && <span>Nothing. Select at least one field.</span>}
          {selectedFields.map(key => {
            const value = payload[key];
            const empty = value === null || value === undefined || (Array.isArray(value) && !value.length);
            const shown = empty ? "not available yet" : (typeof value === "string" ? value : JSON.stringify(value));
            return <span key={key}><b>{key}</b>: {shown}</span>;
          })}
        </div>

        <div className="actionRow">
          <button type="button" className="secondary big" onClick={onCancel}>Cancel</button>
          <button type="button" className="primary big" disabled={!selectedFields.length || busy} onClick={onShare}>
            <LockKeyhole size={18} /> {busy ? "Issuing token…" : "Share securely"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ShareReceipt({ share, onRevoke, onDone, onNotify }) {
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copied, setCopied] = useState(false);

  const consent = share?.consent;
  const token = share?.share?.token;
  const link = token ? `${window.location.origin}${getApiBase()}/share/${token}` : null;

  async function copy() {
    const ok = await copyText(link || token);
    setCopied(ok);
    onNotify(ok ? "ok" : "error", ok ? "Share link copied." : "Could not copy — select the text manually.");
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  async function loadPreview() {
    setLoadingPreview(true);
    setPreviewError(null);
    try {
      setPreview(await api.get(`/share/${token}`, { requesterRole: "caregiver" }));
    } catch (err) {
      setPreviewError(errorMessage(err, "Could not open the share link."));
    } finally {
      setLoadingPreview(false);
    }
  }

  if (!consent) return null;

  return (
    <div className="page narrow">
      <div className="pageHead">
        <div><div className="eyebrow">SHARE TOKEN ISSUED</div><h2>Consent recorded</h2></div>
      </div>

      <section className="card consentCard">
        <div className="tokenBox">
          <b>{token}</b>
          <div className="actionRow tight">
            <button type="button" className="secondary" onClick={copy}><Copy size={15} /> {copied ? "Copied" : "Copy link"}</button>
            <a className="secondary" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /> Open</a>
          </div>
        </div>

        <SummaryRow label="Recipient" value={consent.recipient} />
        <SummaryRow label="Purpose" value={consent.purpose} />
        <SummaryRow label="Fields" value={consent.fields.join(", ")} />
        <SummaryRow label="Views remaining" value={`${consent.viewsRemaining} of ${consent.maxViews}`} />
        <SummaryRow label="Expires" value={new Date(consent.expiresAt).toLocaleString()} />
        <SummaryRow label="Snapshot hash" value={shortHash(consent.snapshotHash)} />
        <SummaryRow label="Status" value={share.revoked ? "revoked" : consent.status} />

        <div className="actionRow">
          <button type="button" className="secondary" onClick={loadPreview} disabled={loadingPreview || share.revoked}>
            <Eye size={15} /> {loadingPreview ? "Loading…" : "See recipient view"}
          </button>
          <button type="button" className="secondary dangerBtn" onClick={onRevoke} disabled={share.revoked}>
            <Trash2 size={15} /> Revoke & delete
          </button>
          <button type="button" className="primary" onClick={onDone}><Shield size={15} /> Audit trail</button>
        </div>

        {previewError && <div className="warnBar"><ShieldAlert size={15} /> {previewError}</div>}

        {preview && (
          <div className="consentPreview">
            <b>{preview.notice}</b>
            <span>Fields visible: {preview.fields.join(", ") || "none"}</span>
            <pre>{JSON.stringify(preview.snapshot, null, 2)}</pre>
            <span>Views remaining after this look: {preview.viewsRemaining}</span>
          </div>
        )}
      </section>
    </div>
  );
}

function EmergencyScreen({ t, lang, risk, onBack, onConsult, onNotify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await api.get("/emergency-contacts", { language: lang });
        if (alive) setData(res);
      } catch (err) {
        if (alive) onNotify("error", errorMessage(err, "Could not load emergency numbers."));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [lang, onNotify]);

  const all = data?.contacts || risk?.emergency?.contacts || [];
  const categories = ["all", ...new Set(all.map(c => c.category))];
  const contacts = category === "all" ? all : all.filter(c => c.category === category);

  return (
    <div className="page">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <div><div className="eyebrow">EMERGENCY</div><h2>{t.emergencyScreen}</h2></div>
      </div>

      <div className="emergencyNotice">
        <Siren size={20} />
        <div>
          <b>These are real, publicly published Indian helpline numbers.</b>
          <span>JeevanSetu does not place calls or dispatch ambulances. Tap a number to open your phone's dialler.</span>
        </div>
      </div>

      <div className="chipRow">
        {categories.map(c => (
          <button type="button" key={c} className={`filterChip ${category === c ? "on" : ""}`}
            onClick={() => setCategory(c)}>{c.replace(/_/g, " ")}</button>
        ))}
      </div>

      {loading ? (
        <div className="emptyCard"><div className="loadingDots"><i /><i /><i /></div> Loading numbers…</div>
      ) : (
        <div className="contactGrid">
          {contacts.map(c => (
            <a key={c.id} className="contactCard card" href={c.telUri || telUri(c.number)}>
              <div className="contactNum">{c.number}</div>
              <div><b>{contactName(c, lang)}</b><small>{c.purpose}</small></div>
              <em>{c.available}</em>
            </a>
          ))}
        </div>
      )}

      {data?.whatToSay?.length > 0 && (
        <section className="card nextCard">
          <div className="cardTitle"><Phone size={17} /> What to say on the call</div>
          <ol className="stepList">{data.whatToSay.map(line => <li key={line}>{line}</li>)}</ol>
        </section>
      )}

      {data?.disclaimer && <div className="disclaimer"><Info size={16} /><span>{data.disclaimer}</span></div>}

      <div className="actionRow">
        <button type="button" className="secondary big" onClick={onConsult}>
          <Stethoscope size={17} /> Start a consultation
        </button>
      </div>
    </div>
  );
}

function Security({ t, audit, auditCheck, share, securityText, setSecurityText, securityResult,
  redacted, busy, onScan, onRedact, onVerify, onDeny, onBack, onNotify }) {
  const events = audit.events || [];
  const active = share && !share.revoked;
  const structural = securityResult?.structural || {};
  const links = [...(structural.shortenedUrls || []), ...(structural.urls || [])];

  return (
    <div className="page">
      <div className="pageHead">
        <button type="button" className="backBtn" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <div><div className="eyebrow">CYBERSECURITY</div><h2>{t.securityTitle}</h2></div>
        <span className="safePill"><LockKeyhole size={14} /> Privacy by design</span>
      </div>

      <div className="securityGrid">
        <section className="card statusCard">
          <div className="cardTitle"><ClipboardCheck size={17} /> Consent status</div>
          <div className={`statusBig ${active ? "ok" : ""}`}>
            <Check size={20} />
            {share ? (share.revoked ? "Revoked" : "Granted") : "Not shared"}
          </div>
          <p>Only explicitly selected fields can be shared. Revoking deletes the snapshot immediately.</p>
          {active && (
            <div className="tokenBox small">
              <b>{share.share.token}</b>
              <span>
                {share.consent.viewsRemaining} views left · expires {new Date(share.consent.expiresAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          <button type="button" className="secondary" onClick={onDeny}><ShieldAlert size={15} /> Simulate denied access</button>
        </section>

        <section className="card scamCard">
          <div className="cardTitle"><ScanSearch size={17} /> Medical-message scam scan</div>
          <p>Paste a suspicious hospital or payment message. Secrets are masked in the output.</p>
          <textarea value={securityText} onChange={e => setSecurityText(e.target.value)} maxLength={8000}
            placeholder="Example: Hospital: your admission is cancelled, pay now and share OTP…" />
          <div className="composerBtns">
            <button type="button" className="secondary" onClick={onRedact} disabled={busy || !securityText.trim()}>
              <EyeOff size={15} /> Mask secrets only
            </button>
            <button type="button" className="primary" onClick={onScan} disabled={busy || !securityText.trim()}>
              <ScanSearch size={16} /> {busy ? "Scanning…" : "Scan message"}
            </button>
          </div>

          {securityResult && (
            <div className={`scamResult ${securityResult.isSuspicious ? "bad" : "good"}`}>
              {securityResult.isSuspicious ? <ShieldAlert size={18} /> : <Check size={18} />}
              <div>
                <b>
                  {securityResult.isSuspicious
                    ? (securityResult.verdict === "likely_scam" ? "Likely scam" : "Suspicious message")
                    : "No scam indicator detected"}
                </b>
                <div className="confidenceBar"><i style={{ width: `${Math.min(100, securityResult.confidence)}%` }} /></div>
                <span>Confidence {securityResult.confidence}/100 · severity {securityResult.severity} · {securityResult.indicators.length} indicator(s)</span>
                {securityResult.indicators.length > 0 && (
                  <ul>{securityResult.indicators.map(x => <li key={x}>{x}</li>)}</ul>
                )}
                {securityResult.indicatorsDetail?.length > 0 && (
                  <div className="flagList">
                    {securityResult.indicatorsDetail.map((d, i) => (
                      <span key={`${d.id}-${i}`} className="flagChip urgent" title={`weight ${d.weight}`}>{d.evidence}</span>
                    ))}
                  </div>
                )}
                {links.length > 0 && <span>Links found: {links.join(", ")}</span>}
                {structural.amounts?.length > 0 && <span>Amounts mentioned: {structural.amounts.join(", ")}</span>}
                {securityResult.advice?.length > 0 && (
                  <div className="adviceList">{securityResult.advice.map(a => <p key={a}>{a}</p>)}</div>
                )}
                {securityResult.reportHelpline && (
                  <a className="helpline" href={securityResult.reportHelpline.telUri}>
                    <Phone size={14} /> Report on {securityResult.reportHelpline.number} — {securityResult.reportHelpline.purpose}
                  </a>
                )}
                <span className="fineprint">Heuristic demo scanner — not a guarantee of safety.</span>
              </div>
            </div>
          )}

          {redacted && redacted !== securityText && (
            <div className="consentPreview">
              <b>Redacted version — safe to forward</b>
              <pre>{redacted}</pre>
              <button type="button" className="secondary" onClick={async () => {
                const ok = await copyText(redacted);
                onNotify(ok ? "ok" : "error", ok ? "Redacted text copied." : "Could not copy.");
              }}><Copy size={14} /> Copy redacted text</button>
            </div>
          )}
        </section>
      </div>

      <section className="card auditCard">
        <div className="cardTitle">
          <ClipboardCheck size={17} /> Append-only audit chain
          <span className="countPill">{audit.total} events</span>
        </div>

        <div className="actionRow tight">
          <button type="button" className="secondary" onClick={onVerify}><ShieldCheck size={15} /> Verify hash chain</button>
          {auditCheck && (
            <span className={`verifyPill ${auditCheck.valid ? "ok" : "bad"}`}>
              {auditCheck.valid ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
              {auditCheck.valid
                ? `Intact · ${auditCheck.recordCount} records · head ${shortHash(auditCheck.headHash)}`
                : `BROKEN at record ${auditCheck.brokenAt} — ${auditCheck.reason}`}
            </span>
          )}
        </div>

        {events.length === 0 ? (
          <div className="empty">No sharing or access events yet.</div>
        ) : (
          <div className="auditList">
            {events.map(e => (
              <div className="auditRow" key={e.id}>
                <div className={`eventIcon ${e.status}`}>
                  {e.status === "allowed" || e.status === "recorded" ? <Check size={15} /> : <X size={15} />}
                </div>
                <div>
                  <b>{e.action}</b>
                  <span>
                    {e.actorRole} → {e.recipientRole || "system"}
                    {e.fields?.length ? ` · ${e.fields.join(", ")}` : ""}
                    {e.purpose ? ` · ${e.purpose}` : ""}
                    {e.detail?.level ? ` · ${e.detail.level}` : ""}
                  </span>
                  <span className="hashLine">#{e.seq} · {shortHash(e.hash)}</span>
                </div>
                <time>{timeLabel(e.ts || e.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
        <p className="fineprint">
          The log stores rule identifiers and field names only — never the patient's free text.
        </p>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
