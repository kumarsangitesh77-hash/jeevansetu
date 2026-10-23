# JeevanSetu AI — v2.0 (frontend + backend)

JeevanSetu is a multilingual (Hindi / English / Hinglish) health-triage and
care-navigation prototype. v2.0 adds a complete Express backend: the browser is
now a thin client over a JSON API, and every safety decision is made
server-side by a deterministic rule engine.

- Hindi / English / Hinglish selector, with voice input and a text fallback
- Deterministic red-flag safety engine (emergency / urgent / routine)
- Vitals parsing: BP, SpO2, temperature (unit inference), pulse, blood sugar
- Age- and pregnancy-aware rules, including infant-fever escalation
- Sessions that **only escalate** — a later "I feel fine" never clears a red flag
- Geo-ranked synthetic care directory with capability matching
- Consent-scoped share tokens: unticked fields are never stored, so they cannot leak
- SHA-256 hash-chained, append-only audit log with in-app verification
- Medical-payment / OTP scam scanner with secret redaction
- Rate limiting, security headers, CSP, and graceful degradation offline
- Synthetic data only. No API key required.

## Run

```bash
npm install
npm run dev        # Vite dev server + API with hot reload
```

Open the Vite URL shown in the terminal (default http://localhost:5173).
The dev server proxies `/api` to the API on port 3001.

Production (single origin, no CORS or proxy involved):

```bash
npm start          # builds dist/ then serves it + the API from one port
```

Then open http://localhost:3001.

Other scripts:

```bash
npm run build      # bundle the frontend into dist/
npm run serve      # serve dist/ + API without rebuilding
npm run preview    # Vite preview with the /api proxy
npm test           # jest + supertest suite (56 tests)
```

### Note for macOS

The scripts pass `--configLoader native` to Vite. Vite's default loader bundles
`vite.config.js` with the esbuild helper binary, and macOS privacy protection
blocks that binary when the project lives in `Downloads`, `Documents` or
`Desktop` (the build hangs with no output). Native loading uses Node's own
module loader instead, works everywhere, and is faster. If you move the project
to an unprotected folder you can drop the flag.

## API

All routes are under `/api` and return JSON. Errors use one envelope:
`{ "error": { "message", "status", "path", "requestId", "details?" } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness + subsystem checks (storage, engine, care dir, audit chain) |
| GET | `/capabilities` | What this deployment supports (languages, LLM on/off) |
| GET | `/stats` | Counters for the demo dashboard |
| POST | `/triage` | Assess one message; returns level, flags, structured summary |
| POST | `/chat` | Consultation turn; keeps a session that only escalates |
| POST | `/chat/session` | Start a fresh session |
| GET | `/chat/greeting` | Localized greeting |
| GET/DELETE | `/chat/session/:id` | Inspect / reset a session |
| GET | `/care-options` | Geo-ranked facilities, capability-matched to the red flags |
| GET | `/care-options/:id` | One facility |
| POST | `/care-options/:id/contact` | Audited "I called / asked for ambulance" action |
| GET | `/emergency-contacts` | Localized 112 / 108 / 102 / 101 + helplines |
| POST | `/security-scan` | Scam verdict, indicators, structural findings, advice |
| POST | `/redact` | Mask OTP / PIN / card / phone / Aadhaar in a message |
| GET | `/consent/fields` | Shareable-field catalogue with sensitivity tiers |
| POST | `/consent` | Grant consent and mint a share token |
| GET | `/consent` | List this session's consents |
| POST | `/consent/:id/revoke` | Revoke and delete the snapshot |
| GET | `/share/:token` | Recipient view — only consented fields |
| GET | `/audit` | Recent audit events |
| GET | `/audit/verify` | Independently re-verify the hash chain |
| POST | `/audit/rotate` | Start a new chain (demo reset) |

Reads and writes have separate per-IP rate-limit budgets and return standard
`ratelimit-limit / ratelimit-remaining / ratelimit-reset` headers, plus
`retry-after` on 429.

## Configuration

Everything has a working default; see [`.env.example`](.env.example) for the
full list (port, host, CORS, rate limits, data dir, session/consent TTLs,
optional LLM layer, logging, default city).

The optional LLM layer is **conversation only**: it may rephrase a reply but can
never lower a level produced by the rule engine, and it refuses any model output
that tries to downgrade an emergency.

## Tests

```bash
npm test
```

- `tests/triage.test.js` — multilingual red flags, negation, vitals, age, escalation-only sessions
- `tests/scam.test.js` — scam verdicts and secret redaction
- `tests/consent.test.js` — snapshot scoping, view caps, revocation
- `tests/audit.test.js` — chain linking and tamper detection
- `tests/api.test.js` — the HTTP surface via supertest, including error envelopes and headers

Tests run against a temporary data directory (`DATA_DIR`), never `server/state`.

## Demo script

1. Home → **Consultation Start Karein**.
2. Select Hinglish.
3. Type or speak: `mere chest mein bahut dard hai aur saans lene mein problem ho rahi hai`.
4. Show the red Emergency screen with 112 / 108 call links and first-aid steps.
5. Open **Nearby care** and point at the DEMO DATA labels and capability match.
6. **Call** a facility to show the dialler sheet and "what to say".
7. Back → **Securely share karein**; tick only Symptoms + Risk result and show the live preview.
8. Share → open the recipient view → show that unticked fields are absent.
9. Security Center → **Verify hash chain** → "Intact".
10. Paste a scam message (`Hospital: your admission is cancelled. Pay Rs 5000 now to https://bit.ly/x and share OTP 482913.`), scan it, and show the redacted forward-safe copy.

## Safety architecture

The red-flag engine is deterministic and runs independently of any LLM. An LLM
can be added as a structured extraction/conversation layer, but its free-form
output must never override the safety rule result. Negation is honoured
("seene me dard nahi hai" is not chest pain) but only ever suppresses a single
matching phrase — any other active red flag still escalates.

## Important

This is a hackathon prototype, not a clinically validated triage tool. It does
not diagnose, prescribe, dispatch ambulances, process payments, or claim live
hospital availability. All facilities, numbers and availability figures are
synthetic.
