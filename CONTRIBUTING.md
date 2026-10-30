# Contributing to Demain

Thanks for your interest. Demain is in early development: the application scaffold exists and the first milestone is under way. Feedback on the documents in [docs/](docs/) and the roadmap is welcome, and code contributions follow the workflow below.

## Setup

Requirements: Node.js 22.13 or later and npm.

```
npm ci
cp .env.example .env
npm run dev
```

The app refuses to start when a required environment variable is missing; they are listed in [.env.example](.env.example). The scripts are listed in the [README](README.md#development).

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

Lint, typecheck and tests must pass locally before you open a pull request, and they are run by the CI:

```
npm run lint
npm run typecheck
npm test
```

Tests live in `tests/` and match `*.test.ts`. The testing approach is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#testing-strategy).

Every bug fix comes with a regression test that fails before the fix.

### Accessibility check

Axe is not part of the CI: it needs a browser on real pages with a session. Before closing a milestone, and after any change to a screen, run it by hand on every screen linked from the home page, with data in the database so that tables and the chart are rendered:

1. Build and start the app on a throwaway data directory (`npm run build`, then `DEMAIN_DATA_DIR=/tmp/demain-a11y DEMAIN_SETUP_TOKEN=<a token of 32 characters or more> npm start`), create the account on `/setup` and add a few accounts and transactions.
2. Serve `node_modules/axe-core/axe.min.js` from the app (a temporary `public/` directory, removed afterwards and never committed) and load it in the page from the browser console, copying the nonce of an existing script, because the content security policy refuses any other script: `const s = document.createElement("script"); s.nonce = document.querySelector("script[nonce]").nonce; s.src = "/axe.min.js"; document.head.append(s);`.
3. Run `await axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] })` and expect no violation. The text of the chart axes is reported as "incomplete" for the contrast rule, because axe cannot read a background under an SVG: check it by hand (the text is `neutral-700` on white).
4. Check the keyboard by hand: the first Tab reaches the "Skip to content" link, Enter moves to the content, every control is reachable with a visible focus, a confirmation dialog opens on its cancel button and Escape closes it, and the chart is read with the arrow keys.

## Code standards

- TypeScript in strict mode, no `any` (use `unknown` and narrow).
- Amounts are integers in minor units, never floating-point numbers. See [docs/DOMAIN.md](docs/DOMAIN.md#invariants).
- Estimation of unplanned spending exists only in simulations. See [ADR-011](docs/ARCHITECTURE.md#adr-011-estimation-only-inside-simulations).
- Comments explain why, not what. No commented-out code.
- Accessibility target is WCAG 2.2 level AA.
- Never commit personal financial data, secrets or real bank exports. Test fixtures must be synthetic and live in `tests/fixtures/`.

## Translations

The interface texts live in `messages/<language>.json`, one file per language, named after its BCP 47 tag (`en`, `fr`, `pt-BR`). `messages/en.json` is the reference.

To add a language:

1. Copy `messages/en.json` to `messages/<tag>.json` and translate every value. Keep the `{placeholders}` and `<tags>` of the original.
2. Run `npm test`: it checks that the file has exactly the keys of the reference, no empty message, the same placeholders, and that every message formats.

No code change is needed: the language shows up in the selector and in the language negotiation. The `messages/` directory must ship next to the application.

Rules for developers: no user-facing string in the code, read it with `useTranslations` (client) or `getTranslations` (server). The domain stays free of any language: it raises a `MessageRef` (a key of the `feedback` namespace plus values) that the application translates. Calendar dates and months go through `src/i18n/dates.ts`, amounts through `formatAmount` with the locale of the request.

## Reporting bugs and proposing features

Use the issue forms: bug report or feature request. Security vulnerabilities must **not** be reported in a public issue: see [SECURITY.md](SECURITY.md).
