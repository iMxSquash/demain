# Roadmap

Demain is built in four milestones. Each one delivers something usable and ends with an explicit definition of done. There are no dates: milestones are ordered by value, and the order matters more than the pace. The product context is in [PRODUCT.md](PRODUCT.md), the model in [DOMAIN.md](DOMAIN.md), the technical decisions in [ARCHITECTURE.md](ARCHITECTURE.md).

**Current status: M1 (Ledger) in progress.**

| Milestone | Theme | Outcome |
| --- | --- | --- |
| [M1](#m1-ledger) | Ledger | The past is in Demain: accounts, transactions, monthly synthesis, the real chart, history migrated from the sheet. |
| [M2](#m2-planning) | Planning | The near future is in Demain, as real and dated items. **M1 + M2 replace the sheet day to day.** |
| [M3](#m3-simulations) | Simulations | Possible futures, with estimation, can be compared and turned into plans. |
| [M4](#m4-optional-bank-sync) | Bank sync | Optional automatic import through an aggregator. |

## M1: Ledger

**Why first.** Nothing can be projected without a reliable past. M1 also lays the foundations that are expensive to add later: authentication, i18n, multi-currency, integer amounts, packaging.

**Scope.**

- Repository initialization, first: the full `.github/` structure from the start (issue forms, pull request template, `CODEOWNERS`, `dependabot.yml`, CI workflow, release notes config), `LICENSE` (AGPL-3.0), `CHANGELOG.md`, `.env.example`. The repository stays private until the end of M1.
- Accounts (checking, Livret A, Livret Jeune, generic accounts), each with a currency, an opening balance, an optional deposit ceiling and an optional overflow account (chains allowed, cycles refused).
- Transactions: expense, income, interest (entered by hand), transfers as linked pairs.
- Categories (flat) and the to-categorize queue.
- Monthly synthesis: net of the month, savings of the month, end-of-month balances per account.
- The real chart: month-end checking and savings curves, real values only, with its data table.
- Balance assertions with the unexplained gap.
- CSV import with column mapping, OFX import, deduplication, categorization rules with rule suggestions.
- One-time import of the sheet history (January to October 2026), with opening balances and the overflow rule for savings.
- Authentication: single user, argon2id, secure session cookie, login rate limiting, optional TOTP with backup codes, first-run setup token, offline password recovery command.
- i18n foundations with French and English.
- Multi-currency foundations: currency per account, reference currency, manual exchange rates, optional ECB fetch disabled by default.
- Docker packaging: multi-architecture image published on GitHub Container Registry, volume, environment validation at startup.
- Backups: encrypted snapshot, JSON export, documented volume backup, and the documented Caddy setup behind a shared reverse proxy.

**Definition of done.**

- [ ] The sheet history from January to October 2026 is imported, and the monthly figures match the Summary tab to the cent for every month, or each difference is explained (acceptance test includes the [worked example](DOMAIN.md#worked-example-from-the-sheet): January cumulative account 2.98, February 159.05, and 56.27 + 2.98 = 59.25).
- [x] The first savings row of the sheet is split into 123.16 to the Livret Jeune and 450.00 to the Livret A, with a preview before commit.
- [x] A real bank CSV or OFX export can be imported twice without creating duplicates.
- [x] Categorizing a transaction by hand offers to create a rule, and the rule applies on the next import.
- [x] The three monthly views, the real chart and the balance assertion gap are correct, verified by unit tests on the synthesis.
- [x] A manual transfer above an account's ceiling shows the split and offers to deposit only the remaining room or to send the surplus to a chosen account (the overflow account pre-selected), interest is accepted, and an imported transaction above the ceiling is accepted with a warning.
- [x] An overflow chain that would create a cycle (direct or through several accounts), cross currencies or point to an archived account is refused, and evaluating corrupted data that contains a cycle terminates with an error instead of looping.
- [x] Amounts typed or imported as text ("1 143,88 €") are converted to integer minor units without any floating-point step, and displayed back correctly.
- [x] The UI is fully available in French and English, with locale-aware number and date formatting.
- [x] An account in a second currency is converted to the reference currency in totals using a stored rate.
- [ ] With default settings, the app makes no outbound network call.
- [x] The image runs on `linux/amd64` and `linux/arm64`; the app refuses to start when a required environment variable is missing.
- [x] A fresh instance creates its single account only through the setup token, and a forgotten password can be reset with the documented command.
- [ ] A backup can be restored from both the encrypted snapshot and the volume procedure, and the JSON export is valid against its documented schema.
- [ ] The security baseline in [ARCHITECTURE.md](ARCHITECTURE.md#security) is in place, and an accessibility check (axe and keyboard navigation) passes on the main screens.
- [ ] CI is green: lint, typecheck, tests.

## M2: Planning

**Why second.** Planned items are what the sheet could not do well (stale templates, hand-edited dates). With M2 the owner can stop using the sheet. Nothing in M2 estimates: everything in the future is explicit and dated.

**Scope.**

- Planned items: recurrences (monthly on day N or last day, yearly, every N months, every N weeks, quarterly) and one-off events, with start and end dates, an optional business-day rule (weekends only).
- Versions: change the amount or the whole schedule from a date, past occurrences untouched.
- Amount modes: fixed, or rolling average of the previous occurrences with a starting estimate (3 by default, 6 or 12 on request).
- Provisions: several transactions settling one occurrence (fuel), linked by account, category and an optional label filter.
- Automatic routing of planned transfers along the overflow chain when a ceiling is reached, with unplaced surplus flagged in the calendar.
- Single-occurrence overrides (move or change one occurrence, or cancel it) from the calendar and the monthly line view.
- Occurrences generated on the fly for any horizon.
- Statuses: planned, partial, confirmed, overdue, cancelled.
- Matching planned vs actual on import: window of plus or minus 5 days and 5% amount tolerance by default, configurable per item; ambiguous matches proposed for validation.
- Calendar view (month grid) and monthly line view with real transactions and dated planned items, with the daily balance computed from those only.
- The real chart continued beyond today with dated planned items, dashed.

**Definition of done.**

- [ ] All recurrence patterns generate correct dates across month ends, leap years and business-day adjustments, covered by unit tests.
- [ ] A price or schedule change with an effective date affects only occurrences on or after that date (tested with the salary example 1143.88 to 1171.47 and a rent moved from the 5th to the 1st).
- [ ] The rolling average reproduces the documented example, including the restart on a new version and the exclusion of cancelled and overdue occurrences.
- [ ] A single occurrence can be moved or changed from the calendar and from the monthly line view without altering the others.
- [ ] A provision of 90 settled by several transactions shows the remaining amount, never negative, and drops its leftover after its period.
- [ ] After an import, unambiguous matches are confirmed, ambiguous ones are proposed, and no ambiguous match is applied without validation.
- [ ] Unmatched occurrences become overdue after their window.
- [ ] The calendar and the monthly line view are usable by keyboard.
- [ ] The owner runs a full month in Demain without opening the sheet ([success criterion](PRODUCT.md#success-criteria)).

## M3: Simulations

**Why third.** Comparing futures is the distinctive feature of Demain, but it only makes sense on top of a trustworthy real trajectory (M1 + M2). Estimation lives here and nowhere else.

**Scope.**

- The constant-pace simulation, always available as the reference.
- Estimated variable spending: rolling average of the last 3 complete months per category (configurable to 6 or 12), editable per category, current month estimated for what remains, spread evenly over the remaining days.
- Scenarios as named lists of modifications on top of the constant-pace simulation.
- The 8 modification types handled by one cash flow engine: subscription change, one-off purchase, instalments or loan, income change, savings goal (and the inverse computation, following overflow chains), interest projection with a user-entered rate, category budget change, composite life event.
- Comparison of 2 to 4 scenarios over 6, 12, 24 months or a custom horizon, with the real history shared and drawn once.
- Indicators: final balance, minimum balance and its date, savings at a date, month-end curves, total cost over the horizon.
- Diagrams: month-end checking and savings curves (main), income and expenses per month, expenses by category, comparison table, each with its data table.
- Validating a scenario into planned items.

**Definition of done.**

- [ ] Each modification type has unit tests on its cash flow transformation, including rounding.
- [ ] The monthly vs yearly vs none subscription comparison from [PRODUCT.md](PRODUCT.md#4-comparing-monthly-vs-yearly-subscription-m3) works end to end.
- [ ] A loan with a zero rate and a non-zero rate produce the expected payment schedules.
- [ ] The savings goal inverse mode returns the monthly amount that reaches the target by the date, and reports any surplus that fits nowhere along the overflow chain.
- [ ] No estimation appears anywhere outside a simulation (tested on the real chart, the calendar and the monthly view).
- [ ] Validating a scenario creates the expected planned items, and the real trajectory reflects them.
- [ ] Charts have an equivalent data table and do not rely on color alone.

## M4: Optional bank sync

**Why last.** It depends on a third party and is not required for the core value. The app must remain fully functional without it.

**Scope.**

- An adapter interface for bank sources, with one implementation for a licensed aggregator.
- Disabled by default; enabling it is an explicit choice with a clear explanation of the privacy trade-off: storage stays local, but the aggregator sees transactions in transit.
- Synced transactions go through the same deduplication, categorization and matching as file imports.

**Before starting.** Verify the aggregators available at that time: coverage of the relevant banks, pricing, free tiers if any, terms for individual self-hosters, and data handling. None of this is assumed in this document.

**Definition of done.**

- [ ] The aggregator choice is documented as a decision record in [ARCHITECTURE.md](ARCHITECTURE.md#decision-records), with the verified terms.
- [ ] Sync can be enabled and disabled without data loss, and the app works identically with it disabled.
- [ ] Synced and file-imported transactions never duplicate each other.
- [ ] Aggregator credentials are only provided through environment variables or an equivalent secret mechanism, and never logged.

## Out of scope for now

| Item | Reason |
| --- | --- |
| Multi-user, shared budgets | Single-user per instance keeps authorization, data model and SQLite choice simple. Separate instances cover separate people. |
| Native mobile app | The web app should be usable in a phone browser; a native app doubles the work. |
| Reminders and notifications | Email would require an SMTP third party; an ICS feed would expose amounts to external calendar apps. Local web push may come later. |
| Machine-learning features | Categorization is rule-based by design ([ADR-010](ARCHITECTURE.md#adr-010-deterministic-rule-based-categorization)). |
| Investment and PEA tracking | Can be added later as generic accounts. Market valuation is a different problem. |
| Tax features | Country-specific and outside the budgeting need. |
| Public holidays in business-day rules | Weekends only in V1. Revisit if a real need appears. |

## Open questions

These are intentionally left undecided. Each will be resolved when its milestone starts and recorded in the relevant document.

| Question | When |
| --- | --- |
| Which aggregator to use for bank sync, under which terms. | M4 |
| Exact CSV column mappings per bank (beyond the owner's bank, Societe Generale). The importer is bank-agnostic; preset mappings can be contributed. | M1 and ongoing |
| Whether to add notifications later, and in which form (local web push is the candidate). | After M3 |
| Dark theme and phone layout details. | M2 |
