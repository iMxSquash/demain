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
17. [Open points](#17-open-points)

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

Everything below lives in `design-system-preview/identity/`. Nothing in `src/` uses it yet.

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
  - Settings at the foot.
- **Navigation, narrow:**
  - the logo and a round "Add transaction" button at the top;
  - a floating tab bar at the bottom, four destinations (Overview, Calendar, Accounts, Simulations), in a 343 px pill track with 52 px items and the selected item in ink.
  - **Until Calendar (M2) and Simulations (M3) exist:** the tab bar holds Overview, Transactions, Accounts and Imports (owner, 12 Nov 2026). Calendar takes the place of Transactions and Simulations the place of Imports when they land.
- **Settings** (`/settings`, owner, 12 Nov 2026): one page that holds Appearance (the theme setting of section 3) and Language, then links to Security and Backup. Until the navigation lands, the theme setting sits in the header next to the language switcher.

  Use a container query on the app frame, not a media query.
### Motion

Motion shows a change the user caused, or that the app made for them: a layer that opens, a step that follows, a state that switches. It never decorates and never asks for attention on its own.

**Tokens** (`tokens.css`; never a raw duration or easing in a component):

| Token | Value | Use |
| --- | --- | --- |
| `--motion-duration-state` | 120 ms | Tone change on hover, press, check, selection |
| `--motion-duration-exit` | 140 ms | A layer that leaves |
| `--motion-duration-enter` | 200 ms | A layer or a page that arrives |
| `--motion-duration-step` | 260 ms | A step of the add-transaction flow, the progress bar |
| `--motion-duration-draw` | 600 ms | The trajectory line, drawn once; the longest motion allowed |
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

**Never**

- An initial state rendered by the server, in a `style` attribute or in Motion's `initial`, for content that is in the HTML: the content security policy blocks style attributes, so the page would show its final state and then jump. Content rendered by the server enters with a CSS animation from the stylesheet (the `motion-enter` utility of `tailwind.css`, or a keyframe in a CSS module), which runs from the first paint. Motion's components rendered on the server take `initial={false}`; Motion animates only what the browser mounts after the page is shown.
- A figure that counts up or rolls: a real amount is shown as it is (principle 1).
- Bounce, overshoot, springs that oscillate, parallax, motion tied to scroll, loops, or anything that moves for more than `--motion-duration-draw`.
- Motion on the holographic signature or on the glow of the chart lines.
- Waiting for a motion to finish before accepting input: focus moves at once (the heading of a new step, the trigger of a closed picker) and the motion plays around it.

**Reduced motion**

- With `prefers-reduced-motion: reduce`, every duration and offset is 0: each change is instant, fades included (owner, 12 Nov 2026).
  - For CSS, `tokens.css` does it.
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
  - a pill track on `control`, 3 px padding, 44 px segments in muted medium text;
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
- The server's `parseAmount` currently accepts more (signs, symbols, grouping). Narrow it per field when the forms are rebuilt.

### Custom pickers

Selects and dates use custom pickers, never the browser's.

- **Select:**
  - built on the WAI-ARIA select-only combobox: a button with `role="combobox"` that opens a listbox, plus a hidden input that posts the value;
  - options are 44 px tall, the active one on `control`, the selected one medium with a check, and the list scrolls past 296 px;
  - keys: arrows, Home, End, Page Up and Page Down (10 options), Enter and Space, Escape, Tab, and type-ahead.
- **Date:**
  - the WAI-ARIA date picker dialog: a 332 px popover centred under its field (at most the viewport minus 32 px), a month title with previous and next icon buttons, a weekday row, and 44 px round days;
  - today has a 1.5 px `accent` inner ring and `accent` text; the chosen day is filled with `primary`, without a hover; other days hover to `control`;
  - a "Today" link in the footer;
  - keys: arrows, Home and End (week), Page Up and Page Down (month, with Shift a year), Enter, Escape. Focus is held inside while it is open.
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
  - It has a heading ("Above the ceiling"), which takes the focus, and a notice: "Warning: €50.00 fits under the ceiling of Savings A, €150.00 does not."
  - "Where does the surplus go?" offers one chip per other account and "Keep it in Current" (the surplus is not moved). The overflow account of the receiving account is chosen first when there is one.
  - Cancel (secondary) closes the step and returns the focus to the save button. The confirming button says what will happen: "Move €50.00 to Savings A, the rest to Savings B", or "Move only €50.00 to Savings A".
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

## 11. Charts

### Rules for every chart

- Real data is drawn flat and sharp, never on the blur.
- Every chart has an equivalent data table with the same rows (DOMAIN).
- Series are told apart by tone and by a direct label, never by colour alone. Real and planned values are told apart by the line style (solid and dashed) and by a zone.
- Axes and grid are recessive: hairlines in `divider`, 12 px muted text. The zero line uses `border-control`.
- The vertical axis of a balance always includes zero.
- Charts are drawn at the element's real pixel width (`useElementWidth`), not by scaling a viewBox, so text stays 12 px and phones never scroll sideways.
- Hand-written SVG with `d3-scale` and `d3-shape` only (ADR-012).

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

## 17. Open points

These need action before the related work lands in `src/` (details in DECISIONS.md, "Open questions for the owner"):

- **Roadmap:** record in `docs/ROADMAP.md` that the dark theme and the phone navigation are decided, when the work lands.
- **Motion on the references:** `components.html` shows the CSS part of section 6 (states, popovers, dialog, disclosure, step editor, flow steps, progress bar, toast in and out). The trajectory line drawing and the page entrance are specified but not drawn: `brand-board.html` would need its bundle rebuilt. They are checked in the app when the chart and the layout land.
- **Values to confirm:** the motion tokens are proposed by role, since the references are still images. The owner confirms them on `components.html` (DECISIONS.md, "Motion").
- **Phone navigation, other pages:** with four tabs, the phone has no way yet to reach Balances, Categories, Rules, Currencies and Backup. Decide where they live (section 6).
- **Sidebar icons to confirm:** Balances, Categories, Rules, Currencies, Backup and Security need a Phosphor icon in section 7. Proposed: `Scales`, `Tag`, `Funnel`, `CurrencyEur`, `Archive`, `ShieldCheck`.
- **Icons of the other reference pages:** `brand-board.html` and `form-proposals.html` still carry the hand-drawn icons, and `--icon-stroke` stays in `tokens.css` for them. `form-proposals.html` is a record of the proposals; the board is redrawn when its bundle is rebuilt.
- **Phosphor at 20 px:** its Regular stroke is 1.25 px at that size (1.5 px at 24 px). The owner judges it on `components.html`; drawing icons at 24 px would change the layouts.
