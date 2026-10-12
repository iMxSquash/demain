# Contributing to Demain

Thanks for your interest. Demain is currently in the **planning stage**: the repository contains documentation only, so useful contributions today are feedback on the documents in [docs/](docs/) and the roadmap. Code contributions become possible when the first milestone starts.

## Setup

The development setup does not exist yet. It will be described in the [README](README.md) once the application scaffold is committed, and this section will then list the exact commands.

## Workflow

1. Open an issue first for anything beyond a typo, using the issue forms (bug report or feature request), so the approach can be agreed before work starts.
2. Fork the repository, or create a branch if you have write access. Name the branch `type/short-description` in kebab-case, for example `feat/csv-import` or `fix/rounding-average`.
3. Make small, atomic commits. Do not mix a refactoring and a new feature in the same commit.
4. Open a pull request using the template. Keep it small and focused (ideally under 400 lines of diff), and link the issue it closes.
5. The CI must be green before merge. Pull requests are merged with squash and merge.

### Commit messages

[Conventional Commits](https://www.conventionalcommits.org/), in English, in the imperative present, lowercase, no trailing period, at most 72 characters:

```
type(scope): description
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. A breaking change adds `!` after the type and is explained in the body.

Pull request titles follow the same format.

## Tests, lint and typecheck

Lint, typecheck and tests must pass locally before you open a pull request, and they are run by the CI. The commands will be documented here when the scaffold exists. The testing approach is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#testing-strategy).

Every bug fix comes with a regression test that fails before the fix.

## Code standards

- TypeScript in strict mode, no `any` (use `unknown` and narrow).
- Amounts are integers in minor units, never floating-point numbers. See [docs/DOMAIN.md](docs/DOMAIN.md#invariants).
- Estimation of unplanned spending exists only in simulations. See [ADR-011](docs/ARCHITECTURE.md#adr-011-estimation-only-inside-simulations).
- Comments explain why, not what. No commented-out code.
- Accessibility target is WCAG 2.2 level AA.
- Never commit personal financial data, secrets or real bank exports. Test fixtures must be synthetic and live in `tests/fixtures/`.

## Reporting bugs and proposing features

Use the issue forms: bug report or feature request. Security vulnerabilities must **not** be reported in a public issue: see [SECURITY.md](SECURITY.md).
