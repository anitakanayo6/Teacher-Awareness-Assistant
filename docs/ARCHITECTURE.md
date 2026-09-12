# Engineering decisions

## Repository inspection

The upstream `main` branch contained one tracked file, `README.md` (blob `5037fe6af7094c780d355ca0db3561e2c2d022a7`). It described the problem but contained no source, dependencies, configuration, application, or database. The original problem and purpose are preserved in the new README.

## Boundaries

`src/` is a React/TypeScript single-page app. Express serves both the API and Vite assets on one origin. Production serves `dist/client`; development mounts Vite middleware. `shared/` holds input/output schemas, reviewed guidance, fictional examples, and educational resources. `server/` contains the provider boundary, SQLite repository, session isolation, and API. The browser bundle never imports server configuration or credentials.

1. A teacher records structured observations and explicitly reviews safety information.
2. The API validates JSON with Zod and checks safety before any provider request.
3. Explicit safety answers, uncertainty about safety, and conservative English text tripwires bypass AI. They produce fixed safeguarding guidance.
4. With no configured provider, rules select reviewed support content. With a provider, a strict schema limits its choices to content identifiers. Generated free-form text is never rendered.
5. Provider errors, refusals, timeouts and malformed JSON fall back to reviewed rule-based guidance with a visible mode explanation.
6. The repository writes an assessment, observations, and follow-up in one transaction before returning a result. The UI then opens the saved assessment.

## Signal rules

These are unvalidated reflection rules, not clinical prediction or risk probabilities:

- **Elevated / safety:** any explicit or detected safety concern.
- **Elevated / pattern:** at least four distinct observations, several weeks or more, often or almost daily.
- **Moderate:** persistence, frequency, three or more observations, bullying context/observation, or aggressive behavior.
- **Low:** other inputs; does not establish safety or absence of distress.

The provider cannot lower the deterministic signal. It can raise a safety flag. It cannot supply diagnoses, recommendations outside the catalog, fabricated contacts, or invented observations. A cautious text matcher will overflag some negations and may miss indirect wording or other languages. The mandatory teacher safety review and permanent escalation route are necessary; they do not turn this into a validated safeguarding system.

## Persistence

SQLite uses Node 24's built-in `node:sqlite` API, parameterised statements, foreign keys, WAL, a busy timeout, and cascading deletion. The idempotent version-1 migration is in `server/db.ts`; it runs on startup. Future changes should advance `PRAGMA user_version` with explicit migration steps rather than alter the first migration.

- `teachers`: anonymous workspace ID (a hash of a random browser token), created timestamp.
- `assessments`: UUID, workspace foreign key, timestamp, validated input/output JSON, analysis mode.
- `observations`: assessment foreign key plus unique observed label.
- `follow_ups`: assessment foreign key, ISO date, pending/complete, completion timestamp.
- `Resource`: typed, versioned editorial content in `shared/resources.ts`; not mutable database data.

There is no verified teacher authentication. The random HttpOnly SameSite cookie provides browser workspace separation, not an identity or institution authorization system. Ownership is included in every assessment read, update, and delete. There are no lists of other workspaces. The default server binds only to localhost. A published demo must use fictional data and additional platform access controls if appropriate.

## Privacy and deployment

No analytics, notes in logs, real names required, raw HTML rendering, browser API credentials, or automatic emails. Read-only external resource links send no referrer. Mutations require same-origin browser context and a custom header; JSON and payload sizes are checked. One analysis runs at a time per workspace, with a 100-assessment limit. This is not internet-scale abuse protection or professional security assurance.

The AI receives observation/context text, age range and safety answers. The identifier and grade are omitted; free text may still contain identifying details if the user ignores warnings. `store: false` is requested but does not replace checking provider privacy/retention terms. Real-world usage requires professional review, authentication, school approval, access management, data retention/deletion controls, encryption policies, audit design and operational safeguards.

Run one persistent Node instance with a writable SQLite volume. Do not use ephemeral serverless storage or multiple replicas writing separate local files. Docker supports deployment to services with persistent disks. No public deployment is performed as part of local implementation.
