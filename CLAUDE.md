# CLAUDE.md

Demain is a self-hosted, open source personal budget web app (Next.js, TypeScript strict, SQLite via Drizzle, one Docker container). It replaces the owner's Google Sheet: real data in the main views, estimation only inside simulations.

The owner's general conventions (language, commits, security, accessibility, testing) are in the parent `CLAUDE.md` and apply here. This file only adds what is specific to this repository.

## Read first

1. [docs/ROADMAP.md](docs/ROADMAP.md): milestones, scope and definition of done. Find the current milestone there.
2. [docs/DOMAIN.md](docs/DOMAIN.md): vocabulary, entity model and the invariants that must always hold.
3. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): module boundaries and decision records (ADR-001 to ADR-016). Each ADR lists the alternatives already rejected: read it before proposing a different approach.
4. [docs/PRODUCT.md](docs/PRODUCT.md): why the product exists and the user journeys.

## Current state

- M1 is in progress: the scaffold, the storage layer, the money core, accounts with deposit ceilings and overflow chains, transactions and transfers, categories with the to-categorize queue, and categorization rules are in place. The milestone on GitHub and [docs/ROADMAP.md](docs/ROADMAP.md) say what is done and what remains.
- Next step: take the next open issue of the milestone whose dependencies are closed.
- Small items still open: the Discussions link in `.github/ISSUE_TEMPLATE/config.yml` points to a feature that is not enabled, `CODE_OF_CONDUCT.md` and CodeQL are due when the repository becomes public, and secret scanning and private vulnerability reporting must be enabled at that time.
- Undecided points are listed in the open questions of the roadmap. Do not invent an answer for them: ask.

## Rules specific to this repository

- `main` is protected: no direct push. Work on a branch named `type/short-description`, open a pull request, wait for a green CI, squash merge. The owner is the only maintainer and can bypass the review requirement as administrator.
- On a working branch, committing, pushing and opening a pull request are allowed without asking. This overrides the owner's global rule for this repository. Never commit or push on `main`, and never merge, tag or release without an explicit request from the owner.
- Ask before adding any dependency, including those already anticipated in the architecture document (for example `d3-scale` and `d3-shape`).
- GitHub Actions are pinned by full commit SHA with the release in a comment. Do not replace a SHA with a tag.
- Update the documentation in the same change as the behavior it describes: README, `docs/`, `.env.example`, `CHANGELOG.md`.
- Documentation and code comments are in English. No em dashes, no emojis.

## Invariants not to break

- Amounts are integers in minor units. Text amounts are parsed by string handling, never through a floating-point number. See DOMAIN invariant 1.
- No estimation of unplanned spending outside simulations: the real trajectory contains real transactions and explicitly dated planned items only. See ADR-011.
- Overflow chains between accounts are validated on every save and load (no cycle, same currency, no archived target) and evaluated defensively. See ADR-013.
- Nothing leaves the server by default: every outbound call is opt-in and documented.
- No personal financial data in the repository, in logs or in issues. Test fixtures are synthetic and live in `tests/fixtures/`.
- Domain computations (occurrences, matching, projections, indicators) receive "today" and their data as inputs: no clock, database or network access inside them.

## Where tasks are tracked

Tasks are GitHub issues grouped by milestone (M1 to M4). The definition of done of each milestone is the checklist in [docs/ROADMAP.md](docs/ROADMAP.md).
