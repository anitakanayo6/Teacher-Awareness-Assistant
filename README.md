# Teacher Awareness Assistant

**Notice changes. Understand context. Respond with care.**

A complete AfriHack prototype that helps teachers turn classroom observations into practical, empathetic next steps. A student who becomes quiet, misses homework, or struggles to participate may need support. This product helps teachers pause before interpreting those changes as laziness or poor discipline.

> This tool does not diagnose mental health conditions. It helps teachers notice patterns, consider possible explanations, and choose appropriate supportive next steps.

The product is a structured workflow, not a chatbot:

**Observation → Context → Safe guidance → Conversation support → Follow-up**

## Run locally

Requires **Node.js 24 or newer** and **pnpm 11**. SQLite is built into Node; no database service or AI key is needed. Google Chrome is needed only for the default browser tests.

```sh
corepack enable
corepack prepare pnpm@11.19.0 --activate
pnpm install
pnpm dev
```

Open **http://127.0.0.1:3000**. A new browser workspace receives three fictional assessments automatically.

If Corepack is not available, install pnpm with `npm install -g pnpm@11.19.0`. The scripts are also compatible with npm: `npm install`, `npm run dev`, `npm test`, `npm run build`, `npm start`. The checked-in pnpm lockfile is the reproducible dependency reference.

For production:

```sh
pnpm build
pnpm start
```

No environment file is required. To customise configuration, copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell, or `cp .env.example .env` on macOS/Linux). Development and production both read `.env`.

## Features

- Responsive teacher dashboard with recent assessments, counts and due follow-ups.
- Three-step assessment: anonymous context, selected observations, duration, frequency, related context, factual notes and mandatory safety review.
- Neutral summary, possible factors, explained support signal, reviewed actions, conversation starters and follow-up plan.
- Immediate safeguarding pathway for safety answers, uncertainty about safety, or detected concerning text; no AI request on this path.
- SQLite persistence, details, history search/filters, follow-up scheduling, completion/reopening and deletion.
- Six practical educational resources with further-reading links.
- Fictional low, moderate and elevated/safeguarding examples in each new workspace.
- Field validation, loading, server/network recovery, provider fallback, mobile navigation and keyboard focus.
- Transparent demo/AI/fallback labels, configurable local contacts and privacy limitations.

## Three-minute judge demo

1. Open the overview. Explain: “Behavior is a starting point for curiosity, not a diagnosis.” The examples show different support pathways.
2. Choose **Check a concern → Fill fictional example**. Use Student A or another fictional identifier. Continue to see the selected observations and context.
3. Continue to review. Review the safety question, then choose **Prepare & save guidance**.
4. Walk through the summary, context, actions and conversation suggestions. Explain that demo mode needs no key. Optional AI selects reviewed content through a schema rather than generating unrestricted advice.
5. Change the follow-up date, save the schedule, and mark the follow-up complete. Return to history and reload to demonstrate persistence.
6. Open **Student C** to show immediate safeguarding guidance and the configurable contact panel. This is a separate safety route.

For a clean demo, use a new browser profile/incognito context; each gets its own seeded workspace. Delete records individually. Clearing cookies loses access to an old workspace but does **not** delete its data from the server.

## Architecture and stack

| Layer | Choice |
| --- | --- |
| Interface | React 19, TypeScript, Vite, Lucide icons, plain CSS |
| API | Express 5, same-origin JSON routes |
| Validation | Shared Zod input, provider-selection and guidance schemas |
| Persistence | Node 24 `node:sqlite`, SQLite WAL, parameterised queries |
| AI boundary | `AIProvider` interface, `AIService`, optional OpenAI-compatible adapter |
| Tests | Node test runner through tsx; Playwright desktop/mobile workflows |
| Deployment | One Node process, static assets, persistent SQLite disk; Dockerfile included |

The original repository contained only a problem statement in `README.md`; there was no implementation to replace. See [architecture decisions](docs/ARCHITECTURE.md) for the inspection record, rules, schema and safety boundaries.

```text
src/                 React pages, form, components, API client, styles
shared/              Zod schemas, reviewed guidance, resources, fictional examples
server/              Express app, AI adapter, SQLite repository and startup
tests/               Domain/API/persistence tests
tests/e2e/           Desktop/mobile journey, error recovery and visual checks
docs/                Architecture, verification notes and demo screenshots
```

## Database

The server creates `./data/teacher-awareness.db` and applies the idempotent version-1 migration in `server/db.ts`. No manual seed command or database installation is required.

- **Teacher/workspace:** anonymous workspace ID and created timestamp; authentication can replace this boundary later.
- **Assessment:** UUID, owner, created timestamp, validated input and guidance JSON, analysis mode.
- **Observation:** selected label associated with an assessment.
- **FollowUp:** date, pending/complete status and completion timestamp; deleted with its assessment.
- **Resource:** typed editorial data in `shared/resources.ts`, versioned with the application.

Creation is transactional. Reads, updates and deletes enforce ownership. The HTTP-only cookie contains a random token; only its hash is used as the workspace ID. This is **not verified teacher authentication**. Back up with a SQLite-aware backup process or while the server is stopped. Use a persistent deployment disk. Do not commit `data/`.

## Environment variables

**Required for the local demo: none.**

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address; use `0.0.0.0` in a container |
| `DATABASE_PATH` | `./data/teacher-awareness.db` | Writable SQLite file |
| `AI_PROVIDER` | `demo` | `demo` or `openai-compatible` |
| `AI_API_KEY` | unset | Server-only provider key; never use a `VITE_` prefix |
| `AI_BASE_URL` | `https://api.openai.com/v1` | HTTPS OpenAI-compatible base URL |
| `AI_MODEL` | unset | Available model supporting strict JSON Schema output |
| `COOKIE_SECURE` | `false` | `true` for HTTPS; `false` for local HTTP |
| `EMERGENCY_CONTACT` | unset | Approved local emergency contact text |
| `SAFEGUARDING_CONTACT` | unset | School safeguarding contact text |
| `WELLBEING_CONTACT` | unset | Counsellor/wellbeing team contact text |
| `CRISIS_RESOURCES` | unset | Local crisis resources text |
| `PLAYWRIGHT_CHANNEL` | `chrome` | Browser test channel, e.g. `msedge` |

Production is selected automatically by `pnpm start`; `NODE_ENV=production` is also supported. Contacts display as text, never HTML. No country-specific emergency number is assumed. Without contacts, the safety panel tells teachers to follow school procedures and use appropriate local emergency services.

## Optional AI

```dotenv
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=your-supported-model
AI_API_KEY=your-server-only-key
```

Restart after changing `.env`. `AIService.analyzeStudentConcern()`, `generateTeacherGuidance()` and `generateConversationSuggestions()` sit behind `AIProvider`. Another provider can implement the same validated contract.

The adapter uses [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) to select factor/action/conversation IDs from a reviewed catalog. It sends recorded fields excluding identifier and grade. Notes can still contain sensitive data if warnings are ignored. Arbitrary model prose is never displayed; the application assembles and validates the final guidance.

Safety checks run first. A model may raise a safety flag but cannot lower the rule-based support signal. Missing settings, a 15-second timeout, refusals, network failures, invalid JSON or invalid catalog keys produce deterministic fallback guidance, clearly labelled. `store: false` is requested; verify provider privacy/retention terms before any approved real-world use.

## Testing

```sh
pnpm test           # Validation, signals, safety, provider, API and database
pnpm check          # TypeScript
pnpm build          # Typecheck + production client/server build
```

Run the app in one terminal before browser tests:

```sh
pnpm start
# In a second terminal:
pnpm test:e2e
```

Tests use installed Google Chrome with desktop/mobile emulation. Set `PLAYWRIGHT_CHANNEL=msedge` to use Edge. For Playwright-managed Chromium, run `pnpm exec playwright install chromium` and set `PLAYWRIGHT_CHANNEL=chromium`.

Browser tests use isolated fictional workspaces and cover the entire journey, persistence after reload, safety, resources, loading, network/save recovery, keyboard progression, mobile navigation, overflow and rendered text contrast. Screenshots go to `docs/screenshots/`; failure reports go to ignored `playwright-report/` and `test-results/`. See [verification notes](docs/VERIFICATION.md) for the manual walkthrough and results.

## Deployment

Use a Node 24 service or Docker host with **one running instance** and a persistent disk. Container hosts with persistent volumes can run this architecture.

```sh
docker build -t teacher-awareness-assistant .
docker run --rm -p 3000:3000 -v taa-data:/app/data teacher-awareness-assistant
```

For a managed Node service, build with `pnpm install --frozen-lockfile && pnpm build` and start with `pnpm start`. Set `HOST=0.0.0.0`, the host's assigned `PORT`, and `DATABASE_PATH` to the mounted disk. Set `COOKIE_SECURE=true` behind HTTPS. Configure contacts using platform environment settings. `/api/health` checks the database connection.

Do not put SQLite on an ephemeral serverless filesystem or run replicas with separate databases. This is a fictional-data prototype; add appropriate access controls and abuse protection before public exposure. The Dockerfile requires a Docker-capable host to build/run. No remote deployment is claimed.

## Safety and privacy limitations

- **No diagnosis, clinical certainty, treatment or replacement for qualified professionals.** Support levels are unvalidated reflection rules.
- Explicit safety answers and conservative English text checks trigger fixed safeguarding instructions. They can overflag negations or miss indirect/non-English expressions. Teachers must act on concerns regardless of the result.
- Do not investigate abuse here, promise secrecy, or seek unnecessary personal information. Follow school policy and qualified safeguarding support.
- No verified login, institutional access control, encrypted student-record vault, audit trail, retention automation or professional validation. **Do not enter identifiable student information.**
- Records are stored on the server and scoped to a browser cookie. Anyone using that profile can access them. Removing the cookie does not delete records.
- React safely renders text. Credentials stay server-side. Mutations require JSON/custom headers; cross-origin browser mutations are rejected. Payload sizes, stored assessments and concurrent analyses are limited. Deployments still need security review and edge rate limiting.
- Follow-up completion records an action only. It does not establish safety or send notifications, referrals or messages.
- Live AI needs a compatible account/model and was not tested with real credentials; simulated provider responses test the adapter. The complete demo works without it.
- Educational further reading: [UNICEF teacher support](https://www.unicef.org/coronavirus/8-teacher-tips-student-mental-health), [UNICEF bullying guidance](https://www.unicef.org/parenting/child-care/bullying), [NSPCC safeguarding principles](https://learning.nspcc.org.uk/child-abuse-and-neglect/recognising-and-responding-to-abuse). Use local policy; UK-specific requirements are not universally applicable.
