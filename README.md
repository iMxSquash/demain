# Demain

> **FR:** Ton budget, ton serveur, ton demain.
> **EN:** Your money, your server, your tomorrow.

Demain is a free, open source, self-hosted personal budget web app that shows where your money will be in the months ahead and lets you compare possible futures, while your data stays on your own machine.

## Status

**Early development.** The repository contains the founding documentation, the application scaffold (Next.js, strict TypeScript, Tailwind CSS, ESLint, Vitest), authentication (password, optional TOTP), accounts with deposit ceilings and overflow chains, transactions and transfers entered by hand, flat categories with a to-categorize queue and categorization rules, the monthly synthesis, and the one-time migration of the sheet history. No container image or `compose.yaml` exists yet: everything else described below is a target tracked in the [roadmap](docs/ROADMAP.md).

The repository carries its full `.github/` structure from its initialization, and it stays private until the end of the first milestone.

## Why Demain exists

Demain replaces a personal Google Sheet used to track a budget month by month. The sheet had one tab per month, a template that went stale as subscriptions were added or changed price, dates edited by hand, and simulations done by hand. The full problem statement is in [PRODUCT.md](docs/PRODUCT.md).

## The three ideas

| Idea | What it means |
| --- | --- |
| **See ahead, without guessing** | The main views show what is real and what you have explicitly planned and dated. Estimation of your usual spending only exists inside simulations. |
| **Compare possible futures** | Put scenarios side by side on the same real history: monthly vs yearly subscription vs none, a large purchase, a new job, moving out. |
| **Stay at home** | Your data stays on your own machine. Nothing leaves your server unless you explicitly enable an optional feature that needs it. |

## Planned features

Details and definitions of done are in [ROADMAP.md](docs/ROADMAP.md).

| Milestone | Scope |
| --- | --- |
| **M1: Ledger** | Accounts (with optional deposit ceilings and overflow accounts), transactions, categories, monthly synthesis (net of the month, savings of the month, end-of-month balances), balance assertions with the unexplained gap, the real chart (month-end checking and savings curves), CSV/OFX import with categorization rules, one-time import of the sheet history, authentication, Docker packaging, encrypted backup and JSON export, i18n (French, English) and multi-currency foundations. |
| **M2: Planning** | Planned items (recurrences and one-off events) with versions, single-occurrence changes, rolling-average amounts and provisions, planned vs actual matching on import, calendar and monthly line views. M1 + M2 replace the sheet day to day. |
| **M3: Simulations** | Constant-pace simulation, scenario engine with 8 modification types, side-by-side comparison of 2 to 4 scenarios with diagrams, validating a scenario into planned items. |
| **M4: Bank sync** | Optional bank synchronization through a licensed aggregator, disabled by default. |

## Stack (planned)

| Layer | Choice |
| --- | --- |
| Application | Next.js, TypeScript in strict mode |
| Styling | Tailwind CSS v4 |
| Database | SQLite through Drizzle ORM |
| Packaging | One Docker container, multi-architecture image (x86-64 and ARM64), data in a Docker volume |
| HTTPS | Delegated to a shared reverse proxy (Caddy documented), one subdomain per application |

The reasoning behind each choice is recorded in [ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

Prerequisite: Node.js 22.13 or later (the CI uses the current LTS) and npm.

```
git clone https://github.com/iMxSquash/demain.git
cd demain
npm ci
cp .env.example .env
npm run dev
```

The app is then served on http://localhost:3000. Every environment variable is listed with a comment in [.env.example](.env.example); the app refuses to start when a required one is missing. The database is created and migrated at startup in `DEMAIN_DATA_DIR`.

On a fresh instance every page redirects to `/setup`, which creates the single account. It asks for the value of `DEMAIN_SETUP_TOKEN` and a password of at least 12 characters, and it is closed as soon as the account exists. Two-factor authentication (TOTP, with backup codes) is turned on from the Security page; the key is typed or opened as an `otpauth://` link in the authenticator app, there is no QR code.

A forgotten password is reset on the host, there is no e-mail reset: run `npm run auth:reset-password` (inside the container, `node scripts/reset-password.ts`) with `DEMAIN_DATA_DIR` set. The command asks for the new password without echoing it, replaces it and signs out every open session. It needs a Node.js that runs TypeScript natively (24, as in the future image).

The interface is available in French and English. The language is the one chosen with the selector in the page header (kept in a cookie), otherwise the first supported language of the browser, otherwise English. Calendar dates and "today" follow the time zone of the server: set `TZ` (for example `Europe/Paris`) when it differs from the one you live in.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Build the production bundle. |
| `npm start` | Serve the production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run the TypeScript compiler without emitting files. |
| `npm test` | Run the Vitest suite once. |
| `npm run auth:reset-password` | Reset the password of the single account (see above). |
| `npm run db:generate` | Generate a SQL migration in `drizzle/` after a change to `src/storage/schema.ts`. Migrations are committed and never edited once released. |

## Installation (target experience, not yet available)

> **Not available yet.** No image is published and no `compose.yaml` exists. This section describes the experience Demain aims for at the end of M1, so that design decisions stay aligned with it.

The goal is that self-hosting Demain takes a few minutes on a PC, a VPS or a Raspberry-class machine:

1. Copy a provided `compose.yaml` and `.env.example` (renamed to `.env`) into a folder.
2. Fill in the required environment variables, including the one-time setup token. The app refuses to start if one is missing.
3. Run `docker compose up -d`.
4. Point your reverse proxy at the container, on a dedicated subdomain (a Caddy example is documented).
5. Open the app in a browser, create the single user account with the setup token, and import your first bank export (CSV or OFX, 20 MB at most) from the Import screen.

Conceptually, the compose file declares one service and one volume, attached to the network your reverse proxy already uses. The port is never published on the host and the proxy is not part of this file, so several applications can share one host:

```yaml
# Conceptual only: image name, variables and paths will be defined during M1.
services:
  demain:
    image: <to be published>
    env_file: .env
    volumes:
      - demain-data:/data
    networks:
      - proxy
    restart: unless-stopped
volumes:
  demain-data:
networks:
  proxy:
    external: true
```

## Project structure

Main folders:

```
demain/
├── README.md
├── LICENSE                   AGPL-3.0
├── CHANGELOG.md
├── CONTRIBUTING.md
├── SECURITY.md
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── postcss.config.mjs        Tailwind CSS v4 PostCSS plugin
├── src/
│   ├── app/                  Next.js App Router (layout, pages, globals.css)
│   ├── auth/                 Password hashing, TOTP, backup codes, sessions, rate limiting, the single account
│   ├── proxy.ts              Deny-by-default access check for every page
│   ├── i18n/                 Language negotiation, calendar date formatting, next-intl request setup
│   ├── domain/               Pure domain logic, no clock, database or network (money core, account, transaction and overflow rules)
│   ├── ledger/               Account and transaction use cases on top of the storage layer
│   └── storage/              Drizzle schema, SQLite access, environment validation
├── scripts/                  Commands run on the host (password reset)
├── messages/                 One translation file per language (en.json is the reference)
├── drizzle/                  Versioned SQL migrations generated by drizzle-kit
├── tests/                    Vitest tests, synthetic fixtures in tests/fixtures/
├── .github/                  issue forms, PR template, CODEOWNERS, Dependabot, release notes, CI
└── docs/
    ├── PRODUCT.md            problem, vision, user journeys, scope
    ├── DOMAIN.md             glossary, entity model, invariants, algorithms
    ├── ARCHITECTURE.md       architecture, decision records, deployment, security
    └── ROADMAP.md            milestones, definitions of done, open questions
```

## Documentation

- [Product](docs/PRODUCT.md): why Demain exists and how it is meant to be used.
- [Domain](docs/DOMAIN.md): the vocabulary and the rules of the model.
- [Architecture](docs/ARCHITECTURE.md): technical decisions and their rationale.
- [Roadmap](docs/ROADMAP.md): what will be built, in which order, and what is still open.

## License

Demain is released under the **GNU Affero General Public License v3.0 (AGPL-3.0)**, see [LICENSE](LICENSE). The rationale for this choice is in [ARCHITECTURE.md](docs/ARCHITECTURE.md#adr-008-license-agpl-30).
