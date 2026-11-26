# Demain design specification

This is the specification to follow when the visual identity is applied to the app. It says what to build and with which tokens. [DECISIONS.md](DECISIONS.md) says why, with the evidence behind each choice. When the two disagree, DECISIONS.md is the record and this file should be corrected.

The repository documents still win over this file: `docs/DOMAIN.md`, the ADRs in `docs/ARCHITECTURE.md` and the invariants in `CLAUDE.md`. Report any conflict to the owner rather than resolving it here.

## Contents

1. [Principles](#1-principles)
2. [Files and how they reach the app](#2-files-and-how-they-reach-the-app)
3. [Theme](#3-theme)
4. [Colour](#4-colour)
5. [Typography](#5-typography)
6. [Layout, space, shape and motion](#6-layout-space-shape-and-motion)
7. [Icons](#7-icons)
8. [Components](#8-components)
9. [Forms](#9-forms)
10. [Add-transaction flow](#10-add-transaction-flow)
11. [Charts](#11-charts)
12. [The holographic signature](#12-the-holographic-signature)
13. [Logo and app icons](#13-logo-and-app-icons)
14. [Voice](#14-voice)
15. [Accessibility checklist](#15-accessibility-checklist)
16. [Migrating the current classes](#16-migrating-the-current-classes)
17. [Planned items](#17-planned-items)
18. [Calendar](#18-calendar)
19. [Open points](#19-open-points)

## 1. Principles

1. **What is real is sharp; what is not real yet is blurred.** Real balances, transactions and charts of real data are drawn flat, in ink, on white. The holographic blur is reserved for estimates, simulations and brand moments (DOMAIN, ADR-011).
2. **One meaning per colour.**
   - Ink is the action.
   - Blue is today, focus and links.
   - Green is money in, red is money out, amber is "needs attention".
   - Nothing else is coloured.
3. **Never colour alone.** Every state also carries a sign, a word, an icon, a shape or a position.
4. **Number first.** A figure comes before the words that explain it. Amounts are large, regular weight, tabular.
5. **Calm.** Flat surfaces, a soft shadow for floating layers and a small one for a control lifted from its track, no decoration that does not carry information. Motion only shows a change: it is short, never bounces, never loops, and stops when the device asks for reduced motion ([section 6](#motion)).
6. **WCAG 2.2 AA everywhere.**
   - Text reaches 4.5:1.
   - Borders, rings, marks and chart lines reach 3:1.
   - Targets are 44 px or more.
   - Everything works with the keyboard alone.

   Every pair used by the identity is measured in DECISIONS.md: 148 pairs, none below threshold.

## 2. Files and how they reach the app

Everything below lives in `design-system-preview/identity/`. Steps 1 and 2 of the integration order are applied (#104): `src/app/tokens.css`, `src/app/globals.css` and `src/app/fonts/` are in the app, and `tests/design/identity-guard.test.ts` refuses the classes of section 16.

| File | Role | Destination in the app |
| --- | --- | --- |
| `tokens.css` | The only place where a value is written: primitives, then semantic tokens, light by default, dark through `prefers-color-scheme` or `data-theme` | `src/app/tokens.css`, which then becomes the source of truth (owner, 12 Nov 2026); the copy here stays as the reference pages were validated |
| `tailwind.css` | Tailwind v4 entry: imports Tailwind and `tokens.css`, declares the utility names, base styles, the `dark` variant, the `holo` utility | Replaces `src/app/globals.css` |
| `fonts/HostGrotesk-Variable.ttf`, `fonts/OFL-HostGrotesk.txt` | The text face and its licence | Self-hosted with the app, never fetched from a CDN. A WOFF2 subset made from the shipped TTF (owner, 12 Nov 2026), checked to keep U+202F mapped to the thin space (section 5), loaded with `next/font/local` (preload and size-adjusted fallback); `--font-sans` points at its variable |
| `theme/theme-preference.ts`, `theme/actions.ts`, `theme/tests/` | The appearance setting: cookie allowlist, `<html>` attribute, server action | `src/app/theme/` |
| `react/` | The trajectory chart, its geometry, its data table, and their tests. `react/preview/board.tsx` mounts it on `brand-board.html`, which carries its bundle inline; `react/preview/build-board.mjs` rebuilds that bundle (`node design-system-preview/identity/react/preview/build-board.mjs` from the repository root) | `src/charts/` and `src/app/`; the preview entries are not shipped |
| `icons/` | PNG app icons and the web manifest | 192, 512 and maskable PNGs in `public/icons/`; `apple-touch-icon.png` as `src/app/apple-icon.png`; `manifest.ts` as `src/app/manifest.ts` |
| `logo/` | Symbol, wordmark and lockups in every colour variant; favicon; app icon sources | `favicon.svg` as `src/app/icon.svg`; the others where the UI shows the logo |
| `components.html`, `form-proposals.html`, `brand-board.html` | Living references: open them next to this file. `components.html` holds the add-transaction flow and the custom pickers; `brand-board.html` shows the trajectory chart of `react/` | Not shipped |

### Integration order

1. Copy `tokens.css` and the font. Replace `globals.css` with `tailwind.css`, adjusting the import path and the font URL.
2. Migrate the classes listed in [section 16](#16-migrating-the-current-classes), in the same pull request as step 1 (owner, 12 Nov 2026). Tailwind drops a class it does not know without any error, so `tailwind.css` without the migration would leave the app unstyled (white text on no fill for the old blue buttons) while the build and the tests pass. A test that refuses the classes of section 16 keeps them out afterwards.
3. Add the theme setting (section 3) and render `data-theme` from the root layout.
4. Restyle the shared components (`FormField`, `ConfirmActionButton`, the toast provider, the locale switcher) to section 8.
5. Add the icons, the manifest and the favicon (section 13).
6. Replace `src/app/real-chart.tsx` with the trajectory chart (section 11). It needs `d3-scale` and `d3-shape`, already anticipated by ADR-012 and already in `package.json`.
7. Rebuild the add-transaction form as the flow of section 10.

Motion (section 6) lands with each component:
- The CSS transitions and the entrance utility come with `tailwind.css` in step 1.
- The `motion` npm package (owner's choice, 12 Nov 2026) is added once, in its own pull request with an ADR, before the first component that needs an exit (the toast). It runs behind `LazyMotion`.
- Its timings come from one module, `src/app/motion.ts`, which mirrors the motion tokens and turns them to 0 under reduced motion.

The icons (section 7) need `@phosphor-icons/react`, added the same way, in its own pull request, before the first component that shows an icon.

## 3. Theme

- **Three preferences:** System (default), Light, Dark. They are stored in a `theme` cookie (one year, `SameSite=Lax`, path `/`).
- **Server rendering:** the root layout reads the cookie and renders `data-theme="light"` or `data-theme="dark"` on `<html>`. It renders no attribute for System, so the CSS follows `prefers-color-scheme`. The first paint is right, with no script and no flash.
- **Validation:** `isThemePreference` accepts only the three values. `themeAttribute` turns any other cookie value into "no attribute".
- **The setting control:** a segmented control of native radio buttons ([section 8](#8-components)) inside a form posted to `setThemeAction`, like the language switcher. It works without JavaScript.
- **Using the tokens:** components use semantic tokens only, which switch on their own. The `dark:` variant exists (same selectors as `tokens.css`) but should almost never be needed. A `dark:` class in a component is a sign that a semantic token is missing.
- **Browser theme colour:** `color-scheme` is set by `tokens.css`, so native scrollbars and form internals follow the theme. The manifest uses the light ground `#ebebeb` for `theme_color`. A `<meta name="theme-color">` that follows the cookie can be added in the layout later.

## 4. Colour

### Semantic tokens

Use these, never a primitive (`--gray-*`, `--night-*`, `--blue-*` and so on) and never a raw value. The Tailwind name is the token without `--color-`: `bg-surface`, `text-text-muted`, `border-border-control`, `ring-focus`. Names such as `bg-bg` and `text-text` repeat themselves; the owner kept them so that each utility reads as its token.

| Token | Utility name | Light | Dark |
| --- | --- | --- | --- |
| `--color-bg` | `bg` | `--gray-100` `#ebebeb` | `--night-0` `#090909` |
| `--color-surface` | `surface` | `--gray-0` `#ffffff` | `--night-1` `#161616` |
| `--color-surface-sunken` | `surface-sunken` | `--gray-50` `#f0f0f0` | `--night-2` `#1c1c1c` |
| `--color-control` | `control` | `--gray-50` `#f0f0f0` | `--night-4` `#242424` |
| `--color-control-hover` | `control-hover` | `--gray-200` `#dcdcdc` | `--night-5` `#2e2e2e` |
| `--color-divider` | `divider` | `--gray-200` `#dcdcdc` | `--night-3` `#212121` |
| `--color-border-control` | `border-control` | `--gray-500` `#838383` | `--night-6` `#727272` |
| `--color-text` | `text` | `--gray-950` `#080808` | `--gray-0` `#ffffff` |
| `--color-text-muted` | `text-muted` | `--gray-600` `#616163` | `--night-8` `#ababab` |
| `--color-primary` | `primary` | `--gray-950` `#080808` | `--gray-0` `#ffffff` |
| `--color-primary-hover` | `primary-hover` | `--gray-800` `#2e2e30` | `--gray-200` `#dcdcdc` |
| `--color-on-primary` | `on-primary` | `--gray-0` `#ffffff` | `--night-0` `#090909` |
| `--color-accent` | `accent` | `--blue-600` `#3555f6` | `--blue-400` `#6f85f6` |
| `--color-on-accent` | `on-accent` | `--gray-0` `#ffffff` | `--night-0` `#090909` |
| `--color-accent-tint` | `accent-tint` | `--blue-50` `#ebeefe` | `--blue-950` `#24283a` |
| `--color-positive` | `positive` | `--green-700` `#3c7350` | `--green-400` `#70ce64` |
| `--color-positive-tint` | `positive-tint` | `--green-50` `#e4f9f3` | `--green-950` `#243322` |
| `--color-negative` | `negative` | `--red-700` `#bf3924` | `--red-300` `#e38388` |
| `--color-negative-tint` | `negative-tint` | `--red-50` `#f7e7e5` | `--red-950` `#372728` |
| `--color-warning` | `warning` | `--amber-700` `#826313` | `--amber-300` `#eac86f` |
| `--color-warning-tint` | `warning-tint` | `--amber-50` `#f3e5d8` | `--amber-950` `#383224` |
| `--color-danger` | `danger` | `--red-700` `#bf3924` | `--red-300` `#e38388` |
| `--color-on-danger` | `on-danger` | `--gray-0` `#ffffff` | `--night-0` `#090909` |
| `--color-focus` | `focus` | `--blue-600` `#3555f6` | `--blue-400` `#6f85f6` |
| `--color-backdrop` | `backdrop` | `rgb(8 8 8 / 0.45)` | `rgb(0 0 0 / 0.6)` |

These tokens have no utility; they are read by CSS (modules, the `holo` utility, the logo):

| Token | Light | Dark | Read by |
| --- | --- | --- | --- |
| `--color-on-holo` | `#080808` | `#080808` | `holo`: text on the blur is always ink |
| `--chart-real` | `#080808` | `#ffffff` | Chart line of the first series |
| `--chart-planned` | `#616163` | `#ababab` | Older chart styles; the trajectory chart uses `--color-text-muted` for its second series |
| `--chart-today` | `#3555f6` | `#6f85f6` | Today rule and pill |
| `--logo-ink` | `#080808` | `#ffffff` | Logo stem |
| `--shadow-overlay` | two soft layers | one darker layer | `shadow-overlay` utility |
| `--shadow-raised` | `0 1px 2px` at 8 % black | `0 1px 2px` at 40 % black | `shadow-raised` utility |

### Rules

- **Pairs.**
  - Text goes on `bg`, `surface`, `surface-sunken` or `control` in `text` or `text-muted`.
  - Labels on a filled shape use the matching `on-*` token.
  - A state colour on its tint (`positive` on `positive-tint`) is measured and allowed.
  - Any other pair must be measured before use.
- **Blue** appears only for:
  - today (chart rule and pill, the Today chip, today in the calendar);
  - the focus ring;
  - links that leave the current task.

  Selection, checked boxes, chosen chips and the current navigation item are ink.
- **Primary action** is ink (`bg-primary text-on-primary`), never blue.
- **Red fill** (`danger`) is used only on the confirm button inside a destructive dialog. Red text (`negative`) marks money out and errors.
- **Amber** (`warning`) marks what needs attention: the to-categorize queue ("Later", "To categorize"), warnings.
- **Elevation** comes from tone by default: a card is `surface` on `bg`, an inner panel is `surface-sunken`. Two shadows exist for the cases where relief helps:
  - `shadow-raised`, small and tight, for a control lifted from its own track, such as the selected segment of a raised segmented control (the transaction type);
  - `shadow-overlay`, soft and wide, for floating layers only (menus, pickers, toasts, dialogs).

  A card never takes a shadow. A new case for `shadow-raised` is a design decision, recorded in DECISIONS.md.

## 5. Typography

- **Face:** Host Grotesk, one variable file, weight axis 300 to 800. There is no second family: no serif, no monospace.
- **Fallback:** `"Helvetica Neue", Helvetica, Arial, sans-serif`.
- **Weights:** `font-regular` (400) for text and amounts, `font-medium` (560) for labels, headings, buttons and chips, `font-bold` (800) only where a single figure must dominate.

| Utility | Size | Line height | Tracking | Use |
| --- | --- | --- | --- | --- |
| `text-label` | 12 px (0.75rem) | 1.45 | 0.06 em | Uppercase card and column labels, medium |
| `text-caption` | 13 px | 1.45 | 0 | Hints, errors, secondary lines, pills |
| `text-body` | 15 px | 1.45 | 0 | Default text (set on `body`) |
| `text-title` | 20 px | 1.45 | -0.02 em | Card and section titles, medium |
| `text-heading` | 28 px | 1.1 | -0.02 em | Page titles, medium |
| `text-amount` | 36 px | 1.1 | -0.02 em | Key amounts, regular |
| `text-display` | 56 px | 1.1 | -0.02 em | One headline number (the amount being typed) |

### Amounts and dates

- **Formatting:** always through `Intl`, as `formatAmount` and `formatCalendarDate` do, from integer minor units. Never format by hand.
- **Display:**
  - Regular weight.
  - Sign written (`+€2,450.00`, `-€42.00`); income may also take `text-positive`, expenses stay ink.
  - Minor units may be dimmed with `text-text-muted` at a smaller size, as on the board (`€2,480` then `.35`).
- **Figures** are always tabular in Host Grotesk: columns line up without `tabular-nums`. The class is harmless but no longer needed.
- **French thousands separator:** `Intl` puts a narrow no-break space (U+202F) between thousands in French. The upstream Host Grotesk file has no glyph for it, so the shipped `fonts/HostGrotesk-Variable.ttf` maps U+202F to the face's own thin space (U+2009, 0.15 em) in its `cmap`. Keep the `Intl` output as it is: never replace the separator in code. When the font file is updated from upstream, map it again (fontTools: point U+202F at the glyph of U+2009 in every Unicode `cmap` subtable).
- **Labels** are written in sentence case in the messages and uppercased with CSS (`uppercase`), so accented capitals stay correct.

## 6. Layout, space, shape and motion

- **Grid:** 4 px. Tailwind's spacing step is 4 px, so use the identity steps only: `1` (4), `2` (8), `3` (12), `4` (16), `6` (24), `8` (32), `12` (48), `16` (64).
- **Cards:** `rounded-card` (20 px), `bg-surface`, padding `p-6` (24), gaps `gap-4` (16). In narrow views, padding 16 and gaps 12.
- **Radii:**
  - `rounded-control` (12 px) for fields, menus, notices and keypad keys;
  - `rounded-card` (20 px) for cards, toasts and dialogs;
  - `rounded-pill` for buttons, chips, segmented controls, pills and the tab bar;
  - `rounded-tile` (20 %) for the app icon.
- **Phones:** one column under 768 px, 16 px side margins, no horizontal scroll at 375 px. Tables that cannot fit scroll inside their card, never the page.
- **Targets:** every interactive element is at least 44 x 44 px (`min-h-11`, `min-w-11`). Small visuals (a 20 px checkbox) sit inside a 44 px hit area.
- **Focus:** a 2 px `focus` outline, 2 px offset, on every interactive element (`:focus-visible`, set in the base layer). Never remove it without an equal replacement.
- **Navigation, wide** (container 900 px and more):
  - left sidebar, icon and label per item;
  - the selected item raised on white with `aria-current="page"`;
  - "To categorize" with its count;
  - Settings at the foot;
  - Imports stays in the sidebar, and Simulations is added when it lands (owner, 26 Nov 2026, #217 D15).
- **Navigation, narrow:**
  - the logo and a round "Add transaction" button at the top;
  - a floating tab bar at the bottom, four destinations (Overview, Calendar, Accounts, Simulations), in a 343 px pill track with 52 px items and the selected item in ink.
  - **Until Simulations (M3) exists:** the tab bar holds Overview, Calendar, Accounts and Imports (owner, 12 Nov 2026; Calendar took the place of Transactions with #173). When Simulations lands, its tab (icon `ArrowsSplit`) takes the place of Imports, and Imports becomes the first row of the More list of `/settings`, with its icon `TrayArrowDown` (owner, 26 Nov 2026, #217 D15).
  - **The other pages on a phone** (owner, 12 Nov 2026): a 44 px icon button with `GearSix` and the label "Settings" sits in the top bar next to "Add transaction". `/settings` ends with a "More" list of the pages that have no tab: Transactions, Balances, Categories, Rules, Currencies, Backup, Security, each with its icon.
- **Settings** (`/settings`, owner, 12 Nov 2026): one page that holds Appearance (the theme setting of section 3) and Language, then links to Security and Backup. Both controls live on this page only. Sign out sits at the end of this page, an interim place until the owner decides one.

  Use a container query on the app frame, not a media query.
### Motion

Motion shows a change the user caused, or that the app made for them: a layer that opens, a step that follows, a state that switches. It never decorates and never asks for attention on its own.

**Tokens** (`tokens.css`; never a raw duration or easing in a component):

| Token | Value | Use |
| --- | --- | --- |
| `--motion-duration-state` | 120 ms | Tone change on hover, press, check, selection |
| `--motion-duration-exit` | 140 ms | A layer that leaves |
| `--motion-duration-enter` | 200 ms | A layer or a page that arrives |
| `--motion-duration-step` | 260 ms | A step of the add-transaction flow, the progress bar, the selected segment sliding |
| `--motion-duration-draw` | 600 ms | The trajectory line, drawn once; the longest motion allowed, apart from the cycle of the shimmer |
| `--motion-duration-shimmer` | 1500 ms (proposed, the owner confirms it on `components.html`) | One sweep of the loading skeleton, the only motion that repeats |
| `--motion-ease-enter` | `cubic-bezier(0.2, 0, 0, 1)` | Entrances: arrive fast, settle |
| `--motion-ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Exits: leave without lingering |
| `--motion-ease-move` | `cubic-bezier(0.4, 0, 0.2, 1)` | From one tone or place to another |
| `--motion-offset` | 8 px | Rise of a layer or a page as it fades in |
| `--motion-offset-step` | 24 px | Slide of a flow step |

**What moves**

| Moment | Motion | Duration and easing |
| --- | --- | --- |
| Hover, press, focus of a control; checking a box; choosing a segment or a chip | The tone fades from one step to the next. Size and position never change | state, move |
| The chevron of a picker or a disclosure | Turns by 180° | state, move |
| Segmented control (type, appearance, horizon) | The selected fill is one pill under equal segments that slides to the chosen one; the labels change tone. CSS only: the index comes from `:has(input:checked)`, so the native radios rendered by the server keep working without JavaScript | step, move |
| Menu, picker, suggestions (popovers) | In: fade and rise of `--motion-offset` towards their trigger. Out: fade | enter; exit |
| Toast | In: fade and rise of `--motion-offset`. Out: fade, then the toasts below close the gap | enter; exit |
| Dialog | In: fade and rise of `--motion-offset`; the backdrop fades. Out: fade, then the dialog closes and the focus returns to its trigger | enter; exit |
| Disclosure, step 3 editor | The content fades in under its summary or its row | enter |
| Add-transaction steps (phone) | The new step slides `--motion-offset-step` from the side the user goes to (from the right on Next, from the left on Back) and fades in; the old one leaves at once, so the new one never waits | step, move |
| Progress bar | The segment of the step reached fills from left to right | step, move |
| Sign of the amount | Its colour fades when the type changes; the digits typed never animate | state, move |
| Trajectory line | Drawn once from left to right when the chart first appears, real part then planned part; markers, labels and the zone appear at once | draw, move |
| Chart reading | The marker, the crosshair and the tooltip move to the month being read | state, move |
| Page | On load and on navigation inside the app, the content of `<main>` fades in and rises `--motion-offset` | enter |
| Loading skeleton | A soft band sweeps over each block from left to right (the app has no right-to-left language), and repeats while the content loads. It stops when the content replaces the skeleton, which enters with the page fade | shimmer, move |

**Never**

- An initial state rendered by the server, in a `style` attribute or in Motion's `initial`, for content that is in the HTML: the content security policy blocks style attributes, so the page would show its final state and then jump. Content rendered by the server enters with a CSS animation from the stylesheet (the `motion-enter` utility of `tailwind.css`, or a keyframe in a CSS module), which runs from the first paint. Motion's components rendered on the server take `initial={false}`; Motion animates only what the browser mounts after the page is shown.
- A figure that counts up or rolls: a real amount is shown as it is (principle 1).
- Bounce, overshoot, springs that oscillate, parallax, motion tied to scroll, loops, or anything that moves for more than `--motion-duration-draw`. The one exception is the shimmer of a loading skeleton (owner, 12 Nov 2026): the only motion allowed to repeat, with the limits of the "Loading" entry of section 8.
- Motion on the holographic signature or on the glow of the chart lines.
- Waiting for a motion to finish before accepting input: focus moves at once (the heading of a new step, the trigger of a closed picker) and the motion plays around it.

**Reduced motion**

- With `prefers-reduced-motion: reduce`, every duration and offset is 0: each change is instant, fades included (owner, 12 Nov 2026).
  - For CSS, `tokens.css` does it. A shimmer of 0 ms applies nothing, so a skeleton stays a plain static block.
  - For Motion, `src/app/motion.ts` does it. `MotionConfig reducedMotion="user"` alone is not enough, since it keeps fades.
- Nothing carries meaning through motion alone: a step, an error or a new toast is also a heading, a live region, a word.

**In Tailwind:**
- Use `transition-colors` (or `transition-transform` for the chevron) without a `duration-*` or `ease-*` class. `tailwind.css` points the default transition at `--motion-duration-state` and `--motion-ease-move`.
- The default easings and animations (`ease-in`, `animate-spin`, `animate-pulse`) no longer compile.
- `duration-*` still compiles, since Tailwind does not read it from the theme: it is refused in review.

## 7. Icons

- **One set:** [Phosphor Icons](https://phosphoricons.com), Regular weight only, through the `@phosphor-icons/react` package (MIT; owner, 12 Nov 2026). Server components import from `@phosphor-icons/react/ssr`. No other icon set, and no hand-drawn icon next to them.
- **Drawing:** 20 px (`--icon-size`), in `currentColor`. Phosphor draws filled outlines on a 256 grid with round ends; at 20 px its Regular stroke is 1.25 px. Inside a tinted disc of 36 px (32 px in chips) when they mark a kind.
- Money out is a down-right arrow in `negative`; money in is an up-right arrow in `positive`; a transfer is two opposed arrows in ink; interest is a percent sign in `positive`.
- **The icons in use** (as drawn in `components.html`):

| Use | Phosphor icon |
| --- | --- |
| Open a picker, a disclosure | `CaretDown` |
| Date | `CalendarBlank` |
| Selected, success | `Check` |
| Close, dismiss | `X` |
| Error, alert | `WarningCircle` |
| Show or hide a password | `Eye`, `EyeSlash` |
| File | `File` |
| Money out, money in, transfer, interest | `ArrowDownRight`, `ArrowUpRight`, `ArrowsLeftRight`, `Percent` |
| Categories (Food, Housing, Transport, Leisure, Health, Gifts, Savings) | `Basket`, `House`, `Bus`, `Ticket`, `Heart`, `Gift`, `Coins` |
| Later, to categorize | `Tray` |
| Account (current), keypad delete | `CreditCard`, `Backspace` |
| Suggestion from history | `ClockCounterClockwise` |
| Overview, Transactions, Accounts, Imports, Settings | `ChartLine`, `ArrowsDownUp`, `Wallet`, `TrayArrowDown`, `GearSix` |
| Balances, Categories, Rules, Currencies, Backup, Security | `Scales`, `Tag`, `Funnel`, `CurrencyEur`, `Archive`, `ShieldCheck` |
| Calendar, Simulations (M2, M3) | `CalendarBlank`, `ArrowsSplit` |
| Add, ceiling, overflow | `Plus`, `ArrowLineUp`, `ArrowLineRight` |
| Planned, To pay (proposed, issue #177, section 18) | `Repeat`, `Receipt` |

- A new icon is picked from Phosphor Regular and added to this table.
- An icon that carries meaning has a text label next to it or an accessible name. A decorative icon has `aria-hidden="true"`.

## 8. Components

Open `components.html` next to this section: every state below is drawn there in both themes.

### Buttons

| Variant | Classes | Use |
| --- | --- | --- |
| Primary | `bg-primary text-on-primary hover:bg-primary-hover` | The one main action of a screen |
| Secondary | `bg-control text-text hover:bg-control-hover` | Next to the primary (Cancel, Back), or alone when no action dominates |
| Link | Ink text, underline offset 3 px, the underline thickens to 2 px on hover | A third action (Edit, Today) |
| Destructive | `bg-danger text-on-danger` | Only the confirm button inside a destructive dialog |

- **Shape:** `rounded-pill`, `min-h-11`, `px-4`, `font-medium`, icon and text 8 px apart.
- **Hover and pressed:** one tone step, faded over `--motion-duration-state`; the button never changes size or position.
- **Disabled:** `bg-surface-sunken text-text-muted`, `cursor-not-allowed`. Never opacity.
- **Pending:** keep the fill, change the label to the ongoing verb ("Adding…", "Deleting…"), set `aria-busy="true"`, and ignore further clicks.
- **Icon button:** a 44 px circle, transparent, `hover:bg-control`, always with an `aria-label`.

### Choice controls

- **Checkbox:**
  - a 20 px box with a 6 px radius and a 1.5 px `border-control` border, on `control`, inside a 44 px row;
  - hover: an ink border;
  - checked: an ink fill with a 2 px tick in `on-primary`;
  - disabled: `surface-sunken` with a `divider` border and muted text.
- **Segmented control:**
  - a pill track on `control`, 3 px padding, 44 px segments of equal width in muted medium text;
  - the selected segment is ink (the appearance setting) or raised on `surface` with `shadow-raised` (the transaction type, whose icons carry red and green);
  - always native radio buttons inside a `fieldset` with a `legend`.
- **Chip:**
  - a 44 px pill on `surface-sunken` with a `divider` border, medium text, an optional 32 px disc;
  - hover: an ink border;
  - chosen: ink fill, `on-primary` text, the disc turns to `surface`;
  - disabled: transparent with a dashed border and muted text;
  - a native radio or checkbox underneath, focus ring on the chip.
- **File input:** the native input stays, visually hidden. A secondary button "Choose a file" is its label, the file name sits next to it, and focus on the input rings the button.
- **Disclosure:** a native `details` between two `divider` hairlines, a 44 px medium summary with a chevron that turns when open.

### Feedback

- **Toast:**
  - layout: a `surface` card, `rounded-card`, `shadow-overlay`, at most 420 px wide, padding 12 (16 on the left);
  - content: a 36 px tinted disc with the icon (`positive` on `positive-tint`, `negative` on `negative-tint`), the text, and a 44 px close button;
  - text: it starts with its kind in words ("Success.", "Error."), in the state colour and medium weight, and sits in a slot two lines tall. One line is centred in the slot; two lines fill it; further lines grow downwards while the disc and the close button stay level with the first two;
  - timing: a success has `role="status"` and leaves after 8 seconds unless pointed at or focused. An error has `role="alert"` and stays until closed.
- **Notice:** `bg-warning-tint text-text`, `rounded-control`, padding 12 16, starting with "Warning:" in `text-warning font-medium`.
- **Empty state:** `bg-surface-sunken`, `rounded-control`, centred muted text of 36 characters at most per line, one secondary action.
- **Loading (skeleton):** shows the shape of what is coming, in its place, and nothing else.
  - Content (owner, 16 Nov 2026): a block stands only for data that is really loading, and the data is loaded as fast as it can be, never held back to show the skeleton. What does not depend on the data stays as it is, never a block: a page title, a section heading, a back link, an intro, a caption, a column heading, a hint. A heading or caption that holds data (an account name, a currency) is a block. Blocks are shapes only: no figure, label or amount.
  - Blocks: `bg-surface-sunken` on a card, with the radius of what they stand for: `rounded-control` for a line of text, `rounded-pill` for a button, `rounded-card` for a tile. A card itself is never a block: the card stays and its content becomes blocks. A block that sits on the page ground, outside any card (a page title, a form field), is `bg-surface`, since `surface-sunken` would almost vanish there in the light theme (1.05:1, against 1.19:1 for `surface`).
  - Size: the same as the final content, so nothing moves when it arrives. A table skeleton is built in the real table markup with 48 px rows; a chart skeleton keeps the 280 px plot (section 11).
  - Shimmer (owner, 12 Nov 2026, the only motion allowed to repeat):
    - a soft band sweeps over the block from left to right (the app has no right-to-left language), one sweep per `--motion-duration-shimmer`, with `--motion-ease-move`;
    - the band is a gradient from transparent to a tone and back to transparent: no other colour, no glow, no holographic tint;
    - the band tone is **proposed** as `control-hover`, since `control` equals `surface-sunken` in the light theme (1.00:1, invisible); the owner confirms it on `components.html`;
    - it runs only while the content loads and ends when the content replaces the skeleton;
    - pure CSS (keyframes in the stylesheet, a `translate` on a pseudo-element), no JavaScript, from the first paint;
    - under reduced motion the band stays outside its block (see section 6);
    - it never runs next to content the user is reading.
  - Accessibility: the loading region (the fallback of one section of data, never the whole `main`) has `aria-busy="true"` and one visually hidden polite status message in words ("Loading the table"), added once the page is hydrated because a live region already filled in the first markup is usually not announced; the blocks are `aria-hidden`. Focus is not moved, and stays where it was when the content arrives. No pause control: a loading indicator shown while the content cannot be used is essential under WCAG 2.2.2 (open point for the owner, DECISIONS.md "Loading skeleton").
- **Dialog:**
  - the native `<dialog>` with `rounded-card`, `shadow-overlay`, padding 24, at most 420 px wide, and a `bg-backdrop` backdrop;
  - title in `text-title`, actions on the right: Cancel (secondary, focused first), then the confirming action;
  - Escape closes it.

  This is `ConfirmActionButton` restyled.
- **Not a dialog:** work that needs more room than 420 px is a page of its own, never a wide dialog. The review of an imported file becomes a page (owner, 12 Nov 2026), reached from the import and left by its own Cancel and Import actions.

### Data display

- **Table:**
  - a caption in medium weight;
  - headers in `text-label`, uppercase, muted;
  - rows 48 px with a `divider` hairline on top, hovering to `surface-sunken`;
  - figures right-aligned;
  - a status as a word in a pill.
- **Pill:** `rounded-pill`, padding 4 10, `text-caption font-medium`. Neutral: `bg-control text-text`. Warning: `bg-warning-tint text-warning`. A pill is a status, not a button.
- **Count badge:** text on `control`, used for the to-categorize count.

### Popovers

Menus, pickers and suggestions open 6 px under their trigger:
- `bg-surface`, a 1 px `divider` border, `rounded-control`, `shadow-overlay`, padding 6;
- they close on Escape and on a click outside, and return the focus to their trigger.

## 9. Forms

### Field anatomy

```
Label                      text-caption font-medium text-text
Hint (optional)            text-caption text-text-muted, linked by aria-describedby
[ control, 48 px ]
Error (when invalid)       text-caption font-medium text-negative, alert icon, linked by aria-describedby
```

- **The control:**
  - `min-h-12` (48 px), `rounded-control`, a 1 px `border-control` border, `bg-control`, padding 0 12;
  - placeholder in `text-muted`, which is never a substitute for the label.
- **Label wording:** short ("Amount"). What used to sit in parentheses in the label moves to the hint ("Without a sign: the type sets the direction."). Optional fields say "(optional)" in muted text after the label.
- **Amounts:** right-aligned, the currency symbol at the end in muted text, `inputmode="decimal"`.
- **Layout:** fields stack 16 px apart. From 640 px a form may use two columns, and long fields span both.

### Field states

| State | Treatment |
| --- | --- |
| Hover | Border becomes `text` (ink) |
| Focus | Border `text` and the 2 px `focus` ring, 2 px offset |
| Invalid | `aria-invalid="true"`, 2 px `negative` border, error message starting with "Error:" and an alert icon |
| Disabled | `bg-surface-sunken`, `divider` border, muted text, not focusable |
| Read-only | No fill, 3:1 `border-control` border, ink text, still focusable and selectable |

### Exact syntax, in the browser and on the server

When a field expects an exact syntax, restrict it on both sides with the same rule.

- **Browser:**
  - Filter what is typed, pasted or dropped (`beforeinput`). Refuse any character outside the syntax.
  - Say why in a polite live message under the field ("“a” is not accepted: digits and one comma or point only.").
  - When the field is left, flag an incomplete value with the invalid state ("Error: invalid amount “12,”: digits missing after the decimal separator.").
- **Server:** validate the same rule in the schema and stay the authority, since the browser can always be bypassed.
- **Amount:** digits and one comma or point, at most the decimals of the currency. Spaces of a pasted value are removed (space, no-break space, narrow no-break space).
- **Balance:** a value that can be negative (an opening balance, a balance check, a row of an imported file) keeps the amount syntax, without a sign. A segmented control next to it, "Credit" or "Debit", gives the side, and the server turns Debit into a negative amount (owner, 12 Nov 2026).
- **Currency code:** three letters, uppercased as typed.
- The server's `parseAmount` accepts more (signs, symbols, grouping) and does not change: the form schemas narrow it field by field with the shared rule of `src/domain/amount-syntax.ts`, which the browser also applies. Done for the amount of a transaction or transfer, the opening balance and deposit ceiling of an account and the balance check of an account. The balance check panel of a recorded import takes the Credit or Debit side and refuses a typed sign (plus, minus or Unicode minus, wherever it sits), but still reads the rest with `parseAmount`. In the import review, the amount cell of a row is typed without a sign and a typed sign is refused with a polite message (owner, 16 Nov 2026): the Type column gives the direction of an expense or an income, and a savings row (deposit or withdrawal) has its own Credit or Debit control, Debit being a deposit. The draft text stays signed internally and the side is split off at the cell, as text, so no number is involved; the rest of the cell (symbols, grouping) is still read by `parseAmount`.

### Custom pickers

Selects and dates use custom pickers, never the browser's.

- **Select:**
  - built on the WAI-ARIA select-only combobox: a button with `role="combobox"` that opens a listbox, plus the native select, hidden, which keeps posting the value under its own name (ADR-024);
  - the list is a native popover in the top layer, so no scrolling ancestor clips it and it stays above a dialog; it closes on a scroll outside the list;
  - options are 44 px tall, the active one on `control` with a 2 px `focus` ring while the keyboard drives it, the selected one medium with a check, a disabled one in `text-muted`, and the list scrolls past 296 px or past the room left on its side of the field;
  - keys: arrows, Home, End, Page Up and Page Down (10 options), Enter and Space, Escape, Tab, and type-ahead. The list stops at its ends. Tab closes the list without changing the value and moves the focus on, and Space chooses the highlighted option, except while a search is running where it is typed as a character (owner, 16 and 17 Nov 2026). A resize or a scroll outside the list closes it.
- **Date:**
  - the WAI-ARIA date picker dialog: a 332 px popover centred under its field (at most the viewport minus 32 px), a month title with previous and next icon buttons, a weekday row, and 44 px round days;
  - today has a 1.5 px `accent` inner ring and `accent` text; the chosen day is filled with `primary`, without a hover; other days hover to `control`;
  - a "Today" link in the footer;
  - keys: arrows (a day, with Up and Down a week), Home and End (week), Page Up and Page Down (month, with Shift a year), Enter, Space, Escape. Focus is held inside while it is open and returns to the field on close;
  - the week starts on the first day of the language, from the platform's week data (ADR-025); days outside the month are blank; a day that is both chosen and today is drawn as chosen, `aria-current="date"` marks today;
  - the Today link chooses today and closes (to be confirmed by the owner).
- **Without JavaScript:** the server renders the native `select` or `input type="date"`, and the script swaps it for the custom picker on load. The forms keep posting without JavaScript.

### Password

The field has a 44 px icon button inside it, on the right (eye and eye off):
- one fixed `aria-label` ("Show password"), with `aria-pressed` for the state;
- `aria-controls` pointing at the field;
- the right padding of the field leaves room for the button.

## 10. Add-transaction flow

The add-transaction form becomes a three-step flow (`form-proposals.html`, "Retained flow"). A usual expense needs the amount and, if wanted, a label. Everything else has a default: type Expense, date Today, the account used last.

**Step 1, How much?**
- **Type:** segments Out, In, Move, Interest, each with its icon in its colour.
- **Amount:** in `text-display`, centred, with its sign drawn from the type (a red minus for an expense, a green plus for income and interest) and the currency symbol in muted text.
- **Typing:**
  - The amount is a real text field that grows with its content. It can be typed with a keyboard and follows the exact-syntax rule of an amount.
  - A 3 x 4 keypad (1 to 9, comma, 0, delete) with 52 px keys on `surface-sunken` types into the same value.
- **Next:** primary, full width.

**Step 2, What for?**
- **"What was it?"** suggests labels from history as dashed chips. Picking one fills the category through the existing categorization rule, and a polite note says so.
- **Category** is a four-column grid of 76 px chips with an icon and a word. "Later" comes first, in amber: it sends the transaction to the to-categorize queue.
- **Navigation:** Back (secondary) and Next (primary).

**Step 3, Check and save**
- **Recap rows:**
  - two rows of 56 px, separated by hairlines: amount and type, then label and category, each with its disc;
  - "Edit" (a link with `aria-expanded`) opens the editor inside the row; "Done" closes it and returns the focus to "Edit";
  - editing never goes back to an earlier step.
- **When:**
  - chips Today (with the blue ring while not chosen), Yesterday, and "Pick a date";
  - "Pick a date" opens the date picker of section 9, and the chip then shows the chosen date.
- **Account:**
  - account chips;
  - for a transfer, they are replaced by "From" and "To, the account that receives", and the From account is disabled in To.
- **Above the ceiling** (owner, 12 Nov 2026; DOMAIN, deposit ceiling and overflow): when the save of a transfer finds that the amount does not fit under the ceiling of the receiving account, nothing is recorded yet and a step opens in place of the save button.
  - It has a heading ("Above the ceiling"), which takes the focus, and a notice: "Warning: The ceiling of Savings A limits the deposit to €50.00. €150.00 is left to place."
  - "Where does the surplus go?" offers one chip per other account and "Keep it in Current" (the surplus is not moved). The overflow account of the receiving account is chosen first when there is one.
  - Cancel (secondary) closes the step and returns the focus to the save button. The confirming button says what will happen, short enough for one line on a phone: "Move €50.00, the rest to Savings B", or "Move only €50.00 to Savings A".
  - What fits nowhere stays in the source account and is said after saving, next to the form ("€100.00 stays in Current: Savings B is full").
  - The server computes the split, as today: the browser never decides what fits.
- **More details:** a disclosure with the note and the payment mode (Card, Transfer, Direct debit).
- **Save button:** says what will happen: "Add expense of €42.00", the verb of the type plus the formatted amount. A transfer names its destination: "Move €42.00 to Savings A". It checks the amount, then the label, since the step 3 editors can empty them: on a phone, an error takes the user back to its step, with the message and the focus on the field.

**Throughout**
- A three-segment progress bar (4 px, `primary` for steps done, `control` otherwise), hidden from assistive tech.
- "Step 1 of 3" in a polite live region.
- Each step's heading takes the focus when the step opens.

**Wide layout (computer)**
- From 760 px of available width, the same form fits one screen, at most 920 px wide, padding 32: a title "New transaction", then two columns 32 px apart with a `divider` hairline between them.
- **Left column:** "How much?" (type segments and the amount, typed on the keyboard), then "What for?" (label with its suggestions, category grid).
- **Right column:** "Date and account" (When, Account or From and To, More details), then the save button, full width.
- **Removed:** the keypad, the progress bar, "Step 1 of 3", Back and Next, and the recap rows of step 3, since everything is already in view.
- **Saving:** the save button checks the amount, then the label, and moves the focus to the first field in error with its message.
- Reading and tab order follow the columns: amount, label, category, date, account, save.
- **New category:** the last tile of the category grid, in the same shape with a plus disc and the words "New category". It opens the modal with the category form (name, an icon among 20, Add category, Cancel). Each tile of the grid draws the icon of its category in its disc. The icon picker is a grid of five square 44 px chips, ink when chosen, each named for assistive technology. On save the modal closes, the new category is in the grid and chosen. It needs JavaScript.
- **Without JavaScript:** Move, the label suggestions and the date chips need it. Before hydration the form is the expense, income and interest form with the native date input, and it still posts.

## 11. Charts

### Rules for every chart

- Real data is drawn flat and sharp, never on the blur.
- Every chart has an equivalent data table with the same rows (DOMAIN).
- Series are told apart by tone and by a direct label, never by colour alone. Real and planned values are told apart by the line style (solid and dashed) and by a zone.
- Axes and grid are recessive: hairlines in `divider`, 12 px muted text. The zero line uses `border-control`.
- The vertical axis of a balance always includes zero.
- Charts are drawn at the element's real pixel width (`useElementWidth`), not by scaling a viewBox, so text stays 12 px and phones never scroll sideways.
- Hand-written SVG with `d3-scale` and `d3-shape` only (ADR-012).
- While a chart loads, its skeleton keeps the size of the whole chart as rendered, plot of 280 px included, and its data table keeps its rows (section 8, "Loading"). The headings, the hint and the column headings are shown as they are.

### The trajectory chart

The reference implementation is in `react/`:
- `trajectory-geometry.ts`: pure geometry, tested;
- `trajectory-chart.tsx` and `trajectory-chart.module.css`;
- `trajectory-table.tsx`;
- `axis-format.ts`.

| Part | Specification |
| --- | --- |
| Data | The two curves of DOMAIN ("The real chart"): month-end total of the checking accounts and of the savings accounts, in the reference currency, real up to the last complete month, then dated planned items only. No estimate (ADR-011). Values in minor units; labels formatted by the server with `Intl` |
| Without planned items | The whole chart is built, but each planned part shows only when there is something planned to draw: the dashed lines, the planned zone and its labels, the lowest planned balance and the horizon control. The Today rule stays (owner, 12 Nov 2026) |
| Plot | 280 px tall, margins top 28, right 8, bottom 36, left 52; 8 px inner padding |
| Lines | Stroke 2, round joins and caps. First series in `--chart-real` (ink), second in `--color-text-muted`. Solid up to today, dashed `6 5` after; both paths join exactly on today |
| Glow | `drop-shadow(0 0 5px)` of the line's own colour at 40 %, on the data lines only. Owner's request, kept low (see DECISIONS) |
| Markers | None at rest. For the month being read, a round marker on every series (11 px, filled with the series colour, 1.5 px `surface` outline) |
| Series names | At the start of each line, medium, with a 4 px `surface` halo, pushed at least 16 px apart |
| Planned zone | From today to the end on `surface-sunken`, labelled "Up to today" and "Planned ahead"; the labels hide when they do not fit |
| Today | A 1.5 px `--chart-today` rule and a pill on the month axis, sized to its word, `on-accent` text |
| Lowest planned balance | One direct label in medium ink with a halo, kept inside the planned zone |
| Vertical axis | Zero always included, about four integer ticks, compact currency labels (`€12K`, `12 k €`) from `formatAxisAmount` |
| Month axis | Last month placed first, then the first, then a rhythm counted from today; at least 52 px apart; never under the Today pill; first and last labels aligned on the plot edges |
| Tooltip | `bg-text text-surface` (inverted), `rounded-control`, `shadow-overlay`, caption size: the month and its kind ("Real", "Real, today", "Planned, dated"), then one row per series |
| Keyboard | The plot is a focusable group with a label and a hint. Focus starts on today. Arrows move one month, Home and End jump to the ends, Escape hides the reading. A polite live region announces keyboard and click reads, not pointer moves |
| Legend | Real (solid), Planned, dated (dashed), Today (blue), in caption muted text |
| Horizon | A segmented control (3, 6, 12 months ahead); the data table always shows the same months |
| Table | Month (as `<time>`), one column per series, right-aligned, and the kind of each month |

## 12. The holographic signature

- **What it is:** soft radial fields of sky, aqua, rose and peach over a blue-to-sand base, blurred 28 px, clipped by their container, on a cream ground. The `holo` utility draws it on a `::before` layer and sets the text colour to ink.
- **Use it for:**
  - simulations and scenarios (anything estimated);
  - brand moments: the header, empty states, onboarding.

  A simulation card on the blur carries an "Estimate" tag, a translucent white pill with the word, so the meaning never rests on the colour.
- **Never:**
  - behind a real balance, a transaction or a chart of real data;
  - as a glow around an element;
  - under any text other than ink (muted grey falls to 2.74:1 on sky).
- **The logo on the blur** is the ink version: stem and half-disc in ink. The colour half-disc disappears into its own colours.

## 13. Logo and app icons

- **Variants** (`logo/`):
  - colour: ink stem, holographic half-disc, on light grounds;
  - colour reverse: white stem, on dark grounds;
  - black, white and mono (blue `#3555f6`): print and single colour.

  The wordmark and the two lockups (horizontal and vertical) come in the same five variants. The wordmark is "demain" in Host Grotesk Medium (weight 560), the app's own face, with the heading tracking (-0.02 em); its outlines are baked into the SVGs.
- **Clear space:** twice the gap of the symbol on every side.
- **Minimum size:** the symbol at 16 px, using the favicon cut below 24 px. The horizontal lockup at 96 px wide.
- **Favicon:** `logo/favicon.svg`, a 16 px cut on whole pixels. The stem turns white in dark mode (the file carries its own media query). It ships as `src/app/icon.svg`.
- **App icons:** colour reverse symbol on a `#090909` tile.
  - **Size and placement:** the symbol is 56 % of the tile height, centred vertically, and 3.125 % of the tile width right of its box centre (16 px at 512). The rounded side reads light, so a box-centred mark looks left; the owner set this by eye.
  - **Reuse:** apply the same proportions to any other tile that holds the symbol.

| File | Size | Shape | Use |
| --- | --- | --- | --- |
| `icons/icon-192.png`, `icons/icon-512.png` | 192, 512 | Tile with a 20 % radius, transparent corners | Manifest, `purpose` any |
| `icons/icon-maskable-512.png` | 512 | Square, opaque; the symbol stays inside the 80 % safe circle (0.380 of the size) | Manifest, `purpose` maskable |
| `icons/apple-touch-icon.png` | 180 | Square, opaque, no alpha | iOS home screen, as `src/app/apple-icon.png` |

The SVG sources are `logo/app-icon.svg` (rounded) and `logo/app-icon-full-bleed.svg` (square). `icons/manifest.ts` declares the name, `standalone` display, the light ground as background and theme colour, and the three manifest icons.

## 14. Voice

1. **Say what is real and what is planned.** "Planned, dated", "Real, today". Never present an estimate as a fact.
2. **Number first, words after.** "€2,480 left this month", not "You have €2,480 left this month".
3. **Plain verbs, no hype.** A button is a verb and an object: "Add transaction", "Import a statement", "Add expense of €42.00". Never "Submit" or "OK".
4. **Neutral about money.** No praise, no blame, no exclamation marks.
5. **Errors say what happened and what to do.** "The statement could not be read: no date column was found. Check that the file is the CSV export of your bank, then import it again."

Interface text is in English in the code and translated through the message files (`messages/en.json`, `messages/fr.json`). Write sentence case everywhere and let CSS uppercase the labels.

## 15. Accessibility checklist

Run through it for every new screen or component (WCAG 2.2 AA):

- [ ] One `<h1>` per page, headings in order, a skip link to the content.
- [ ] Every field has a visible `<label>`. The hint and the error are linked with `aria-describedby`, and an error starts with "Error:".
- [ ] Every interactive element is a native element where one exists (`button`, `a`, `input`, `select`, `dialog`, `details`). ARIA only for the custom pickers, following the APG patterns.
- [ ] Targets of 44 x 44 px or more.
- [ ] The focus ring is visible on every interactive element; the tab order follows the reading order; there is no focus trap except inside an open modal.
- [ ] No information by colour alone: signs, words, icons, line styles.
- [ ] New colour pairs are measured in both themes (4.5:1 text, 3:1 non-text) and added to DECISIONS.md.
- [ ] Every chart has its data table, a keyboard reading and a label.
- [ ] Amounts and dates come from `Intl`, from minor units.
- [ ] Works at 375 px wide with no horizontal page scroll, at 200 % zoom, and in both themes.
- [ ] Forms post without JavaScript; custom controls enhance native ones.
- [ ] A loading state shows shapes only, keeps the final size, sets `aria-busy` with one status message in words, hides its blocks with `aria-hidden`, and never moves the focus.
- [ ] Motion follows [section 6](#motion): tokens only, nothing rendered by the server starts hidden or offset in a `style` attribute, everything instant with `prefers-reduced-motion: reduce`, focus never waits for a motion.

## 16. Migrating the current classes

With `tailwind.css`, Tailwind's default palette, sizes, weights, radii and shadows no longer exist. Compiling `src/` against it shows 40 classes that stop compiling; replace them as follows.

| Current classes | Replacement |
| --- | --- |
| `border-neutral-500`, `border-neutral-400`, `hover:border-neutral-400` | `border-border-control`, `hover:border-text` |
| `border-neutral-900`, `focus-visible:border-neutral-900` | `border-text` (the focus ring comes from the base layer) |
| `border-neutral-300` | `border-divider` |
| `bg-blue-800 text-white`, `border-blue-800` (buttons) | `bg-primary text-on-primary hover:bg-primary-hover`: the primary action is ink, not blue |
| `bg-white`, `focus:bg-white` | `bg-surface`, `focus:bg-surface` |
| `text-neutral-900`, `focus:text-neutral-900` | `text-text` |
| `text-neutral-700` | `text-text-muted` |
| `text-red-800`, `border-red-800`, `aria-[invalid=true]:border-red-800` | `text-negative`, `border-negative`, `aria-[invalid=true]:border-negative` (with the 2 px invalid border) |
| `bg-red-800` | `bg-danger text-on-danger`, only on the confirm button of a destructive dialog |
| `text-green-800`, `border-green-800` | `text-positive`, `border-positive` |
| `text-blue-900` | `text-accent` if it means today or a link, otherwise `text-text` |
| `backdrop:bg-black/40` | `backdrop:bg-backdrop` |
| `shadow-lg` | `shadow-overlay`, floating layers only |
| `rounded`, `focus:rounded` | `rounded-control` (or `rounded-pill` on buttons) |
| `font-semibold` (69 uses) | `font-medium` |
| `font-normal` | `font-regular` |
| `font-mono` (2 uses) | Still compiles: it sets the text face, Host Grotesk, whose figures are already tabular |
| `text-xs`, `text-sm` | `text-label`, `text-caption` |
| `text-lg`, `text-xl` | `text-title` |
| `text-2xl` | `text-heading` |
| `fill-*`, `stroke-*` of `real-chart.tsx` | Gone with the trajectory chart, whose CSS module reads the tokens |
| `tabular-nums` (18 uses) | Still compiles; no longer needed with Host Grotesk |

`min-h-11`, `min-w-11`, the spacing utilities, flex and grid utilities, `sr-only` and the breakpoints are unchanged.

## 17. Planned items

The screens that manage planned items (DOMAIN, "Planned item and versions"): the list `/planned`, the create form and the edit page (the routes of the last two belong to the issues that build them). They are drawn on `components.html`, in the section "Planned items", one card per screen, wide and on a 375 px phone, with the numbers of this section. DECISIONS.md, "Planned items", records what the owner decided on 19 Nov 2026 and what this pass proposes.

**Rules for every screen**
- **Built from what exists.** Fields, Select, the date picker field, the type segments and choice chips of section 10, Checkbox, Disclosure, Table, notice, dialog and buttons. No new token and no new component: the page title, the group titles and the link in a table are styling of existing elements, and the chip and segment rules of the flow are shared, not copied. The one new composition is the phone list row (below), because five table columns do not fit 343 px.
- **Real values only.** These screens show what the user entered. No blur and no dashed line: the dash and the blur belong to projections (section 1, section 11). The only estimate is the one the user chooses: a rolling average, whose amount is called "Starting estimate" (ADR-011).
- **Amounts are typed without a sign.** The type (Out, In, Move, Interest) gives the sign (section 9, DOMAIN invariant 1). A figure shown after saving carries its sign (`-€650.00`, `+€2,450.00`) and a move carries none.
- **One primary action per screen**, ink. The primary save buttons are 52 px tall, as in section 10, and say a verb and a kind; the secondary saves of a card ("Save details", "Save end date") are 44 px. Red is only on the confirm button of a dialog (section 8).
- **Layout switch.** The pages follow the width of their container, not the viewport (section 6): from 640 px of container the form uses two columns and the list is a table; below, one column and rows. The phone reference is 375 px wide with 16 px gutters, so 343 px of content.
- **Colour.** Ink for what is chosen, red and green only on the type segments and the signed figures, always with the word or the sign. Blue is not used: nothing here means today.
- **Language.** Sentence case. A hint says the rule before the error has to (section 9). An error starts with "Error:" and an alert icon.
- **Page frame.** One `h1` of 28 px (`text-heading`), a back link "Planned items" above it on the form and edit pages (a link of 44 px), and `<title>` unique per page: "Planned items", "New planned item", the name of the item.

**Way in** (owner, 19 Nov 2026)
- A link "Planned items" in the calendar, and an entry in the wide sidebar (section 6, navigation). The phone tab bar keeps its four destinations, so the calendar link is the way in on a phone. Whether the "More" list of `/settings` also lists it is an open point.

### The list

**Wide (container of 640 px and more)**
- **Header:** `h1` "Planned items" on the left and the primary "Add planned item" (44 px) on the right, 24 px above the card.
- **Card:** `surface`, `rounded-card`, padding 24, holding a table (section 8): 48 px rows, hairlines, labels in 12 px uppercase `text-muted`, hover on `surface-sunken`. The caption is visually hidden, since the `h1` already names the table.
- **Columns:** Name, Schedule, Account, Next, Amount (right-aligned, tabular). The order reads as a sentence: what, how often, where, when, how much.
- **Name:** a link in ink, 44 px tall, underlined on hover and with the focus ring. The link is the row's way to the edit page; the row itself is not a target.
- **Schedule, in words:** "Once", "Monthly on day 5", "Monthly on the last day", "Every month", "Every 2 months", "Every quarter", "Every year", "Every week", "Every 3 weeks", followed by ", until 31 Dec 2027" when an end date is set. The business-day rule stays on the edit page. Words come first because a date alone does not say how often.
- **Account:** the account name, or "Current to Savings A" for a move (a word, no arrow icon).
- **Next:** the next occurrence, a date from `Intl`.
- **Amount:** the amount of the next occurrence, signed. A rolling average adds the pill "Average of 3" (6, 12) before the figure, so the word says that the figure follows the previous amounts.
- **Order:** by next date, earliest first.
- **Ended and cancelled:** a disclosure under the table, closed, "Ended and cancelled (2)", 24 px below it. Same columns; the Next cell holds the pill "Ended 31 Oct 2026" or "Cancelled" instead of a date. They are history, so they stay one click away and out of "what is still coming".

**Phone (under 640 px)**
- **Header:** `h1`, then the primary "Add planned item" at full width (44 px), 16 px apart.
- **Card:** padding 16. A list of rows of 64 px at least, with hairlines, each one a single link of the full width of the card (a target at least 64 px tall).
- **Row:** line 1 is the name (medium, ink) with the signed amount on the right (tabular); line 2 is 13 px `text-muted`: schedule, then "Average of 3" when it applies, then the account, then "Next 5 Dec", separated by " · ". It may wrap to a second line, and the row grows with it. 64 px is the 56 px of the recap rows in section 10 plus one 8 px step for the second line.
- **Ended and cancelled:** the same disclosure, with the same rows and the words "Ended" or "Cancelled" in place of the next date.

**Empty state**
- The inner-surface block of section 8, centred, padding 32 x 16: "No planned item yet. Add a bill or an income that comes back, and the calendar will show it ahead." and one secondary action, "Add planned item". The header keeps its primary button.

### The create form

A card of at most 720 px, padding 24 (16 on a phone), with three groups. Each group has an `h2` of 20 px (`text-title`); groups are 32 px apart and fields 16 px apart. From 640 px of container the fields use two columns 16 px apart, and the fields marked "full" span both.

**Details**
- **Name** (full): text field. Hint "For example Rent or Salary." Required.
- **Type** (full): the four segments Out, In, Move, Interest of section 10, with their icons, under a visible legend "Type". Same component: the user already knows it from adding a transaction.
- **Account** and **Category (optional):** two Selects. Archived accounts are not offered (DOMAIN). Hint under Category: "A matched transaction without a category takes this one." For a move, Account becomes **From** and **To, the account that receives**, and the category goes, as in the add-transaction form. The From account is disabled in To.
- **Why Selects and not chips:** the list of accounts and categories has no fixed length, and a Select keeps the form short (section 9).

**Schedule**
- **First date:** the date picker field of section 9, not the Today and Yesterday chips. A series starts on any day, often ahead; the chips fit a transaction that already happened. Hint: "The first date it can fall on. It does not have to follow the rule below."
- **Repeats:** a Select of seven choices: "Does not repeat", "Monthly on a given day", "Monthly on the last day", "Every N months", "Every quarter", "Every year", "Every N weeks". They are the six `repetition_kind` of DOMAIN and the one-off. A count of occurrences is not drawn: DOMAIN has none, only an end date.
- **Number:** a field that appears only for "Monthly on a given day" (label "Day of the month", 1 to 31, hint "A short month uses its last day."), "Every N months" ("Months between dates") and "Every N weeks" ("Weeks between dates"). Whole numbers only: the exact-syntax rule of section 9 with digits and no separator, in the browser and in the schema.
- **End date (optional):** the date picker field, shown for a repeating item only. Hint: "The last date it can fall on. Leave it empty to go on."
- **If the date falls on a weekend:** a Select, "Keep the date", "Previous business day", "Next business day". Hint: "Saturday and Sunday only, public holidays are not known."

**Amount**
- **Amount mode** (full): two segments, "Fixed amount" and "Rolling average", the segmented control of section 8 with a hint "A rolling average follows the amounts of the previous occurrences. Nothing is estimated unless you choose it."
- **Amount** (fixed) or **Starting estimate** (rolling average): the amount field of section 9, right-aligned, `€` at the end in muted text, `inputmode="decimal"`, hint "Without a sign: the type sets the direction." In rolling mode the hint adds "Used until a previous amount exists."
- **Occurrences averaged:** shown in rolling mode only: three choice chips "3", "6", "12" under the legend, 3 by default. Chips of 44 px, ink when chosen. Only three values exist (DOMAIN), so chips beat a Select.
- **Provision** (full): a Checkbox row of 44 px, "Provision for this period", with the hint "Several transactions can settle it. What is left when the period ends disappears." Ticking it shows **Only transactions whose label contains** (optional), hint "Leave it empty to count every transaction of the same account and category." On "Does not repeat" the box stays, unavailable, with the hint "A provision needs a repetition." under it, linked by `aria-describedby`: a control that is silently disabled tells nothing. No one-off provision exists (owner, 19 Nov 2026).
- **Matching:** a Disclosure (section 8), closed, holding two fields in two columns: **Window, in days** (whole number, 5 by default, hint "A transaction may fall this many days before or after the planned date.") and **Tolerance, in percent** (digits and one comma or point, 2 decimals at most, from 0 to 100, 5 by default, `%` at the end, hint "How far the amount may differ. 0 means the same amount."). Closed, because the defaults suit most items (as "More details" in section 10). The tolerance is stored in basis points: the browser shows percent and the server turns it back, with the same rule on both sides (section 9).

**Save**
- A primary button of 52 px that says the verb and the kind: "Add planned expense", "Add planned income", "Add planned transfer", "Add planned interest". No amount in it: the amount is on the same screen. Pending: "Adding…" with `aria-busy`. The button is left-aligned with the fields on a wide form and full width on a phone.
- **Errors:** the invalid state of section 9 under each field, with "Error:" and the alert icon. On save, the browser checks the form and moves the focus to the first field in error with its message. A failure of the server shows one error line above the button, `role="alert"`.

| Field | Error |
| --- | --- |
| Name | Error: enter a name. |
| Amount | Error: invalid amount "12,": digits missing after the decimal separator. |
| Day, months, weeks | Error: the day is a whole number from 1 to 31. (months and weeks: a whole number, 1 or more) |
| End date | Error: the end date is on or after the first date. |
| Tolerance | Error: the tolerance is between 0 and 100 percent. |
| Provision on a one-off | Error: a provision needs a repetition. Choose how it repeats, or untick the provision. |
| Saving | Error: the planned item could not be saved. Try again. |

The messages and the rules behind them (an end date not before the first date, whole numbers of 1 or more, a tolerance between 0 and 100) are proposed: DOMAIN fixes none of them, and they wait for the owner's check (DECISIONS.md, open question 6). The errors card of `components.html` draws the name, the day, the amount, the tolerance and the saving error; the others follow the same pattern. The provision error is the one a form posted without JavaScript returns, since with JavaScript the box is unavailable on a one-off.

**Without JavaScript:** the Selects and dates are the native `select` and `input type="date"` (section 9); the number, the window and the label filter are always in the form and the server ignores those that do not apply to the chosen repetition and mode; the type and mode segments are native radios. The server checks every rule above and returns the errors with the form.

### The edit page

A column of cards at most 720 px wide, 16 px apart, padding 24 (16 on a phone). The header has a back link, an `h1` with the name, and under it a muted line with the schedule in words and, when it applies, the pill "Cancelled" or "Ended 31 Oct 2026".

**Details** (card)
- **Read-only facts (proposed):** type, account and first date in a definition list (section 8, the `kv` list), 13 px muted terms and ink values, under the hint "Fixed once created". Showing them as text makes the rule visible. DOMAIN does not say whether they can change: it is an open point (DECISIONS.md, open question 5).
- **Editable:** name, category, the provision checkbox with its label filter, and the "Matching" disclosure, with the rules of the create form. One secondary button, "Save details".

**Versions** (card)
- **Table** of the versions, oldest first, as a timeline: From, Repeats, Amount, Mode. From holds the date and, for the version in force, the pill "In effect", and for a later one "Upcoming". Repeats is in words and carries the business-day rule ("Monthly on day 5, next business day"). Mode is "Fixed" or "Average of 3". Under the table a hint: "For a rolling average, the amount is the starting estimate."
- **Scrolling:** the table sits in a region that scrolls sideways when needed (`tabindex="0"`, `role="region"`, an `aria-label` "Versions of Rent"), the only way to keep four columns of words on 343 px.
- **Change from a date:** a Disclosure under the table, "Change from a date". It holds the version fields of the create form (Repeats and its number, the weekend rule, the mode, the amount or starting estimate, the averaged occurrences), filled with the version in force, and a **Change from** date picker field first.
  - **Hint under Repeats:** "Changing how it repeats restarts the series from this date. Changing only the amount keeps the current rhythm." (DOMAIN, decisions of 19 Nov 2026, Q3 and Q5).
  - **Same day (proposed):** when the date is the one of an existing version, a notice of section 8 appears under the date, `role="status"`: "Warning: this replaces the version of 5 Sep 2026. Its values are lost." The primary button then says "Replace the version of 5 Sep 2026"; otherwise "Change from 15 Dec 2026". The notice carries a word, so the amber is not alone. DOMAIN does not say what a second version on the same day does. Replacing keeps one version per day, and on the first version it keeps the date of the first date, as DOMAIN Q5 asks. The owner confirms it (DECISIONS.md, "Planned items").
  - Matching and provision are not here: they belong to the item, not to a version.

**End date** (card, repeating items only)
- A date picker field "End date" with the hint "The last date it can fall on. Leave it empty to go on." and a secondary "Save end date". It is a card of its own because it changes the item, not a version.

**Stop or remove** (card)
- Two rows of one sentence and one secondary button, 16 px apart, with a hairline between them. Neither button is red: red is for the confirmation.
- **Cancel this planned item:** "Nothing more is planned from today. Occurrences already settled keep their transactions." (DOMAIN, Q4). On an item already cancelled the sentence "This planned item is cancelled." takes its place.
- **Delete:** "Deletes the planned item and its versions. No transaction changes." with the button "Delete". It exists only when no transaction is linked (owner, 19 Nov 2026): otherwise there is no button, and the sentence reads "This planned item cannot be deleted: 10 transactions are linked to it. Cancel it instead."
- **A cancelled item (proposed):** the header shows the pill "Cancelled" next to the schedule. Details stay editable (name, category), the versions table stays as a record, and "Change from a date" and "End date" are not offered, since nothing is planned after today. DOMAIN says only that a cancelled item produces nothing after today (Q4); the rest is an open point (DECISIONS.md, open question 8).
- **Both open the native dialog** (section 8): a title with the name ("Cancel Rent?", "Delete Rent?"), one sentence, "Keep it" (secondary, takes the focus first) and the red confirm button, "Cancel this planned item" or "Delete", on the right. The dismiss button never says "Cancel", so the two meanings never meet. Escape closes.

**Without JavaScript:** the disclosures are native `details`; the dialogs are native `dialog` opened by a script, and without it the two buttons post to a confirmation page with the same sentences.

### Measures

| Element | Wide | Phone |
| --- | --- | --- |
| Page gutter, content | 32 px, column of 720 px at most | 16 px, 343 px |
| Card padding | 24 | 16 |
| Gap between cards, groups, fields | 16, 32, 16 | 16, 32, 16 |
| List row | 48 px (table) | 64 px at least (link) |
| Field, Select, date field | 48 px | 48 px |
| Segment, chip, checkbox row, button, back link | 44 px | 44 px |
| Save button | 52 px, left-aligned | 52 px, full width |
| Columns in a form | 2, from 640 px of container | 1 |
| Text | `h1` 28, group title 20, body 15, hint 13, labels 12 | same |

### Checks
- **Contrast:** no new colour pair. Every pair used (hints and captions on `surface`, the pills on `control`, the signed figures on `surface` and on the hovered row, the notice, the error text, the destructive button) is in the table of `components.html`, in both themes.
- **Keyboard:** reading order is top to bottom, left to right; each Select and date picker follows section 9; the disclosures, the segments, the chips and the checkbox are native inputs; the focus returns to the button that opened a dialog.
- **Nothing by colour alone:** the sign, the word of a pill, "Error:", "Warning:", and the icon of each type.

## 18. Calendar

The month grid, the monthly line view, the actions on one occurrence, the "To pay" page, the "Link a transaction" page, the navigation entries they need, and the phone layout of all of them (issue #177, DOMAIN "Occurrence status", "Occurrence override", "The real chart", "Deposit ceiling and overflow"). They are drawn on `components.html`, in the section "Calendar", one card per screen, wide and on a 375 px phone, light and dark. DECISIONS.md, "Calendar", records who decided each point. The owner approved the rendered references on `components.html` on 24 Nov 2026: every value that DECISIONS.md still marks "Proposed" is accepted as rendered (approved as rendered on 24 Nov 2026). The "Link a transaction" page was designed after that approval and approved as drawn on 25 Nov 2026, with the scope and filters below (issue #178).

**Rules for every screen**
- **Built from what exists.** Select, the date picker field and its grid pattern, the exact-syntax amount field, Table, Pill, buttons, the native dialog, the segmented control and the count badge (sections 8 and 9). The new compositions are the day cell, its compact phone form, the view switch (two links in the track of a segmented control), the stacked line list, the card of the "To pay" page, the markup of the count badge, and the list and filters of the "Link a transaction" page. No new token.
- **Real values only, no estimation (ADR-011).** The balance of a day is computed from real transactions and dated planned items, nothing else. No figure on these screens is called an average or an estimate. An occurrence of a rolling-average item carries the pill "Average of 3" (6, 12) before its amount, as in section 17, because the user chose that rule.
- **Real and planned are told apart without colour.** Three signals, always together:

  | | Real | Planned |
  | --- | --- | --- |
  | Word | "Real" | "Planned" |
  | Text | `text-text` | `text-text-muted` |
  | Mark | Solid dot (6 px, `bg-text`) | Dashed hairline: a 12 px dash on a cell or a count, a `border-dashed` top border on a row (the dashed segment of section 11) and, on a phone cell, a hollow ring (6 px, 1.5 px `border-text-muted`) |

  The dash and the muted text mean "not real yet" here as in the chart; the word is what carries the meaning.
- **Statuses are words in a pill** (DOMAIN): Planned, Partial, Confirmed, Overdue, Cancelled. A pill is never a button (section 8). Colour (owner, 24 Nov 2026): every status is neutral (`bg-control text-text`) except **Overdue**, which stays the warning pill (`bg-warning-tint text-warning`) with its word. Amber therefore means "needs attention" on these screens (an overdue occurrence, the unplaced surplus, the ceiling line) and is no longer only the colour of the to-categorize queue; section 4 should say so when its colour rules are next edited (DECISIONS.md, open question 10). The count badge never uses it.
- **Money amounts** come from `Intl` from minor units (section 5), signed (`-€650.00`, `+€2,450.00`; a move carries no sign), regular weight, tabular. Real amounts are ink and planned amounts muted: green and red are not used on these screens, the sign says the direction. The one red is the words "Below zero" (money below zero is "negative" text, section 4). A currency other than the reference one is shown in its own symbol.
- **Dates** come from `Intl`: "Sat 21 Nov 2026" in headings, "Sat 21 Nov" in lists.
- **Layout switches follow the width of the page column (`main`), as in section 17**, not the viewport: the wide navigation switches on the app frame (section 6, 900 px), so a page in a 1280 px frame has about 1016 px, and one in a 900 px frame about 636 px. Header: wide from 640. Grid: wide from **744** (7 cells of 96 px, 6 gaps of 4 px and 48 px of card padding make 744 px; the frozen figure of 640 cannot hold 96 px cells). Lines: table from **880**, stacked list below. Form fields: two columns from 640 (section 17). To pay card: four columns from **768**, since the button column is 192 px so that "Mark as transferred" fits and the cards stay aligned. Link page: table from **640**, filters in one column under 768.
- **Targets, focus, text.** Every control is 44 x 44 px or more, the focus ring is the base 2 px `focus` outline with a 2 px offset, no text is under 12 px (`text-label`), nothing scrolls sideways at 375 px.
- **Page frame.** One `h1` of 28 px (`text-heading`) per page: "Calendar" (grid and lines), "To pay" and "Link a transaction". `<title>`: "Calendar, November 2026" (grid), "Calendar lines, November 2026", "To pay", "Link a transaction". Skip link and landmarks as in section 15.
- **Colour.** Ink for what is chosen and what is real. Blue is today only: the ring, the day number and the word "Today" of the grid and its details (section 4).

### Month header

Shared by the grid and the lines.

**Wide (container 640 px and more)**
- **Row 1:** `h1` "Calendar" on the left, and on the right two links side by side (`btn link`, 44 px, 4 px apart, wrapping when the line is full): "To pay (3)" and "Planned items" (the way in of section 17). The count of "To pay" is the number of occurrences in its "Due" section; its accessible name says it in words, `aria-label="To pay, 3 due"`, which starts with the visible text. The link is on every width, so a page column without the sidebar (under 900 px of app frame) still has the count (owner, 24 Nov 2026). `mb-6`.
- **Row 2:** one flex row, `gap-4`, wrapping, `items-end`:
  - **Month navigator:** previous icon button (44 px circle, `hover:bg-control`, `aria-label="Previous month, October 2026"`), the month name in an `h2` of 20 px (`text-title`, medium, `min-w-40` = 160 px, centred, `aria-live="polite"` so a change is announced), next icon button (`aria-label="Next month, December 2026"`). The icon is the `CaretDown` of the date picker head, turned 90 degrees (previous) and minus 90 (next), `aria-hidden`. Both buttons change the month shown and keep the view and the account.
  - **View switch** (`nav aria-label="Calendar view"`): two links "Grid" and "Lines" in the track of the segmented control (`rounded-pill bg-control p-[3px] gap-0.5`), 44 px items, `min-w-22` (88 px), `text-body font-medium`. The current one is ink (`bg-primary text-on-primary`) with `aria-current="page"`, the other `text-text-muted`, hover `text-text`. They are links (they change the URL), not radios, so they keep the look of section 8 and not its markup.
  - **Account selector** (`ml-auto`, 280 px): the Select of section 9. Label "Daily balance" (`text-caption font-medium`), hint "Real transactions and dated planned items only." (`text-caption text-text-muted`, `aria-describedby`), a 48 px control. Options: "Checking accounts, EUR" first and default (the active checking accounts in the reference currency, summed; owner, #172 Q1, 19 Nov 2026), then one option per account in its own currency ("Current, EUR", "Savings A, EUR", "Travel card, USD"). Without JavaScript it is the native select in a GET form with a secondary "Show" button.
- `mb-4` under the row.

**Phone (under 640 px)**
- Row 1: the `h1` and the two links, `gap-3`, the links wrapping under the title when 343 px is not enough.
- Navigator full width: previous at the left edge, next at the right edge, the month name centred between.
- View switch full width, two equal segments (`grid grid-cols-2`).
- Select full width (343 px), under the switch. Rows are 12 px apart.

### Month grid

**Structure.** A card (`bg-surface rounded-card`, padding 24 wide, 0 on the sides and 12 above and below on a phone) holding one `role="grid"` named by the month (`aria-label="November 2026"`): a header row of seven `role="columnheader"` and five or six `role="row"` of seven `role="gridcell"`. The week starts on the first day of the language (week data, ADR-025; the reference draws Monday first). Days outside the month are empty cells (no border, no content, not focusable). The weekday labels are `text-label` uppercase muted, the short name visible and the full name in `aria-label` ("Mon", "Monday"), 32 px tall.

**Wide cell (container 744 px and more)**
- **Box:** `min-w-24` (96 px) by `min-h-26` (104 px), `p-2` (8 px), `rounded-control`, `bg-surface`, a 1 px `divider` border, 4 px gap between cells (`gap-1`). The cell grows with its content and the whole row follows. The gap is 4 px so that the focus outline, 2 px wide and 2 px away, fills it exactly.
- **Content, top to bottom:**
  1. A line with the day number on the left (`text-caption font-medium`, tabular) and, on a today cell, the word "Today" on the right (`text-caption font-medium text-accent`).
  2. The end-of-day balance, right-aligned (`text-caption`, tabular, ink, signed: `€1,240.00`, `-€85.00`).
  3. When the balance is below zero, the words "Below zero" under it (`text-caption font-medium text-negative`, right-aligned). The sign alone is not enough.
  4. When a planned transfer leaves a surplus that fits nowhere, "Unplaced surplus" (`text-caption font-medium text-warning`, wrapping on two lines when the cell is narrow). The figure and the accounts are in the details (DOMAIN, deposit ceiling and overflow).
  5. At the bottom (`mt-auto`), the counts in words, one per line, only those above zero: "2 real" in ink, then "1 planned" in muted text preceded by the 12 px dashed mark (`inline-block w-3 border-t-[1.5px] border-dashed border-text-muted`, `aria-hidden`, 6 px before the text).
- **States:**

  | State | Treatment |
  | --- | --- |
  | Rest | As above |
  | Hover | `bg-surface-sunken`; cell colours do not change |
  | Today | A 1.5 px `accent` inner ring (`shadow-[inset_0_0_0_1.5px_var(--color-accent)]`, section 9), the day number in `text-accent` medium, the word "Today". `aria-current="date"` |
  | Selected | `bg-primary text-on-primary`, no hover. **Every element in it turns `on-primary`**: the number, the balance, the counts, the words "Below zero", "Unplaced surplus" and "Today", the dashed mark. The words carry the meaning, since red, amber and muted fail on the ink fill (3.65:1 and 2.67:1 for red) |
  | Selected and today | Drawn selected (ink fill, no ring), `aria-current="date"` still on the cell, the word "Today" still in it and in its name (as the date picker, ADR-025) |
  | Focus | The base outline (2 px `focus`, 2 px offset) on the cell, above its neighbours (`focus-visible:z-10`) |

**Compact cell (phone, container under 744 px)**
- **Box:** 49 x 56 px (343 px of content in seven columns), no gap, no border, `rounded-control`, `p-1` (4) on the sides and `pt-2` (8) above. Never narrower than 44 px, never scrolling sideways.
- **Content:** the day number (`text-caption font-medium`, centred, tabular), 4 px under it a row of at most three glyphs 3 px apart:
  - a solid dot, 6 px, `bg-text`: there are real entries;
  - a hollow ring, 6 px, 1.5 px `border-text-muted`: there are planned entries;
  - a short bar, 12 x 3 px, `rounded-pill bg-negative`: the balance is below zero.

  In the selected cell the glyphs are `on-primary` (the bar too). Glyphs are `aria-hidden` and always repeated in words (legend, name, details).
- **Today:** the same 1.5 px `accent` ring on the cell and the accent day number. The hollow ring glyph is another thing, 6 px inside the cell. The word "Today" is not drawn (there is no room): it is in the name and in the details heading. Hover does not exist on a touch screen; the selected cell is `bg-primary`.
- **Legend:** one line of `text-caption text-text-muted` above the weekday row, linked to the grid by `aria-describedby`: "Solid dot: real entries. Hollow ring: planned entries. Bar: below zero." (it sits above and not between the weekday row and the days because a paragraph inside a `grid` is not valid). It wraps on two lines at 343 px.
- **All the content lives in the details panel** (below), the main reading surface on a phone: the balance, the counts, "Below zero" and the unplaced surplus are not drawn in the cell.

**Name of a gridcell.** Visible content is hidden from the name by an `aria-label` that says everything, the figure formatted by `Intl` with the currency code (`currencyDisplay: "code"`), never by hand:

`{day} {month}[, today], end-of-day balance {amount}[, {n} real][, {n} planned][, no entries][, below zero][, unplaced surplus]`

Example, a negative balance: "21 November, today, end-of-day balance -85.00 EUR, 2 real, 1 planned, below zero, unplaced surplus". A day without entries says "no entries".

**Keyboard** (the model of the date picker, ADR-025). One tab stop: the grid is entered on one day (the selected day, else today, else the first of the month) with `tabindex="0"` (roving tabindex, every other cell `-1`), and Tab leaves it for the details panel.

| Key | Effect |
| --- | --- |
| Left, Right | A day before, a day after |
| Up, Down | A week before, a week after |
| Home, End | First and last day of the week |
| Page Up, Page Down | A month before, after (the day is kept or clamped to the last day of a shorter month); with Shift a year |
| Enter, Space | Select the day: the details panel shows it, the cell is `aria-selected="true"` and drawn selected |

Moving does not select, and a key that would leave the month stops on the first or last day of the month shown (the focus is clamped, the month is changed with the arrows of the header; the owner confirms this, the alternative being to change the month shown). The date arithmetic is `addDays` and `addMonths` of the date picker. There is no Escape: nothing opens.

**Day details** (under the grid, `mt-4`)
- **Card:** `bg-surface rounded-card`, padding 24 (16 on a phone), a `region` named by its heading. Reading order: heading, balance, entries.
- **Heading:** an `h3` of 20 px (`text-title`) with the date, "Sat 21 Nov 2026", and for today the word "Today" 8 px after it in `text-accent font-medium`. The heading line is a polite live region, so selecting a day is announced.
- **Balance:** the end-of-day balance first, in `text-amount` (36 px, regular, tabular), the words "End-of-day balance" under it in `text-label` uppercase muted. When below zero, "Below zero" in `text-body font-medium text-negative` follows the figure. An unplaced surplus adds the line "Unplaced surplus: €100.00 stays in Current, Savings B is full." (`text-caption text-warning`, the words of section 10). These lines are on phone and wide alike.
- **Entries:** the counts in words ("2 real, 1 planned") are the caption of the entries table (the heading of the list on a phone), so that its region is not named like the card; the entries follow. A day without entries says "No entries on this day." in muted text.
- **Entry, wide:** a grid of five columns, `grid-cols-[72px_minmax(0,1fr)_96px_112px_auto] gap-4 items-center`, `min-h-14` (56 px), a hairline above (`divider` for a real entry, 1 px `border-dashed border-border-control` for a planned one):
  1. The kind word, "Real" or "Planned" (`text-caption font-medium`, ink or muted);
  2. The description (`text-body font-medium`, ink or muted) over the account (`text-caption text-text-muted`); under them, for a planned income above a ceiling, the ceiling line (below);
  3. The status pill (a real transaction linked to an occurrence says "Confirmed"; an unlinked real transaction has no pill);
  4. The signed amount, right-aligned, tabular, preceded by "Average of 3" where it applies;
  5. The actions (section "Actions on an occurrence"), `gap-2`, only for the statuses that have them.
- **Entry, phone:** a stack, 12 px padding above and below and the same hairline: line 1 the description (medium) and the amount on the right; line 2 `text-caption`, the kind word, the account and the pill, wrapping; line 3 the actions, wrapping, each 44 px high.
- **Ceiling line:** a planned income above the ceiling of its account shows "Exceeds the declared ceiling of Savings A" under its description: `WarningCircle` icon (16 px, `aria-hidden`) and `text-caption text-warning`, the words being the signal (DOMAIN: an income is accepted with a warning, not routed).

### Monthly line view

The same header, then one card (`bg-surface rounded-card p-6`, `p-4` on a phone).

**Table (container 880 px and more)** (section 8, Table)
- **Caption** "November 2026" (medium), visible. Header cells in `text-label` uppercase muted, bottom-aligned, wrapping.
- **Columns, left to right:**

  | Column | Width | Content |
  | --- | --- | --- |
  | Date | 96 px | "Sat 21 Nov", on every row |
  | Description | flexible, 160 px at least | Medium, ink or muted. Under it the ceiling line, when it applies |
  | Account | 128 px | The account, "Current to Savings A" for a move |
  | Kind | 72 px | "Real" or "Planned", as a word |
  | Status | 104 px | The pill, for an occurrence or a linked transaction |
  | Amount | 104 px | Signed, right-aligned, tabular |
  | Balance at end of day | 144 px | Right-aligned, **on the last row of each day only**, with "Below zero" under it when negative (`text-caption font-medium text-negative`). The header says "Balance at end of day" in two lines |

- **Rows:** 48 px (more with the ceiling line), a `divider` hairline above, hover `bg-surface-sunken`, cells `px-3`, one day after another in date order. A real row is `text-text`; a planned row is `text-text-muted` with a 1 px `border-dashed border-border-control` top border instead of the `divider` one, and its Kind cell says "Planned". Money below zero shows its balance in ink with the word, never the colour alone.
- **Cancelled row:** muted text, the description struck through (`line-through`), and the pill "Cancelled". The strike is decoration: the pill is the status. Its only action is "Restore".
- **Action row:** under every occurrence that has actions, a row of its own (`td colspan="7"`, `pb-3`, no top border), the buttons right-aligned (`flex justify-end gap-2`, 44 px high). Seven columns have no room for three buttons, and a menu would be a new component. Rows that have none have no second row.

**Stacked list (container under 880 px, the phone)**
- A `ul` inside the card, each entry a `li` with 12 px padding above and below and the hairline (dashed for a planned one):
  1. Date (`text-caption text-text-muted`, 72 px wide) and description (medium) side by side, wrapping;
  2. The kind word, the pill and the amount (right-aligned) on one line, `gap-2`; the account (caption muted) under it;
  3. For the last entry of a day: "Balance after the day: €1,240.00" (`text-caption text-text-muted`, the figure ink), and "Below zero" next to it in `text-negative font-medium` when it applies;
  4. The actions, wrapping, each 44 px high.
- The list is a real list; the caption becomes an `h2`.

### Actions on an occurrence

| Status | Actions |
| --- | --- |
| Planned, Partial, Overdue | The button of the type (below), "Link a transaction", "Change" |
| Confirmed | None (a settled occurrence has no "Change": it must be unlinked first, #174 Q1, 19 Nov 2026) |
| Cancelled | "Restore" only |

- **Buttons:** secondary (`bg-control text-text`), 44 px, in lists and rows. The primary is for the one main action of a screen, and no screen of this section has one. Each one has a name that starts with its visible words and adds what it acts on, since several share a page: `aria-label="Mark as paid, Rent, 5 Nov 2026"`, "Link a transaction, Rent, 5 Nov 2026", "Change, Rent, 5 Nov 2026", "Restore, Rent, 5 Nov 2026".
- **The label follows the type** (owner, 24 Nov 2026): "Mark as paid" for an expense, "Mark as received" for an income, "Mark as transferred" for a transfer. It applies to the day details, the line view and its stacked list, To pay, the accessible names, the pending label and the toast. Interests are not planned items, so they have no button. Expenses, incomes and planned transfers are all listed on "To pay".
- **Mark as paid, received or transferred** records a transaction with the planned date and amount of the occurrence (the remaining amount of a partial one) and links it. The "To pay" page is where date and amount are corrected first. Pending: "Marking as paid…", "Marking as received…" or "Marking as transferred…", `aria-busy="true"`. A success toast (section 8) says "Success. Rent marked as paid.", "Success. Salary marked as received." or "Success. Savings transfer marked as transferred." and the row becomes Confirmed. A planned transfer follows the manual transfer flow, with the split shown before recording (#178 Q1, 19 Nov 2026); that step is the existing one of section 10 and is not redrawn here.
- **Link a transaction** opens a page of its own (owner, 24 Nov 2026), designed under "Link a transaction page" below.
- **Restore** removes the override at once, with no dialog (pending "Restoring…", toast "Success. Rent is back on its planned date." for a move, "Success. Rent is planned again." for a skip).

**The dialog "Change this occurrence"** (the native dialog of section 8)
- **Box:** `rounded-card bg-surface shadow-overlay p-6`, at most 420 px (343 px less than the viewport minus 32 on a phone), `bg-backdrop` backdrop, in the top layer. Title `h3` `text-title`: "Change this occurrence". Under it, one line of `text-caption text-text-muted` that names the occurrence: "Rent, planned for 5 Nov 2026".
- **Choice:** a fieldset with the visible legend "What to do" (`text-caption font-medium`) and a three-segment control, full width (`grid grid-cols-3`), native radios, "Move", "Change", "Skip", "Move" chosen first, 44 px segments, ink when chosen (section 8).
- **Fields**, shown for Move and Change and hidden for Skip: "Date" (the date picker field, prefilled with the date in force) and "Amount" (the exact-syntax amount field of section 9, right-aligned, the currency at the end, `inputmode="decimal"`, hint "Without a sign: the type sets the direction.", prefilled with the amount in force). The same errors as section 17 ("Error: invalid amount …", "Error: enter a date.").
- **Note**, always visible, `text-caption text-text-muted`: "Only this occurrence changes. The planned item and its other occurrences stay as they are." For Skip it adds "This occurrence will show as Cancelled."
- **Footer:** `mt-6`, right-aligned, `gap-2`: Cancel (secondary, **takes the focus first**), then Save (primary, ink). For an occurrence that already has an override, a link button "Restore" (`btn link`, `aria-label="Restore, back to the rule of the planned item"`) sits on the left (`mr-auto`) and restores it without saving. A server failure is one line above the footer, `role="alert"`: "Error: the occurrence could not be changed. Try again."
- Escape closes. The focus returns to the button that opened it. Success closes, with a toast ("Success. Rent moved to 8 Nov 2026.", "Success. Rent changed to €680.00.", "Success. Rent skipped.").

### To pay page

**Page** (`/planned/due`). `h1` "To pay" (`text-heading`). Under it one line (`text-body text-text-muted`, 8 px below): "Occurrences that are due. Check the date and the amount, then mark each one as paid, received or transferred." Then sections 32 px apart, each an `h2` of 20 px (`text-title`):
- **"Due"**: the unsettled, non-cancelled occurrences whose effective date is today or earlier (planned ones still in their matching window, partial ones and overdue ones), oldest first (owner, 25 Nov 2026).
- **"Due in the next 7 days"**: the following ones, in date order.

A section with nothing in it is not drawn. When both are empty, the inner-surface block of section 8 (`bg-surface-sunken rounded-control`, centred, padding 32 x 16, muted) says "Nothing to pay." and has no action.

**Item, wide (container 768 px and more)**
- **Card:** `bg-surface rounded-card p-4`, 12 px between cards, one grid, `grid-cols-[minmax(0,1fr)_176px_160px_192px] gap-4 items-end`. The last column is fixed so that the fields of every card line up whatever the label of the button:
  1. **What:** the description (`text-body font-medium`), the status pill beside it (Planned, Partial or Overdue), and under them `text-caption text-text-muted` the account and "Due Thu 5 Nov 2026";
  2. **Date:** the date picker field of section 9, 48 px, label "Date", prefilled with the planned date (the override date when there is one);
  3. **Amount:** the exact-syntax amount field, 48 px, right-aligned, the currency at the end, label "Amount" ("Remaining amount" for a partial occurrence, prefilled with what remains), prefilled with the planned amount, without a sign;
  4. **Button:** "Mark as paid", "Mark as received" or "Mark as transferred" by type, secondary, 44 px, filling its 192 px column, aligned with the bottom of the fields.
- **Names.** The visible labels stay short; each carries the item in a visually hidden suffix: "Date of Rent, due 5 Nov 2026", "Amount of Rent, due 5 Nov 2026", and the button `aria-label="Mark as paid, Rent, due 5 Nov 2026"` ("Mark as received, Salary, due 28 Nov 2026", "Mark as transferred, Savings transfer, due 21 Nov 2026").
- **After a click:** the transaction is created with the date and the amount in the fields. The card leaves, a toast says "Success. Rent marked as paid.", and the focus goes to the next card's button, or to the `h1` when none is left. Pending: "Marking as paid…". An error in a field uses the invalid state (section 9) and keeps the card.
- **All three types are listed** (owner, 24 Nov 2026): an expense, an income and a planned transfer, each with the button of its type; the card is the same. The reference shows one of each, and the sidebar badge and the header link count the "Due" section (3: Water bill, Internet and the Savings transfer of today).

**Item, phone (under 640 px)**
- A stacked card, `p-4`, 12 px between cards: line 1 the description (medium) and the pill; line 2 the account and the due date (caption muted); then Date and Amount, **full width** and 16 px apart; then the button of its type at **full width, 44 px** high.

### Link a transaction page

Opened by the button "Link a transaction" of an occurrence (owner, 24 Nov 2026: a page of its own, not a dialog), on `/planned/link?item=<id>&date=<nominal date>` with `back=grid` or `back=lines` for the way back. Drawn on `components.html`, section "Calendar: link a transaction", wide and phone, light and dark, plus the empty state on a phone. **Approved** as drawn by the owner on 25 Nov 2026 (issue #178), without the account select: the list is limited to the occurrence's own account. A planned transfer has no "Link a transaction" button, since a transfer is never linked by hand.

**Rules.** Only unlinked transactions are listed, since a transaction settles at most one occurrence (DOMAIN invariant 5), and only those of the occurrence's own account with the sign of what it expects; the server refuses any other account (owner, 25 Nov 2026). Built from the existing Select, the date picker field, Table, Pill and the secondary button. No new token.

**Page**, top to bottom (the page column is `cl-main`, as the other pages):
1. **Back link**: "Back to the calendar" (the grid or the line view the user came from, in the month of the occurrence), a `btn link` of 44 px with the caret of the date picker turned 90 degrees, `aria-hidden`. It comes first in the reading order, so that a keyboard or touch user does not cross a long list to leave.
2. **`h1`** "Link a transaction" (`text-heading`).
3. **The occurrence** (`mt-4`): a box `bg-surface rounded-card p-4` with a 1 px dashed `border-control` border, the mark of a planned thing (section 18, rules). Left: the description (`text-body font-medium`) with its status pill beside it (Planned, Partial or Overdue), and under it `text-caption text-text-muted` the account and "Planned for Fri 20 Nov 2026". Right, muted and tabular: the word "Planned" (`text-caption font-medium`) and the planned amount, signed ("-€29.90"; the remaining amount for a Partial one). It wraps under the left part on a phone.
4. **Filters** (`mt-6`, a GET `form` with `role="search"` named "Filter the transactions"): three labelled fields, 48 px, each with its visible label, and a secondary "Show" button that applies them.

   | Field | Control | Default |
   | --- | --- | --- |
   | Search | The text field of section 9, placeholder "Description" | Empty |
   | From | The date picker field | The start of the matching window of the item around the occurrence (the start of the period of a provision) |
   | To | The date picker field | The end of that window (the end of the period) |

   The user can widen the range, or clear a bound to list everything on that side (owner, 25 Nov 2026). Wide from 768 px of page column: one row, `grid-cols-[minmax(0,1fr)_176px_176px_auto] gap-4 items-end`. Under 768 px: one column, every field and the button at full width, 16 px apart.
5. **Count line** (`mt-6 mb-3`, `text-caption text-text-muted`, `role="status"` so a change is announced): "12 transactions" ("1 transaction", "0 transactions").
6. **The list**, in a card (`bg-surface rounded-card`, `p-6`, `p-4` on a phone). From 640 px of page column a Table (section 8) with a visually hidden caption "Unlinked transactions of Current, in EUR" (the currency code): Date ("21 Nov 2026"), Description, Account, Amount (signed, right-aligned, tabular) and a last column whose header is the visually hidden word "Action", holding the secondary button "Link" (44 px). Rows are 48 px at least, `divider` hairlines, hover `bg-surface-sunken`. These are real transactions: ink text, no dashed mark.
   Under 640 px a stacked list: line 1 the date (`text-caption text-text-muted`, 72 px) the description (medium) and the amount on the right; line 2 the account (`text-caption text-text-muted`); line 3 the "Link" button at full width, 44 px. 12 px between entries, a `divider` hairline above each.
7. **Empty state**: when nothing matches, the count line says "0 transactions" and the inner-surface block of section 8 (`bg-surface-sunken rounded-control`, centred, padding 32 x 16, muted) says "No unlinked transaction matches." and has no action.

**Names.** The button reads "Link" and is named `aria-label="Link, Pharmacy, 21 Nov 2026, -€18.50, to Internet due 20 Nov 2026"` (it starts with its visible word). The page `<title>` is "Link a transaction".

**After a click**: pending "Linking…" with `aria-busy="true"`; the link is recorded, the user returns to the calendar and a toast (section 8) says "Success. Pharmacy linked to Internet." and the occurrence is Confirmed. A failure is one line above the list, `role="alert"`: "Error: the transaction could not be linked. Try again."

**Focus and keyboard.** Reading order is back link, `h1`, occurrence, filters, count, list. Every control takes the base 2 px `focus` outline with a 2 px offset. The filters follow section 9 (Select and date picker keyboard models). The count line is announced when a filter changes the list.

### Navigation

**Decided by the owner.** The lists below come from the owner's answers on GitHub: issue #173, comment "Owner answers (19 Nov 2026)", Q1 (sidebar, tab bar, Transactions in the More list, a link to `/planned` in the calendar header), and issue #178, item 4 of its body (the sidebar entry of To pay with a count badge and a row in the More list); the due count on a phone was answered on 24 Nov 2026 (DECISIONS.md, open question 9). Section 6 and the ROADMAP row "Phone layout details" still carry their interim wording until #173 lands and updates the ROADMAP; this file does not edit them, and for the calendar the text below supersedes them once it is implemented.

**Wide sidebar** (container 900 px and more; 208 px column, items as section 6: 44 px, `px-3`, `gap-2.5`, icon and label, the current one raised on `surface` with `aria-current="page"`). Order:

| Entry | Icon | Note |
| --- | --- | --- |
| Overview | `ChartLine` | |
| Calendar | `CalendarBlank` | |
| Transactions | `ArrowsDownUp` | |
| Accounts | `Wallet` | |
| Imports | `TrayArrowDown` | |
| Planned | `Repeat` (new, section 7) | The way in of section 17, now also from the sidebar |
| To pay | `Receipt` (new, section 7) | With a count badge: the number of occurrences in "Due" |
| To categorize | `Tray` | Kept from section 6, with its count (the issue's list omits it; placed at the end of the queues, approved as rendered on 24 Nov 2026) |

Settings stays at the foot (`GearSix`).

**Count badge** (section 8, "text on control"; the markup it was missing): `inline-flex items-center justify-center ml-auto min-w-6 rounded-pill bg-control px-2 py-0.5 text-caption font-medium text-text tabular-nums`, a status and not a target (no 44 px). The text is the number; a visually hidden word follows it so that the link reads "To pay, 3 due" (and "To categorize, 4"). The brand board draws a 28 px badge in `text-label`; this one is 13 px, as asked by the issue, and the board is the one to follow when they are unified.

**Phone tab bar**: Overview, Calendar, Accounts, Imports, in the 343 px pill track with 52 px items (section 6), the current one in ink. Their icons are `ChartLine`, `CalendarBlank`, `Wallet`, `TrayArrowDown`. **Transactions** and **To pay** are rows of the "More" list at the end of `/settings`, each with its icon; the "To pay" row carries the count badge. The Settings button of the top bar gets no badge, and neither does the tab bar. The due count on a phone is the link "To pay (n)" of the calendar header, next to "Planned items" (owner, 24 Nov 2026): the number is visible, and the name says it in words ("To pay, 3 due"). The row of "To pay" in the More list keeps its count badge. **Planned** has no tab and no row: the link "Planned items" of the calendar header stays its way in (#173 Q1).

What the older texts say. Section 6: "the tab bar holds Overview, Transactions, Accounts and Imports (owner, 12 Nov 2026). Calendar takes the place of Transactions and Simulations the place of Imports when they land", and the More list is "Balances, Categories, Rules, Currencies, Backup, Security". ROADMAP, "Phone layout details": "a floating tab bar (Overview, Transactions, Accounts, Imports until Calendar and Simulations land) and the other pages in the More list of `/settings`". Both are interim wording: the owner's comments of 19 Nov 2026 on #173 and #178 give the final lists above, with Transactions and To pay in the More list. Section 6 and the ROADMAP row were updated when #173 landed; nothing here is a second decision.

### Phone layout

- **Frame:** 375 px, 16 px gutters, 343 px of content, the top bar (logo, "Settings", "Add transaction") above and the floating tab bar below. Content ends 92 px above the bottom (the 64 px bar, its 12 px offset and 16 px of air) so the bar never hides the last card.
- **Order on a screen:** header, grid or list, details. The details panel follows the grid in the DOM, so one Tab from the grid reaches it.
- **No horizontal scroll** at 375 px and at 200 % zoom: the grid is seven fixed columns of 49 px, the table is a list, the fields are full width.
- **Light and dark:** tokens only, no `dark:` class. Every screen is drawn in both on `components.html`; the new pairs are in Checks.

### Measures

| Element | Wide | Phone |
| --- | --- | --- |
| Page gutter, content | 32 px, column of the app frame | 16 px, 343 px |
| Card padding | 24 | 16 (grid card: 12 above and below, 0 on the sides) |
| Header rows | 16 px apart, `mb-6` and `mb-4` | 12 px apart |
| Icon button, view link, Select row | 44 px circle, 44 px, 48 px | same |
| Month title | `text-title`, 160 px minimum | `text-title`, centred |
| View switch | 88 px items in a pill track | two equal segments, full width |
| Account selector | 280 px | 343 px |
| Weekday row | 32 px, `text-label` | 32 px |
| Grid breakpoint | container of 744 px and more (7 x 96 + 6 x 4 + 2 x 24) | under 744 px |
| Day cell | 96 x 104 px at least, `p-2`, `gap-1`, radius 12 | 49 x 56 px, no gap, radius 12 |
| Marks | dash 12 px, 1.5 px | dot 6 px, ring 6 px (1.5 px), bar 12 x 3 px |
| Today | 1.5 px `accent` inner ring | same |
| Focus | 2 px `focus` outline, 2 px offset | same |
| Day details entry | 56 px at least, five columns | stack, 12 px padding |
| Table row, action row | 48 px, 44 px buttons | list entry, 12 px padding |
| Balance column | 144 px | third line |
| Pill, count badge | 4 px 10 px, 2 px 8 px, 13 px | same |
| Dialog | 420 px, padding 24 | viewport minus 32 |
| To pay card | `p-4`, four columns (the last 192 px) from 768 px, 12 px apart | stacked, fields and button full width |
| Link page: occurrence box | `p-4`, 1 px dashed `border-control` | same, the amount wraps under |
| Link page: filters | One row, 48 px fields (240, 176 and 176 px fixed) from 768 px | One column, full width, 16 px apart |
| Link page: list | Table from 640 px, 48 px rows, "Link" 44 px | Stacked list, "Link" full width, 44 px |
| Sidebar | 208 px, 44 px items | |
| Tab bar | | 343 px track, 52 px items |
| Text | `h1` 28, section 20, body 15, caption 13, labels 12 | same |

### Checks
- **Contrast:** no new colour, but new pairs (cell, hovered cell, selected cell), every one in the table of `components.html`, light and dark. The page computes them live; the values from the tokens:

  | Use | Pair | Needs | Light | Dark |
  | --- | --- | --- | --- | --- |
  | Day number, "Today", ring | `accent` on `surface` | 4.5 and 3 | 5.55 | 5.48 |
  | The same on a hovered cell | `accent` on `surface-sunken` | 4.5 and 3 | 4.87 | 5.16 |
  | "Below zero", bar | `negative` on `surface` | 4.5 and 3 | 5.49 | 6.78 |
  | The same on a hovered cell | `negative` on `surface-sunken` | 4.5 | 4.82 | 6.39 |
  | Unplaced surplus, ceiling line | `warning` on `surface` | 4.5 | 5.61 | 11.19 |
  | The same on a hovered cell | `warning` on `surface-sunken` | 4.5 | 4.92 | 10.54 |
  | Overdue pill | `warning` on `warning-tint` | 4.5 | 4.54 | 7.87 |
  | Planned text, hollow ring, dash | `text-muted` on `surface` | 4.5 and 3 | 6.18 | 7.88 |
  | Planned row hovered, empty state | `text-muted` on `surface-sunken` | 4.5 | 5.42 | 7.42 |
  | Dashed row border | `border-control` on `surface` | 3 | 3.79 | 3.76 |
  | Count badge, neutral pill | `text` on `control` | 4.5 | 17.57 | 15.52 |
  | Selected cell, every element | `on-primary` on `primary` | 4.5 | 20.03 | 19.91 |
  | Focus ring next to a selected cell | `focus` on `primary` | 3 | 3.61 | 3.30 |
  | Result count of the Link page | `text-muted` on `bg` | 4.5 | 5.18 | 8.67 |
  | Dashed box of the occurrence | `border-control` on `bg` | 3 | 3.18 | 4.14 |

  The pair counts of section 1 and of DECISIONS.md ("148 pairs") are not recomputed here: they count the pairs of the three pages as they were.
- **Keyboard:** the grid is one tab stop, then the details panel; every key of the table above works; the month and the view switch are links and buttons; the dialog takes the focus on Cancel and returns it to its trigger; the To pay fields follow section 9 and the buttons come after their fields; on the Link page the back link comes first, the filters follow section 9 and each "Link" button is one tab stop.
- **Nothing by colour alone:** the words "Real" and "Planned", the status pill, "Below zero", "Unplaced surplus", "Exceeds the declared ceiling", "Today", the dashed mark, the dot, the ring and the bar (with their legend and their accessible name).
- **Motion:** none new. The selected segment of the view switch and the dialog follow section 6, and everything is instant under `prefers-reduced-motion`.
- **Real values only:** no blur, no estimate and no word "average" except the pill of a rolling-average item the user chose (ADR-011).

## 19. Open points

These need action before the related work lands in `src/` (details in DECISIONS.md, "Open questions for the owner"):

- **Calendar:** the owner approved the rendered references of section 18 on 24 Nov 2026 and answered open question 9 of DECISIONS.md (the navigation, the due count on a phone, the Overdue pill, the labels by type, the dedicated page of "Link a transaction"). What remains: the "Link a transaction" page itself is to be validated on `components.html`; its route and the default date range of its filters are not decided; whether its account select may widen the list to the other accounts of the same currency is to be confirmed (DECISIONS.md, open question 11); and section 6 and the ROADMAP row "Phone layout details" keep the interim wording until #173 lands and updates them. Section 4 should name amber as "needs attention" when its colour rules are next edited (open question 10).

- **Planned items:** the way in on a phone, the fields that cannot change after creation, the limits DOMAIN does not give (months, weeks, window in days), the category of a planned item, and whether a cancelled item can be resumed are listed in DECISIONS.md, "Open questions for the owner", items 4 to 8 (item 4 is answered for the calendar link by #173 Q1). The owner also validates the rendered references of section 17 on `components.html`.

- **Motion on the references:** `components.html` shows the CSS part of section 6 (states, popovers, dialog, disclosure, step editor, flow steps, progress bar, toast in and out). The trajectory line drawing and the page entrance are specified but not drawn: `brand-board.html` would need its bundle rebuilt. They are checked in the app when the chart and the layout land.
- **Values to confirm:** the motion tokens are proposed by role, since the references are still images. The owner confirms them on `components.html` (DECISIONS.md, "Motion").
- **Shimmer values to confirm:** the 1500 ms cycle, the band tone (`control-hover`, since `control` equals `surface-sunken` in the light theme) and the `surface` tone of a block on the page ground are proposed; the owner confirms them on `components.html` (DECISIONS.md, "Motion").
- **Icons of `form-proposals.html`:** it keeps its hand-drawn icons, as the record of the proposals of 11 Nov 2026. `components.html` and `brand-board.html` use Phosphor.
- **Phosphor at 20 px:** its Regular stroke is 1.25 px at that size (1.5 px at 24 px). The owner judges it on `components.html`; drawing icons at 24 px would change the layouts.
