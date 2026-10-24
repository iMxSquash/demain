# Architecture

This document describes how Demain is meant to be built and deployed, and records the technical decisions with their context, the alternatives rejected and their consequences. Nothing here is implemented yet; see [ROADMAP.md](ROADMAP.md) for the order of work. The domain vocabulary is defined in [DOMAIN.md](DOMAIN.md).

## Overview

Demain is a single Next.js application running in one Docker container, storing everything in one SQLite file on a Docker volume. HTTPS is terminated by a reverse proxy run by the user, shared with any other application on the same host. Two optional components make outbound calls and are disabled by default.

```mermaid
flowchart LR
    browser["Browser"]
    proxy["Shared reverse proxy (user-managed)<br/>Caddy documented<br/>HTTPS termination, one subdomain per app"]

    subgraph container["Docker container"]
        app["Next.js app (TypeScript)<br/>UI + server logic"]
        rates["ECB rate fetcher<br/>(optional, off by default)"]
        adapter["Aggregator adapter<br/>(optional, M4, off by default)"]
    end

    volume[("Docker volume<br/>SQLite database file")]
    ecb["ECB public rates"]
    aggregator["Licensed bank aggregator"]

    browser -- HTTPS --> proxy
    proxy -- HTTP, private network --> app
    app --> volume
    app -.-> rates
    app -.-> adapter
    rates -. "outbound, no personal data" .-> ecb
    adapter -. "outbound, transactions in transit" .-> aggregator
```

Dashed arrows are optional and disabled by default. With default settings, the app makes no outbound network call.

## Module boundaries

The application is split into modules with explicit responsibilities. The projection and recurrence logic is pure (no database, no clock, no network) so that it can be tested in isolation.

| Module | Responsibility | Depends on |
| --- | --- | --- |
| **auth** | Single-user account, first-run setup token, password hashing, sessions, optional TOTP with backup codes, offline password recovery, login rate limiting. | storage |
| **ledger** | Accounts (with deposit ceilings), transactions, transfers, categories, balance assertions, monthly synthesis, real chart data. | storage, currency |
| **import** | CSV and OFX parsing, column mappings, deduplication, categorization rules, the to-categorize queue, sheet migration. Later hosts the aggregator adapter interface (M4). | ledger, planning (for matching) |
| **planning** | Planned items and their versions, occurrence generation, overrides, business-day rules, rolling-average amounts, provisions, planned vs actual matching, calendar data. | ledger, currency |
| **scenarios** | Constant-pace simulation, estimated variable spending, scenarios, modifications, the cash flow transformation engine, indicators, comparison, validation into planned items. | planning, currency |
| **currency** | Minor unit arithmetic, parsing and formatting of amounts, exchange rates, conversion to the reference currency, optional ECB fetcher. | storage |
| **i18n** | Translation files (French and English at launch), language negotiation, locale-aware formatting of dates, numbers and amounts. See ADR-014. | none |
| **export** | Encrypted database snapshot, JSON export. | storage |
| **storage** | Drizzle schema, migrations, database access. Only module that talks to SQLite. | none |

Rules:

- UI components do not access the database; they call server-side functions of the modules.
- Domain computations (occurrences, matching, projections, indicators) receive "today" and all data as inputs; they never read the clock or the database themselves.
- The import module depends on interfaces for bank sources (file import now, aggregator later), so adding M4 does not change the rest of the app.
- Estimations of unplanned spending exist only in the scenarios module. The ledger and planning modules never estimate: the real trajectory is made of real transactions and explicitly dated planned items. The only averaging outside simulations is the rolling-average amount of a planned item, which the user chooses item by item.
- Money enters and leaves the application as text and is converted to integer minor units on input, never through a floating-point number; it is converted back to a decimal string only for display and export.

## Decision records

Each record follows the same structure: context, decision, alternatives rejected, consequences.

### ADR-001: Build from scratch

**Context.** Mature open source, self-hosted budget apps exist, notably Actual Budget and Firefly III. The owner estimates they cover roughly 70% of the need: budgeting, bank file import, categorization.

**Decision.** Build Demain from scratch.

**Alternatives rejected.**

- *Adopt Actual Budget or Firefly III.* They do not offer a comparative scenario engine (several possible futures side by side with indicators), which is the core of Demain. The planned item model (one entity for recurrences and one-off events, versions with effective dates, occurrences computed for unlimited horizons, matching with tolerances) does not map well onto their data models.
- *Contribute the missing features upstream.* The scenario engine touches the data model deeply; imposing it on an existing project with its own direction is unlikely to be welcome and would be slower than a focused app.

**Consequences.** More work for M1, which rebuilds basic ledger features that already exist elsewhere. In exchange, the data model is designed around projection and scenarios from the start. Actual Budget and Firefly III remain valid, more mature choices for users who do not need simulations, and the README should say so once the project is public.

### ADR-002: Next.js and TypeScript strict

**Context.** One developer, one deployable unit, a web UI with server-side logic, and a domain where type errors (amounts, dates, currencies) are costly.

**Decision.** Next.js with TypeScript in strict mode, no `any` (use `unknown` and narrowing). UI and server logic live in one application and one container.

**Alternatives rejected.**

- *Separate frontend and API services.* Two deployables and an API contract to maintain, with no benefit for a single-user app.
- *Plain JavaScript.* Loses compile-time checks on exactly the code that matters most (money and dates).

**Consequences.** One build, one image, one process. The domain logic must still be kept out of UI components (see [Module boundaries](#module-boundaries)) so it stays testable and independent of the framework.

### ADR-003: SQLite through Drizzle ORM

**Context.** Single user, a few thousand transactions per year, self-hosting by non-experts on modest hardware.

**Decision.** SQLite as the database, accessed through Drizzle ORM, with the database file stored in a Docker volume.

**Why SQLite.**

- A single file in a volume: no second container, no exposed database port, nothing extra to secure.
- Backup is a file copy made safely (see [Backups](#backups)).
- The expected data volume is far below SQLite's limits.
- Simple for other people to self-host.

**Costs accepted.**

| Cost | Mitigation |
| --- | --- |
| Single writer at a time | Fine for a single user. |
| Looser typing than PostgreSQL | Amounts as integer minor units, schema validation in the application, strict TypeScript types from Drizzle. |
| More limited schema migrations (some column changes need table rebuilds) | Drizzle generates and versions migrations. |
| No native encryption at rest | See [ADR-005](#adr-005-encryption-at-rest-delegated-to-the-host). |

**Alternatives rejected.**

- *PostgreSQL.* A second container and a credential to manage, for concurrency the app does not need.

**Reversal conditions.** Revisit if Demain needs multi-user concurrent access or real-time sync across devices. Drizzle supports PostgreSQL, which keeps a migration path open.

**Consequences.** The SQLite driver for Node.js is a native dependency; the multi-architecture image must build it for each target (see [ADR-004](#adr-004-one-multi-architecture-docker-container)).

### ADR-004: One multi-architecture Docker container

**Context.** The owner has no VPS yet and wants Demain to run anywhere: a PC, a VPS or a Raspberry-class machine. Other self-hosters have the same variety.

**Decision.** Ship one Docker image built for x86-64 (`linux/amd64`) and 64-bit ARM (`linux/arm64`). Data lives in a Docker volume. Configuration comes only from environment variables. The image is published on GitHub Container Registry, next to the CI that builds it.

**Alternatives rejected.**

- *Native installers per OS.* Much more packaging work for little gain over Docker.
- *Several containers (app, database, worker).* No need given ADR-002 and ADR-003.
- *Docker Hub.* Works, but adds a second account and secrets to manage when the code and the CI already live on GitHub.

**Consequences.** Users need Docker. 32-bit ARM is not targeted. Native dependencies must be built per architecture in CI.

### ADR-005: Encryption at rest delegated to the host

**Context.** Financial data is sensitive. SQLite has no native encryption at rest.

**Decision.** Encryption at rest is delegated to the host (full-disk encryption or an encrypted volume), and the documentation explains how. Backups use a password-encrypted snapshot of the database produced by the app, plus a documented procedure to back up the Docker volume. A JSON export is available for portability (see [Backups](#backups)).

**Alternatives rejected.**

- *SQLCipher in V1.* Heavier image and an additional native dependency to build for every architecture, for a protection the host can provide.

**Reversal conditions.** Revisit if the database file must leave the host disk (for example, automatic off-site sync of the raw file).

**Consequences.** On a host without disk encryption, the database file is readable by anyone with access to the volume. The documentation must state this plainly. With several applications on the same host, disk encryption matters more, not less.

### ADR-006: HTTPS delegated to a shared reverse proxy, Caddy documented

**Context.** Ports 80 and 443 of a host can be used by one process only, and the host may run other applications next to Demain (the owner plans a second system). Certificate management differs from one setup to another.

**Decision.** The container serves HTTP on a private port that is never published on the host. HTTPS is terminated by a single reverse proxy shared by all the applications of the host, which routes by host name. Demain gets its own subdomain (for example `demain.example.com`), not a sub-path. The proxy is not part of Demain's compose file: Demain joins an external Docker network that the proxy also joins. Caddy is the documented proxy, with one complete example. The documentation also lists what Demain expects from any proxy: terminate HTTPS, forward the original host and protocol, never expose the app port directly.

**Alternatives rejected.**

- *Traefik.* Label-based discovery is attractive with many containers, but it normally needs access to the Docker socket, which is equivalent to root on the host: a poor trade for an application holding financial data. Its concepts (entrypoints, routers, services, middlewares) are also heavy for a single service.
- *nginx.* Very common and well documented, but it has no automatic HTTPS (a certificate client and a renewal job must be added and maintained) and its configuration is more verbose, leaving more room for a missing security header.
- *Built-in TLS and certificate management.* Duplicates what proxies do well, complicates the image, and cannot share ports with other applications.
- *Serving under a sub-path.* Next.js supports a base path, but it is a recurring source of bugs (links, cookies, static assets) with no benefit.

**Consequences.** One shared proxy is a single point to keep secure and up to date. Only ports 22, 80 and 443 should be open on the host. Applications must not share volumes or databases: they share only the proxy network, so a compromised neighbor cannot read Demain's data directly. Session cookies are marked `Secure`, so the app is expected to be reached over HTTPS (a local-only development mode is the exception). Users of Traefik or nginx follow the list of expectations instead of a maintained example.

### ADR-007: Amounts as integer minor units, dated exchange rates

**Context.** Binary floating point cannot represent most decimal amounts exactly, and totals drift. The app is multi-currency from day one.

**Decision.** All amounts are integers in the currency's minor unit (cents for EUR), converted to a decimal only for display. Text amounts are parsed by string handling, never through a floating-point number, including when reading CSV, OFX and sheet files. Each account has a currency; transactions inherit it. Totals use one user-chosen reference currency, converted with dated exchange rates stored in the database. Rates are entered manually by default; an optional fetch of public ECB reference rates exists but is **disabled by default**.

**Alternatives rejected.**

- *Floats or decimals as strings everywhere.* Floats are wrong; decimal strings make arithmetic error-prone.
- *Automatic rate fetch on by default.* It is an outbound call, which breaks the default "nothing leaves the server" promise even if no personal data is sent.

**Consequences.** Every division (averages, percentages, interest, loan payments) needs an explicit rounding step, which is tested. Exchange rates must also be stored exactly (for example as scaled integers). Simulations in the reference currency depend on the latest known rate.

### ADR-008: License AGPL-3.0

**Context.** Demain is server software meant to be self-hosted. The owner wants personal self-hosting to stay frictionless, while preventing a closed hosted fork.

**Decision.** AGPL-3.0.

**Alternatives rejected.**

- *MIT.* Simple and permissive, but allows anyone to run a modified version as a closed hosted service without sharing changes.
- *GPL-3.0.* Its obligations trigger on distribution; offering the software over a network is not distribution, so a hosted fork could stay closed.

**Consequences.** Anyone who runs a modified Demain for users over a network must offer them the source of that version. Personal self-hosting, modified or not, is unaffected in practice. Some companies avoid AGPL dependencies; this is acceptable for an end-user app.

### ADR-009: Bank sync only through an optional aggregator adapter

**Context.** Under PSD2, access to bank account data APIs is reserved to licensed providers; an individual cannot call these APIs directly for their own account. Demain must work with any bank.

**Decision.** V1 imports files only (CSV and OFX), fully local. Bank sync arrives in M4 through an aggregator behind an adapter interface, optional and disabled by default. The app must work fully without it.

**Alternatives rejected.**

- *Bank sync in V1.* Ties the app to a third party and its terms before the core value exists.
- *Scraping bank websites.* Fragile, often against bank terms, and requires storing bank credentials.

**Consequences.** The privacy trade-off must be explicit to users: with sync enabled, **storage stays local but transit does not**. The aggregator sees the transactions it relays. Which aggregator, at what price and under which terms is not decided; offers must be verified at implementation time (see [ROADMAP.md](ROADMAP.md#open-questions)).

### ADR-010: Deterministic, rule-based categorization

**Context.** Imported transactions need categories, and data must not leave the server.

**Decision.** User-defined rules (for example, label contains a text gives a category), bootstrapped from the sheet history. The app suggests a rule when the user categorizes by hand. Unmatched transactions go to a to-categorize queue.

**Alternatives rejected.**

- *Learned models or external categorization services.* Opaque results, and external services would send data off the server.

**Consequences.** Categorization is predictable and explainable ("this rule matched"). It needs some setup at first, which the migration bootstrap reduces.

### ADR-011: Estimation only inside simulations

**Context.** The owner wants the main views to show only what is real or explicitly planned and dated ("no guess that I might go out this month"). At the same time, a simulation is only useful if it can say what happens if life continues at the same pace.

**Decision.** The real trajectory (chart, calendar, monthly lines) contains real transactions and explicitly dated planned items, never an estimation of unplanned spending. Estimation (rolling average of recent months per category) exists only in simulations, starting with the constant-pace simulation that is always present as a reference. A planned item may follow a rolling average of its own previous occurrences, but only because the user chose that mode for that item.

**Alternatives rejected.**

- *An always-on projection of variable spending in the main views.* It mixes facts and guesses in the same curve and makes it impossible to tell what is real.
- *Comparing the real trajectory directly with scenarios.* It would mix the effect of a decision with the effect of the estimation. All simulations share the real history and diverge from today, the constant-pace simulation being the fair reference.

**Consequences.** Two computations coexist and must be kept separate (see the rule in [Module boundaries](#module-boundaries)). The comparison view draws the real months once, then one curve set per simulation.

### ADR-012: Charts as hand-written SVG

**Context.** Demain needs a few simple charts: month-end curves for two to four series, bars, a category breakdown. The requirements are mostly about accessibility: planned values drawn differently from real ones without relying on color, an equivalent data table for every chart, keyboard operability. The first chart ships with M1.

**Decision.** Charts are React components rendering SVG, using only the `d3-scale` and `d3-shape` modules for scales and path generation. No charting framework.

**Alternatives rejected.**

- *Recharts or visx.* Faster to start, but heavier or lower level, and the accessibility requirements (patterns, markers, data tables) would still be written by hand, around the library.
- *Canvas libraries (Chart.js and similar).* Canvas output is not accessible to screen readers, so every chart would need a duplicated DOM version.
- *ECharts or Plotly.* Large and oversized for four simple charts.

**Consequences.** More initial code to write: axes, ticks, hover and focus, responsive width. In exchange, a small footprint, full control of dashed lines, markers and tables, server-side rendering for free, and no chart framework to keep updated. A shared set of small chart primitives should be built once and reused by the real chart and the simulation diagrams.

### ADR-013: Overflow chains at account level, protected against cycles

**Context.** The Livret Jeune has a ceiling of 1 600 EUR and the surplus goes to the Livret A. Recurring transfers will reach such ceilings in the future, when no one is there to answer a question. The configuration comes from user input and cannot be trusted.

**Decision.** The ceiling and the overflow account are properties of the account, not of each planned item. Chains of overflow accounts are allowed. Manual transfers show the split and let the user choose; planned and simulated transfers follow the chain automatically, and what fits nowhere stays in the source account. The chain is validated on every save and on every load of external data (no cycle, same currency, no archived target, referenced accounts cannot be archived or deleted), and evaluated with a visited set so that a corrupted chain can never loop.

**Alternatives rejected.**

- *Overflow account chosen per planned item.* Repeats the same rule in every item and lets items disagree with each other.
- *A warning only, resolved by hand each time.* It is what the sheet required, and it is the manual work Demain exists to remove.
- *A single level of overflow.* Does not cover an account that overflows to a second capped account.

**Consequences.** The account screen must validate a graph, not just a field. The routing logic is a pure function shared by manual entry, planned items, simulations and the sheet migration, and it needs thorough tests for cycles and partial fits.

### ADR-014: Language from a cookie, translation files discovered on disk, domain messages as keys

**Context.** The interface must exist in French and English from the first milestone, and a contributor must be able to add a language without touching the code. The domain is pure and must stay free of any language, yet its validation errors are shown to the user.

**Decision.** One JSON file per language in `messages/`, named after its BCP 47 tag, `en.json` being the reference. The language of a request is the cookie set by the header selector, then the `Accept-Language` header, then English; there is no locale prefix in the URLs. The domain raises a message reference (a key of the `feedback` namespace plus values) next to its English log message, and the application translates it on the server. Calendar dates are shown as UTC days, and "today" follows the time zone of the server (`TZ`).

**Alternatives rejected.**

- *A locale prefix in the URL (`/fr`, `/en`).* Useful for search engines, pointless for a private authenticated app, and it complicates every link and redirect.
- *A static registry of languages in the code.* Safer for bundling, but adding a language would then require a code change.
- *Translating in the domain.* Ties the pure core to a language and to a request context.

**Consequences.** The `messages/` directory is read at runtime and must ship next to the application, which the Docker packaging has to account for. A test checks that every file has the keys and placeholders of the reference. A new domain error needs its key in the translation files and its reference at the throw site.

## Tooling

Default choices for the implementation. They can be revisited when a milestone starts; none is exotic.

| Subject | Choice | Why |
| --- | --- | --- |
| Input validation | Zod | Schema validation shared between forms and server functions, strict TypeScript inference. |
| SQLite driver | better-sqlite3 | Standard driver with Drizzle; the native dependency already anticipated in ADR-003. |
| i18n | next-intl | Built for Next.js, locale-aware formatting of dates, numbers and amounts. |
| Unit and integration tests | Vitest | The risky core is pure code that runs fast without a browser. |
| End-to-end tests | Playwright | A few critical journeys only. |
| Accessibility checks | axe-core in tests, plus a manual Lighthouse audit on the main screens | Automated regression catch plus a periodic human-readable report. |
| Package manager | npm | Ships with Node, nothing extra for a contributor to install. |
| Reverse proxy | Caddy (documented) | See ADR-006. |
| Image registry | GitHub Container Registry | See ADR-004. |
| Charting | Hand-written SVG components with `d3-scale` and `d3-shape` | See ADR-012. |

## Deployment

### Target topology

```
Internet or LAN
      |
Shared reverse proxy (HTTPS, Caddy documented) ---- one subdomain per application
      |                                  |
Demain container                   other applications
(HTTP, private network,            (own containers and volumes,
 port never published)              never shared with Demain)
      |
Docker volume (SQLite file)
```

- **Configuration:** environment variables only, listed with placeholder values in `.env.example`. The app validates them at startup and refuses to start if a required one is missing or invalid.
- **Compose:** one service, one named volume, attached to the external network of the reverse proxy (conceptual example in the [README](../README.md#installation-target-experience-not-yet-available)). The proxy is not in this file.
- **Host firewall:** only ports 22 (SSH), 80 and 443 are open.
- **Upgrades:** pulling a new image applies pending database migrations at startup. Migrations are versioned and never edited once released. Taking a backup before upgrading is documented as the standard procedure.
- **First run:** the setup page that creates the single user account is protected by a one-time setup token provided through the environment, and is disabled as soon as an account exists. Anyone reaching a fresh instance before the owner cannot take it over without that token.
- **Lost password:** there is no e-mail reset (no third party). A documented command run inside the container resets the password, access to the host being the proof of ownership. TOTP enrollment generates backup codes.
- **Repository:** private until the end of M1, with the full `.github/` structure from its initialization. The image is published on GitHub Container Registry.

### Backups

Three mechanisms, all documented:

1. **Encrypted snapshot (backup and restore).** A consistent copy of the database produced with SQLite's online backup mechanism (no need to stop the container), encrypted with a key derived from a password chosen at export time (argon2id key derivation and AES-256-GCM, in a versioned file format). It is the file to store off-site and the one used to restore.
2. **JSON export (portability).** A readable, versioned export of all the data with a documented schema, amounts as integers in minor units with their currency code. It is not encrypted by default and the interface says so when the file is created; the same password-based encryption is available as an option. The JSON export is for leaving or inspecting the data; restoring goes through the encrypted snapshot.
3. **Volume backup.** A procedure to back up the Docker volume. Copying a SQLite file while the app is writing can produce an inconsistent copy, so the procedure uses the online backup mechanism rather than a plain file copy.

Restoring from the snapshot and from the volume backup is part of the M1 definition of done.

## Security

Demain stores financial data, so the baseline applies from M1, not later.

| Area | Measure |
| --- | --- |
| **Authentication** | Always on, single user. Passwords hashed with argon2id. Optional TOTP second factor with backup codes. Generic error messages ("invalid credentials"). First account created only through a one-time setup token. No e-mail reset: offline recovery command inside the container. |
| **Sessions** | Session cookie `HttpOnly`, `Secure`, `SameSite`. No authentication token in `localStorage`. |
| **Brute force** | Rate limiting on login (and on TOTP verification). In-process limiting is sufficient for a single instance. |
| **CSRF** | `SameSite` cookies plus anti-CSRF protection on every state-changing request. |
| **Input validation** | Every external input (forms, query parameters, uploaded CSV and OFX files, future aggregator payloads) is validated server-side with a schema validator (Zod). Upload size is limited to 20 MB and file content is parsed, never executed. The CSV and OFX readers are hand-written, with no XML parser: nothing in a file can declare an entity, load another file or reach the network. |
| **Injection** | Parameterized queries only, through the ORM. No string-built SQL. |
| **XSS** | Output escaping by default. Imported labels are untrusted text and are never rendered as HTML. |
| **Headers** | `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. |
| **Secrets** | Only in environment variables, validated at startup, never committed, never logged. `.env.example` uses placeholders. |
| **Logs** | Structured, with levels. No passwords, tokens, amounts, labels or other personal financial data in logs. |
| **Outbound calls** | None by default. Each optional outbound feature is opt-in and documented with exactly what it sends. |
| **Co-hosting** | The container joins only the proxy network, shares no volume or database with other applications, and never mounts the Docker socket. |
| **Errors** | Generic messages to the user, details only in server logs. No stack traces in responses. |

## Accessibility

Target: WCAG 2.2 level AA.

- Semantic HTML first; ARIA only when no native element fits.
- Full keyboard navigation, visible focus, logical tab order, skip link. The calendar grid, the monthly line view and the scenario comparison must be operable by keyboard.
- Respect `prefers-reduced-motion`.
- **Charts never convey information by color alone:** series are distinguished by labels, patterns or markers (dashed for planned values, a distinct marker for real ones), and every chart has an equivalent data table.
- Amounts and dates are formatted per locale, and negative amounts are marked with a sign, not only a color.

## Testing strategy

| Level | Scope | Why |
| --- | --- | --- |
| **Unit (most tests)** | Occurrence generation (month ends, leap years, business-day rules, versions, overrides), rolling average (window, restart, exclusions, rounding), provisions, deposit ceilings and overflow chains (splits, cycles, currencies, corrupted data), projection, scenario transformations and indicators, minor unit arithmetic, rounding and text parsing of amounts, currency conversion, monthly synthesis (including the [worked example](DOMAIN.md#worked-example-from-the-sheet)). | The projection and recurrence engine is the risky core; errors there silently produce wrong futures. |
| **Integration** | CSV and OFX import, deduplication, categorization rules, planned vs actual matching (unique, ambiguous, none, provisions), sheet migration with the overflow rule, encrypted snapshot and JSON export, migrations on a real SQLite file. | These cross module and storage boundaries. |
| **End-to-end (few)** | First-run setup and login, monthly import routine, creating a planned item and seeing it in the calendar, moving a single occurrence, comparing scenarios. | Critical user journeys from [PRODUCT.md](PRODUCT.md#user-journeys). |

Rules:

- **Deterministic tests:** no real clock (today is an input), no network, no dependence on execution order.
- Every bug fix comes with a regression test that fails before the fix.
- CI runs lint, typecheck and tests on every pull request and on pushes to `main`.

## Conventions

- Conventional Commits for commit messages and pull request titles.
- Semantic Versioning with git tags (`v1.2.3`).
- `CHANGELOG.md` following Keep a Changelog, updated with each release.
- GitHub Actions are pinned by full commit SHA with the release in a comment, not by a movable tag, so that a compromised or rewritten tag cannot change what runs in CI. Dependabot updates the pins.
- The `.github/` structure (issue forms, pull request template, `CODEOWNERS`, `dependabot.yml`, release notes config, CI workflow) is created when the repository is initialized, not when it becomes public.
