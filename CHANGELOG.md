# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Founding documentation: product, domain model, architecture decisions and roadmap.
- Application scaffold: Next.js (App Router), strict TypeScript, Tailwind CSS v4, ESLint, Vitest and the `lint`, `typecheck` and `test` npm scripts run by the CI.
- Storage layer: SQLite through Drizzle ORM, a first migration applied at startup, a configurable data directory (`DEMAIN_DATA_DIR`) and environment validation that stops the server when a required variable is missing.
- Repository structure: license (AGPL-3.0), `.github/` templates and CI skeleton, contribution and security policies.
