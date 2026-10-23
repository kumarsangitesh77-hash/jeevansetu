import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// Minimal .env loader so the project needs no dotenv dependency.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const num = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const list = (value, fallback) =>
  value ? String(value).split(',').map(s => s.trim()).filter(Boolean) : fallback;

const port = num(process.env.PORT, 3001);
const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  env: nodeEnv,
  isTest: nodeEnv === 'test',
  isProduction: nodeEnv === 'production',
  port,
  host: process.env.HOST || '0.0.0.0',
  root,
  clientDist: path.join(root, 'dist'),

  cors: {
    // Same-origin serving needs no CORS at all; these are for `vite dev` and LAN demos.
    origins: list(process.env.CORS_ORIGINS, [
      `http://localhost:${port}`,
      'http://127.0.0.1:5173',
      'http://localhost:5173',
      'http://127.0.0.1:4173',
      'http://localhost:4173'
    ]),
    allowAll: bool(process.env.CORS_ALLOW_ALL, false)
  },

  bodyLimit: process.env.BODY_LIMIT || '128kb',
  maxTextLength: num(process.env.MAX_TEXT_LENGTH, 4000),

  rateLimit: {
    enabled: bool(process.env.RATE_LIMIT, !bool(process.env.DISABLE_RATE_LIMIT, false)),
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    max: num(process.env.RATE_LIMIT_MAX, 240),
    writeMax: num(process.env.RATE_LIMIT_WRITE_MAX, 60)
  },

  storage: {
    // DATA_DIR lets tests and deployments point persistence somewhere else.
    dir: process.env.DATA_DIR
      ? path.resolve(root, process.env.DATA_DIR)
      : path.join(root, 'server', 'state'),
    auditFile: 'audit.jsonl',
    consentFile: 'consents.json',
    sessionFile: 'sessions.json',
    allowDemoReset: bool(process.env.ALLOW_DEMO_RESET, true)
  },

  triage: {
    engineVersion: '2.0.0',
    // Sessions escalate only: a later "ok thanks" can never clear an earlier red flag.
    sessionTtlMs: num(process.env.SESSION_TTL_MS, 60 * 60 * 1000),
    maxSessionMessages: 40
  },

  consent: {
    ttlMs: num(process.env.CONSENT_TTL_MS, 30 * 60 * 1000),
    maxViews: num(process.env.CONSENT_MAX_VIEWS, 5)
  },

  llm: {
    enabled: bool(process.env.LLM_ENABLED, Boolean(process.env.LLM_API_KEY || process.env.OPENAI_API_KEY)),
    apiKey: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    timeoutMs: num(process.env.LLM_TIMEOUT_MS, 8000)
  },

  logging: {
    level: process.env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),
    requests: bool(process.env.LOG_REQUESTS, nodeEnv !== 'test')
  },

  // Google Maps integration for real location & nearby facilities
  googleMaps: {
    apiKey: process.env.GOOGLE_MAPS_API_KEY || '',
    enabled: Boolean(process.env.GOOGLE_MAPS_API_KEY)
  },

  // Default care-directory location. Everything shipped here is synthetic demo data.
  geo: {
    defaultLat: num(process.env.DEFAULT_LAT, 26.8467),
    defaultLng: num(process.env.DEFAULT_LNG, 80.9460),
    defaultCity: process.env.DEFAULT_CITY || 'Lucknow',
    defaultRadiusKm: num(process.env.DEFAULT_RADIUS_KM, 40)
  }
};

fs.mkdirSync(config.storage.dir, { recursive: true });

export default config;
