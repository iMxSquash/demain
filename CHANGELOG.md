# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Founding documentation: product, domain model, architecture decisions and roadmap.
- Application scaffold: Next.js (App Router), strict TypeScript, Tailwind CSS v4, ESLint, Vitest and the `lint`, `typecheck` and `test` npm scripts run by the CI.
- Storage layer: SQLite through Drizzle ORM, a first migration applied at startup, a configurable data directory (`DEMAIN_DATA_DIR`) and environment validation that stops the server when a required variable is missing.
- Money core: integer minor-unit amounts, text parsing without floating point (`1 143,88 €` becomes `114388`), localized formatting, per-currency decimals and an explicit rounding helper (nearest, ties away from zero).
- Accounts: create, edit and archive accounts (name, kind, currency, opening date and balance) from the `/accounts` screen. Archived accounts are hidden from the active list and kept for history.
- Deposit ceiling and overflow chain: an account can have an optional ceiling and an overflow account. A pure function splits a transfer along the chain and reports the unplaced surplus, saving refuses cycles, other currencies and archived targets, and an account used as an overflow account can neither be archived nor change currency until the references change. Corrupted chains are evaluated defensively and never loop.
- Transactions: expenses, incomes and interest entered by hand with an optional note and payment mode, edited and deleted from the `/transactions` screen. A transfer is two linked transactions of opposite sign, recorded and deleted together, and it cannot be edited. Computed account balances are shown on `/accounts`.
- Manual transfer above a deposit ceiling: the split is shown before recording, with the choice to cancel, deposit only the room, or send the surplus to a chosen account (the overflow account is preselected and the same room check applies). An income above a ceiling is accepted with a warning, and interest is always accepted.
- Repository structure: license (AGPL-3.0), `.github/` templates and CI skeleton, contribution and security policies.

### Changed

- Archiving an account is refused unless its computed balance is exactly zero (a negative balance included). No transaction can be entered on, edited on or deleted from an archived account, and the currency of an account cannot change once it has a transaction.
