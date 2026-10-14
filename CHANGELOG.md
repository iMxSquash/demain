# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Founding documentation: product, domain model, architecture decisions and roadmap.
- Application scaffold: Next.js (App Router), strict TypeScript, Tailwind CSS v4, ESLint, Vitest and the `lint`, `typecheck` and `test` npm scripts run by the CI.
- Storage layer: SQLite through Drizzle ORM, a first migration applied at startup, a configurable data directory (`DEMAIN_DATA_DIR`) and environment validation that stops the server when a required variable is missing.
- Money core: integer minor-unit amounts, text parsing without floating point (`1 143,88 €` becomes `114388`), localized formatting, per-currency decimals and an explicit rounding helper (nearest, ties away from zero).
- Accounts: create, edit and archive accounts (name, kind, currency, opening date and balance) from the `/accounts` screen. Archived accounts are hidden from the active list and kept for history. The currency rule is enforced in the domain and becomes effective once transactions exist.
- Repository structure: license (AGPL-3.0), `.github/` templates and CI skeleton, contribution and security policies.
