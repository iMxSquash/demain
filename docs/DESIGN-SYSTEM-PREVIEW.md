# Design system preview

Status: exploration, not adopted. This document records what the `design-system-preview/` page is, the decisions taken while building it, what was verified, what conflicts with the existing documents, and what has to be decided before any of it reaches `src/`.

The page is a style demonstration. It is not the future interface of Demain: the screens, figures and names in it are staged. What carries over to the app is the token set and the base components, once the open decisions below are settled.

## Contents

- [Where things are](#where-things-are)
- [How to view it](#how-to-view-it)
- [Direction and history](#direction-and-history)
- [Inspiration](#inspiration)
- [Tokens](#tokens)
- [Typography](#typography)
- [Palette: reused and proposed](#palette-reused-and-proposed)
- [Product rules carried into the visuals](#product-rules-carried-into-the-visuals)
- [Components](#components)
- [Icons](#icons)
- [Accessibility](#accessibility)
- [Verification](#verification)
- [Known limits](#known-limits)
- [Conflicts with existing documents](#conflicts-with-existing-documents)
- [Decisions to take before using it in the app](#decisions-to-take-before-using-it-in-the-app)
- [Suggested path to the app](#suggested-path-to-the-app)
- [Design hook suppressions](#design-hook-suppressions)
- [Repository state](#repository-state)

## Where things are

| Path | Content |
| --- | --- |
| `design-system-preview/index.html` | The page: hero, desktop dashboard, then one section per component family. French copy, `lang="fr"`, `noindex`. |
| `design-system-preview/styles.css` | All styles. Every value lives once in `:root`; components only read tokens. |
| `design-system-preview/assets/` | `demain-horizontal.svg` and `demain-horizontal-reversed.svg`, copied from `brand/logo/`. |
| `design-system-preview/inspiration/` | The three reference screenshots supplied by the owner (see [Inspiration](#inspiration)). |
| `brand/` | The existing brand identity (logo masters, colours, guidelines). Read, not modified by this work. |
| `.impeccable/config.json` | Design hook configuration created while working (see [Design hook suppressions](#design-hook-suppressions)). |

No JavaScript, no framework, no build step, no npm dependency. Icons are inline SVG symbols copied from Phosphor Icons (see Icons). There are no emoji. All data is fictional.

## How to view it

The page is static. The T3 Code integrated browser refuses `file://` URLs, so serve the folder on the loopback interface:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 -d design-system-preview
```

Then open `http://127.0.0.1:4173/index.html`. Stop the server with `pkill -f "http.server 4173"`. If a stylesheet change does not show, force a reload (Cmd+Shift+R) or add a query string such as `?v=3`: the browser caches the CSS.

## Direction and history

1. **First brief.** One demo page of a premium fintech design system in a Revolut spirit: sober, minimalist, large headlines with negative letter-spacing, deep black and white, pill buttons, rounded cards (12 to 20 px), generous spacing, an app mockup as the central element, discreet gradients. The brief set an accent of `#494fdf` unless the existing palette contradicted it, and excluded glassmorphism, glow and heavy shadows. Desktop (1440 px) and mobile (375 px) views were required, with a fixed list of components and no others.
2. **First build.** Light theme on the brand Paper background, Night hero with a phone mockup, General Sans for headings and Manrope for text.
3. **"Something more professional, like these."** The owner supplied three dark fintech references. The whole page moved to a dark theme with a dense desktop dashboard.
4. **"Glow, vivid colours that single out one element, bento, glassmorphism, a real personality."** The current direction: dark glass cards, a bento dashboard, two flat vivid tiles, coloured glow on a few precise elements. This explicitly supersedes the "no glassmorphism, no glow" constraint of the first brief.
5. **Micro adjustments by annotation.** A square artefact inside the filter chips was fixed (see [Known limits](#known-limits) for the cause), and every glow was centred on its element instead of dropping below it.

The owner considers the current state a good base ("on tient quelque chose"). Finer details are expected to be revisited when the real app is built.

## Inspiration

Kept in `design-system-preview/inspiration/`:

| File | What it shows | What was taken |
| --- | --- | --- |
| `01-dashboard-lime-dots.png` | Dark dashboard, lime accent, dense KPI row, tick-mark category bars, dotted chart, pill filters. | The dense dashboard structure, category bars, pill controls, a single vivid element drawing the eye. |
| `02-dashboard-blue-glass.png` | Dark blue dashboard with translucent cards, glowing area charts, vivid blue primary button, an insight card with a gradient. | Glass cards, glowing chart lines and areas, the vivid primary action. |
| `03-mobile-onboarding-gradients.png` | Four phone screens with vivid striped gradient headers over black, large white headings. | The gradient header of the phone mockup, large bold headlines. |

What was deliberately not taken: the lime green and the electric blue as brand colours (the accent stays Dawn, see below), the multi-colour category rainbow, and photographic avatars.

## Tokens

All tokens are defined once in the `:root` block of `styles.css`. The `.theme-night` class (set on `<body>`) remaps the semantic roles for the dark theme; components never read raw colours.

### Colour roles

| Role | Dark theme value |
| --- | --- |
| `--surface-page` | Night deep `#0B0C18` |
| `--surface-raised` | Night raised `#232650` at 55% over Night deep |
| `--surface-sunken` | Night raised at 80% over Night deep |
| `--text` | Paper `#F7F4EE` |
| `--text-muted` | `#A9ACC4` |
| `--border` | Paper at 10% |
| `--border-strong` | Paper at 38% |
| `--accent` | Dawn `#DB6430` |
| `--accent-text` | `#F08A5A` (readable on dark) |
| `--accent-tint` | Dawn at 18% over Night deep |
| `--success` / `--success-tint` | `#5FD38D` / 14% tint |
| `--error` / `--error-tint` | `#FF8497` / 14% tint |
| `--focus` | Paper |

The light-theme values (Paper page, white raised, Night text, `#17653E` success, `#A31F35` error, focus `#1D4ED8` from `src/app/globals.css`) are still in `:root`, but the light theme is no longer applied anywhere on the page.

### Glass and glow

| Token | Purpose |
| --- | --- |
| `--glass-fill` | 150 degree gradient from Paper 9% to Paper 2%, the translucent card surface. |
| `--glass-border` | Paper at 14%. |
| `--glass-blur` | `blur(20px) saturate(140%)`. |
| `--glass-edge` | Inset 1 px top highlight. |
| `--glow-dawn`, `--glow-indigo` | Centred coloured glow: `0 0 36px -2px` in Dawn at 55% or indigo at 60%. |
| `--gradient-vivid-dawn` | 140 degrees: `#FF8A50`, `#DB6430` at 45%, `#FF5A7A`. |
| `--gradient-vivid-indigo` | 140 degrees: `#8E92FF`, `#494FDF` at 55%, `#2A2FA8`. |
| `--gradient-night`, `--gradient-bank-card` | Quiet Night gradients with a faint Dawn light. |

### Radii, spacing, elevation, motion

| Group | Values |
| --- | --- |
| Radii | `--radius-md` 12 px, `--radius-lg` 16 px, `--radius-xl` 20 px, `--radius-device` 40 px, `--radius-pill` 999 px |
| Spacing (4 px base) | `--space-1` 4, `-2` 8, `-3` 12, `-4` 16, `-5` 24, `-6` 32, `-7` 48, `-8` 64, `-9` 96, `-10` 128 px |
| Layout | `--container-max` 1280 px; `--gutter` 16 px, 32 px from 768 px, 40 px from 1200 px |
| Controls | `--target-min` 44 px, `--control-height` 52 px, `--field-height` 56 px |
| Elevation | `--shadow-sm`, `--shadow-md`, `--shadow-device`: soft, offset, never heavy |
| Motion | `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`, `--duration-fast` 150 ms, `-base` 260 ms, `-slow` 800 ms |

### Type tokens

| Token | Value |
| --- | --- |
| `--text-display` | `clamp(2.75rem, 1.2rem + 6vw, 6rem)` |
| `--text-title-1` | `clamp(2.25rem, 1.4rem + 3.4vw, 4rem)` |
| `--text-title-2` | `clamp(1.75rem, 1.3rem + 1.8vw, 2.5rem)` |
| `--text-title-3` | 1.5 rem |
| `--text-body-lg`, `--text-body`, `--text-small`, `--text-caption` | 1.25, 1, 0.875, 0.75 rem |
| Leading | display 0.98, titles 1.08, body 1.55 |
| Tracking | display -0.04 em, titles -0.03 em, snug -0.015 em |
| Weights | 400, 500, 600, 700 |

## Typography

- **Headings and large amounts:** General Sans, weights 600 and 700, tight tracking (-0.03 to -0.04 em). It was chosen as a free, Aeonik-like sans-serif, distinct from the families the brief excluded (Inter, Space Grotesk, Poppins, DM Sans, Plus Jakarta Sans, Bricolage Grotesque).
- **Body, labels and tabular amounts:** Manrope, weights 400, 600 and 700.
- **Pairing note:** General Sans has no tabular figures, Manrope does. Amounts in lists and tables therefore use Manrope with `font-variant-numeric: tabular-nums`, and General Sans is kept for large standalone figures.
- **Not recorded:** the three heading-font candidates and their one-line justifications were presented in the working session, but are not preserved in the repository. Do not treat General Sans as the outcome of a documented comparison.
- **Loading:** the preview loads Manrope from Google Fonts and General Sans from Fontshare, which are outbound calls. See [Conflicts with existing documents](#conflicts-with-existing-documents).

## Palette: reused and proposed

Reused from `brand/README.md` and `brand/directions/`:

| Name | Value | Use in the preview |
| --- | --- | --- |
| Night | `#1C1E3A` | Base of the dark surfaces |
| Dawn | `#DB6430` | The accent, planned items, the primary action |
| Paper | `#F7F4EE` | Text on dark, and the page background of the (unused) light theme |
| Dawn deep | `#B3501F` | Light theme accent text |
| Slate | `#5A5F78` | Light theme muted text |
| Tints | `#0B0C18`, `#232650`, `#A9ACC4`, `#E4E1DA`, `#ECEDF5`, `#FBE3D6` | Surfaces and muted text |

Proposed extensions, not part of the brand palette and needing the owner's validation:

| Name | Value | Why it exists |
| --- | --- | --- |
| Indigo | `#494FDF` | The accent from the first brief, used as the second vivid colour |
| Indigo bright | `#8E92FF` | Light end of the indigo gradient, chart area, category bar |
| Dawn bright | `#FF8A50` | Light end of the Dawn gradient, glow line |
| Ember | `#FF5A7A` | End of the Dawn gradient |
| White | `#FFFFFF` | Light theme raised surface |
| Border strong | `#767A91` | Light theme control borders at 3:1 |
| Success | `#17653E` (light), `#5FD38D` (dark) | The brand palette defines no success colour |
| Error | `#A31F35` (light), `#FF8497` (dark) | The brand palette defines no error colour |

Where the brief's `#494FDF` and the existing palette disagreed, the existing palette won: Dawn is the brand accent and indigo is secondary.

## Product rules carried into the visuals

- **Real is a solid line, planned is a dotted line.** This is the rule behind the logo (ADR-011) and it is applied to the chart, the legend, the "Prévu" badges, the planned transaction avatar and the planned tile (dotted border).
- **Dawn means planned.** It is never used for a gain or a loss. Gains use the success colour, losses use the error colour, and neither is conveyed by colour alone (icon and sign accompany it).
- **Negative amounts carry a sign.** They are written with a minus, not only coloured.

## Components

The brief listed these components and no others. All are present:

| Component | Where | Notes |
| --- | --- | --- |
| Type scale | `#typographie` | Display, titles 1 to 3, body, small, caption specimens. |
| Palette tokens | `#couleurs` | Swatches grouped by role: surface, text, accent, success, error. |
| Pill buttons | `#boutons` | Primary (Dawn gradient, glow), secondary (glass), ghost, disabled, loading (`aria-busy`, spinner). |
| Rounded cards | `#cartes` | Glass card, planned card (dotted), inverse card, meter. |
| Bank card | `#cartes` | Fictional card ending 4821, Night gradient with a faint Dawn light. |
| Balance and chart | `#solde` | SVG chart, solid real line and dotted planned line, "today" marker, legend, hidden data table. |
| Transaction list | `#solde`, hero, dashboard | Avatars with icons, tabular amounts, a planned row. |
| Form field | `#formulaire` | Default, focus, error (`aria-invalid`, `aria-describedby`, text and icon). |
| Badges and chips | `#badges` | Real, planned, success, error badges; pressable chips (`aria-pressed`). |
| Mobile navigation bar | `#navigation` and phone mockup | Four destinations, current page marked. |
| App screen mockups | hero (phone) and `#bureau` (desktop bento) | Staged, inert, hidden from assistive technology. |

The desktop view is a 12-column bento on 900 px and wider (balance tile, chart, budget, savings, next planned item, transactions table) and a single column below.

## Icons

Chosen pack: [Phosphor Icons](https://phosphoricons.com) (MIT, copyright Phosphor Icons). Lucide was rejected because its default use (2 px stroke, an icon in a rounded square above every card) is the most recognisable generic look.

- **Integration**: 18 symbols copied by hand into the inline sprite of `index.html`, so there is no npm dependency and no outbound call at runtime. The MIT notice must be kept if the files are reused in the app.
- **Weights**: regular for 24 px icons (navigation, avatars, card symbol), bold for 16 px icons (badges, chips, errors) so they stay legible, duotone for the active navigation item (home). Wallet, trend and user duotone symbols are in the sprite but not used yet.
- **Fill based**: Phosphor icons are filled paths, so `.icon` uses `fill: currentColor` and no stroke.
- **Not done yet**: hand-drawn icons for the real versus planned idea, an icon section on the page, duotone glow on the vivid tiles, a pass over every icon in the dark and mobile views.
- **Not verified visually**: the screenshot tool timed out after the swap. Only computed styles were checked (fill applied, no stroke).

## Accessibility

Target is WCAG 2.2 AA, as in `docs/ARCHITECTURE.md`.

Done in the page:

- Skip link, landmarks, a single `h1`, no heading level skipped.
- Visible focus on every interactive element (`:focus-visible`), no `outline: none` without replacement.
- Touch targets of at least 44 px.
- `prefers-reduced-motion` handled (animations and transitions disabled).
- The chart is exposed with `role="img"`, a text summary and a hidden data table; planned data is a dotted line, not only a colour.
- Form errors are text with an icon, linked to the field.
- Mockups are `aria-hidden` and `inert`, with a screen-reader description beside them.
- `<html lang="fr">`.

Measured and not measured:

- Contrast of the main dark-theme pairs was computed by hand against approximated surface colours: muted text 6.9 to 7.7:1, accent text 6.5:1, success 8.5:1, error 7.3:1, initial on the Dawn avatar 5.4:1.
- Not measured: text on the two vivid tiles (dark text on the Dawn gradient, light text on the indigo gradient) and text over glass cards on top of the ambient light blobs. These were judged by eye only.
- No axe run, no keyboard walkthrough and no Lighthouse audit has been done on this page.

## Verification

Done through the T3 Code integrated browser tools (`preview_*`), with the folder served on loopback:

- 1440 px and 375 px: no horizontal scroll (`scrollWidth` equal to the viewport width), no element overflowing the viewport.
- Screenshots were captured for the hero, the desktop dashboard, the buttons section, the chart section and the mobile dashboard. They are in the T3 browser artifacts folder, not in the repository.
- Computed styles checked after the chip fix (`background-origin` is `border-box`, glow centred).

Not verified:

- The browser console was never read, so console errors are unknown.
- Sections that only changed through the dark theme remap (palette, cards, form, badges, navigation) were not re-captured in the final state.
- Keyboard behaviour, screen reader output and `prefers-reduced-motion` were not tested at runtime.
- The tab was reported as not visible by the tool throughout, which at first made screenshots time out. They worked later without a documented cause.

## Known limits

- **Gradient under a transparent border.** A gradient background with a transparent border paints into the border box and tiles, which showed as a square artefact in the chips. Fixed with `background-origin: border-box` on chips, buttons, glass cards and vivid tiles. Any new component combining a gradient and a border needs the same rule.
- **Browser cache.** The static server sends no cache headers, so a changed stylesheet may not show until a forced reload.
- **Glass depends on backdrop-filter.** Browsers without it show a flatter translucent card. No fallback was designed or tested.
- **Glass and glow cost.** Many blurred layers on one page can be heavy on low-end devices. Not measured.
- **Fonts are not self-hosted.** See below.
- **Hero seam.** The hero ends with a gradient into the page background. The blend was adjusted once and not re-checked on every width.
- **Dashboard figures are staged.** They do not follow the domain rules: they are fixed text, not computed values, and the budget percentages are decorative.

## Conflicts with existing documents

These must be resolved before any code reaches `src/`. The repository documents win; the conflicts are reported here rather than silently overridden.

1. **Fonts and "nothing leaves the server".** `brand/README.md` sets the interface font to the system stack, weights 400 and 600, "No font file to download, nothing leaves the server". The preview loads two web fonts from third-party hosts. `docs/ARCHITECTURE.md` states that with default settings the app makes no outbound network call. Using General Sans and Manrope in the app would require self-hosting the files (after checking that each licence allows it) and changing the brand typography rule, or dropping them in favour of the system stack.
2. **Dark theme is an open question.** `docs/ROADMAP.md` lists "Dark theme and phone layout details" as undecided, to be resolved at M2. The preview adopts a dark-only theme. That is a proposal, not a decision, and should not be implemented as if it were.
3. **Palette.** The brand palette has no indigo, no success and no error colour. The extensions in this document are proposals only.
4. **Charts.** `docs/ARCHITECTURE.md` already records a charting decision (hand-written SVG, no chart library, data table for every chart, planned values drawn differently without colour). The preview chart follows the same principles, but it is a static mock, not an implementation of that ADR.
5. **Decorative effects versus accessibility.** The target is WCAG 2.2 AA. Glass over coloured light and text on gradient tiles must be measured on real content before adoption.

## Decisions to take before using it in the app

| Decision | Options | Note |
| --- | --- | --- |
| Keep a dark-only theme, a light-only theme, or both | Dark only, both with a switch, follow the system | Roadmap marks it as M2. The preview only proves the dark one. |
| Palette extensions | Accept indigo and the vivid variants, accept only success and error, reject all | Needed for any chart with several series. |
| Accent for the brand | Keep Dawn, or move to a different vivid colour | The preview keeps Dawn; the references use lime and blue. |
| Fonts | System stack as in the brand file, or self-hosted General Sans and Manrope | Licences to check; affects the "nothing leaves the server" rule. |
| Glass and glow | Everywhere, on a few hero screens only, or not in the app | Depends on contrast measurements and performance. |
| Where the preview lives | Stay ignored, move to a branch, or become a documented asset | Currently ignored by git. |
| The three inspiration images | Keep in the repository or keep locally only | About 3 MB. They are third-party screenshots; their licence status is unknown, which matters if the repository becomes public. |

## Suggested path to the app

1. Resolve the decisions above and record the outcome in `docs/ARCHITECTURE.md` as an ADR, with the alternatives rejected.
2. Find the roadmap item that covers the interface. This was not checked in detail: only the open question above was read.
3. On a `type/short-description` branch, move the confirmed tokens into `src/app/globals.css` (or the project's existing styling approach, to be read first), then rebuild the components one by one with real data and the existing locale-aware formatting.
4. Add the accessibility checks required by the roadmap (axe, keyboard walkthrough) on the real screens.
5. Ask before adding any dependency (fonts packaging included) and before touching existing files.

## Design hook suppressions

The design hook (impeccable) reports heuristics. Four findings were triaged and the following were suppressed for `design-system-preview/index.html` only. They are stored in `.impeccable/config.json` with their reasons.

| Rule | Reason |
| --- | --- |
| `cream-palette` | Paper `#F7F4EE` is the existing brand background; the first brief said the existing palette takes precedence. |
| `tight-leading` | Display and title headings use 0.98 to 1.08 leading by design (large, short, tight-tracked); body text is 1.55. |
| `dark-glow` | Coloured glow is the requested direction, shown in the owner's references. The glows use a large negative spread and are defined once as `--glow-*` tokens. |

Two other findings were reported and left unanswered at the time of writing: `low-contrast` (no failing pair found in the pairs that were computed, but the hook does not name the element) and `nested-cards` (the mockups contain cards inside an app window, which is the intended depiction, not nested cards in the design system). Decide whether to suppress or address them.

Suppressing a rule does not mean the underlying concern is resolved for the real app: the glow and contrast questions come back when the style is applied to production screens.

## Repository state

At the time of writing, none of this work is committed. `brand/`, `design-system-preview/` and `.impeccable/` are untracked and are listed in `.gitignore` for now, so they do not appear in `git status`. Remove those entries from `.gitignore` when the folders should be tracked.
