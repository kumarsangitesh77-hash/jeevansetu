// Single place that knows how to reach the backend.
//
// The production server serves both the bundle and /api from one origin, so the
// relative base is the normal case. The absolute fallbacks exist for the
// `npm run dev` case where Vite is on :5173 and the API is on :3001, and for the
// case where someone opens the built index.html from a static file server.
const CANDIDATES = [
  import.meta.env.VITE_API_BASE,
  "/api",
  "http://localhost:3001/api",
  "http://127.0.0.1:3001/api"
].filter(Boolean);

const BASE_STORAGE_KEY = "js.apiBase";
const SESSION_KEY = "js.sessionId";
const LANG_KEY = "js.language";
const ROLE_KEY = "js.role";

let resolvedBase = null;
let backendOnline = null;

export class ApiError extends Error {
  constructor(message, status, details, requestId) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

// localStorage throws in Safari private mode and inside sandboxed iframes, so
// every read/write is guarded. A lost session id is not worth breaking the app.
function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}
function safeRemove(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function rememberBase(base) {
  resolvedBase = base;
  safeSet(BASE_STORAGE_KEY, base);
}

async function probe(base, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Picks the first base that answers /health. Cached so we probe at most once per
// page load, and persisted so a reload does not repeat the scan.
export async function resolveApiBase() {
  if (resolvedBase) return resolvedBase;

  const stored = safeGet(BASE_STORAGE_KEY);
  const ordered = stored ? [stored, ...CANDIDATES.filter(c => c !== stored)] : CANDIDATES;

  if (stored && await probe(stored)) {
    resolvedBase = stored;
    backendOnline = true;
    return stored;
  }
  for (const candidate of ordered) {
    if (await probe(candidate)) {
      rememberBase(candidate);
      backendOnline = true;
      return candidate;
    }
  }
  // Nothing answered. Keep the relative base so error messages stay meaningful.
  resolvedBase = ordered[0] || "/api";
  backendOnline = false;
  return resolvedBase;
}

export function getApiBase() {
  return resolvedBase || "/api";
}

export function isBackendOnline() {
  return backendOnline;
}

async function request(path, { method = "GET", body, signal, timeoutMs = 20000 } = {}) {
  const base = await resolveApiBase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // The caller's signal (e.g. from a component unmount) still wins.
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: { message: text } }; }
    }

    if (!res.ok) {
      const err = data?.error || {};
      throw new ApiError(
        err.message || `Request failed (${res.status})`,
        res.status,
        err.details,
        err.requestId
      );
    }
    return data;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.append(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export const api = {
  get: (path, params) => request(`${path}${toQuery(params)}`),
  post: (path, body) => request(path, { method: "POST", body }),
  del: (path) => request(path, { method: "DELETE" }),
  request
};

// --- Session ---------------------------------------------------------------

export function getSessionId() {
  return safeGet(SESSION_KEY);
}
export function setSessionId(id) {
  if (id) safeSet(SESSION_KEY, id);
}
export function clearSessionId() {
  safeRemove(SESSION_KEY);
}

export function getStoredLanguage() {
  return safeGet(LANG_KEY);
}
export function setStoredLanguage(lang) {
  safeSet(LANG_KEY, lang);
}
export function getStoredRole() {
  return safeGet(ROLE_KEY);
}
export function setStoredRole(role) {
  safeSet(ROLE_KEY, role);
}

// --- Feature detection -----------------------------------------------------
// Done in the client rather than trusting /capabilities, because browser support
// is the thing that actually decides whether the mic button may be shown.

export function getSpeechRecognition() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function speechSupported() {
  // Speech recognition also needs a secure context in Chrome.
  return Boolean(getSpeechRecognition()) && (window.isSecureContext !== false);
}

export function geolocationSupported() {
  return Boolean(navigator.geolocation) && (window.isSecureContext !== false);
}

export function currentPosition(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!geolocationSupported()) { resolve(null); return; }
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => done({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => done(null),
        { timeout: timeoutMs, maximumAge: 300000, enableHighAccuracy: false }
      );
    } catch {
      done(null);
    }
  });
}

// navigator.clipboard is unavailable on http:// origins in Safari and Firefox,
// so fall back to a temporary textarea + execCommand.
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through */ }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
