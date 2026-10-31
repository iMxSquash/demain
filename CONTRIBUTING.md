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

### End-to-end journeys

There is no automated browser suite: a handful of journeys does not justify a heavy dependency and browser binaries (see the [testing strategy](docs/ARCHITECTURE.md#testing-strategy)). Walk the two journeys below by hand in a real browser, on a throwaway instance, before closing a milestone and after any change to what they cross (authentication, import, categorization, synthesis). Write the result in the pull request.

Start the instance as in step 1 of the accessibility check, on an empty data directory, and delete the directory afterwards. Use synthetic data only: the statement is `tests/fixtures/statement.csv` (four rows in February 2026), never a real bank export. Labels below are the English ones, the interface follows the browser language.

**Journey 1: first-run setup, then login**

1. Open `/`: you land on `/setup`.
2. Submit a wrong token with a valid password: the setup is refused with a generic message and no account is created.
3. Submit the token of `DEMAIN_SETUP_TOKEN` with a password of at least 12 characters, typed twice: the account is created and the home page opens, already signed in.
4. Open `/setup` again: you land on `/login`, the setup page is closed.
5. Click "Sign out", then open `/accounts`: you land on `/login`.
6. Submit a wrong password: the message is "Invalid credentials". Submit the right one: the home page opens.

**Journey 2: monthly routine**

Start from an empty instance, signed in.

1. On `/accounts`, add a checking account opened on `2026-01-01` with a balance of `100,00`.
2. On `/categories`, add the categories "Groceries" and "Salary". On `/rules`, add the rule "label contains `CARTE SHOP`" for "Groceries".
3. On `/imports`, choose the account and `tests/fixtures/statement.csv`, then "Preview": the columns are guessed, there are 4 new transactions and no duplicate, and the amounts read -12.50, 1 143.88, -12.50, -12.50. Click "Import": 4 transactions are imported.
4. On `/categories`, only `VIR SALAIRE ACME` waits in the queue, the three other rows were categorized by the rule. Choose "Salary", open "Also create a rule", tick the box and submit: the queue is empty and the new rule appears on `/rules`.
5. On `/synthesis`, February 2026 shows a net of 1 106.38 and an end-of-month balance of 1 206.38 (100.00 + 1 143.88 - 3 x 12.50), and the following months keep that balance.
6. Several files at once: on `/imports`, choose the account and select two CSV files together (the fixture and a second synthetic file with one impossible date such as `30/02/2026` and one row without label). "Preview" opens a dialog with one card per file. The row of the fixture already imported reads "Already in this account", the impossible date and the empty label are marked as problems and the card of that file cannot be imported until they are fixed in place. Cancel one card and import another: only the imported file adds transactions, and closing the dialog records nothing more. A CSV whose columns cannot be guessed gets a card that says so.

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
