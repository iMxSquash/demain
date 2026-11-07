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
- [Landing page](#landing-page)
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
| `design-system-preview/landing.html` | A landing page test in the current direction (see [Landing page](#landing-page)). French copy, `noindex`. |
| `design-system-preview/styles.css` | All styles. Every value lives once in `:root`; components only read tokens. The landing styles are the last section, with `lp-` classes. |
| `design-system-preview/assets/` | `demain-horizontal.svg` and `demain-horizontal-reversed.svg`, copied from `brand/logo/`, and `demain-icon.svg` (the favicon), copied from `brand/web/icon.svg`. |
| `design-system-preview/inspiration/` | The three reference screenshots supplied by the owner (see [Inspiration](#inspiration)). Kept locally, not committed. |
| `brand/` | The existing brand identity (logo masters, colours, guidelines). Read, not modified by this work. Local only: not tracked in git yet, so its links in this document only resolve in the owner's working copy. |
| `.impeccable/config.json` | Design hook configuration created while working (see [Design hook suppressions](#design-hook-suppressions)). Local only, not committed. |

No framework, no build step, no npm dependency, no request to another host. `index.html` has no JavaScript; `landing.html` has two inline scripts: one line in the head that marks JavaScript as available, and a 20-line `IntersectionObserver` at the end that starts the explanatory animations. Icons in `index.html` are inline SVG symbols copied from Phosphor Icons (see Icons); the landing uses none. There are no emoji. All data is fictional.

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

6. **Landing page, then "it still looks generated".** A first landing test (glow orbs, gradient headline, identical feature tiles) was judged generic. It was rebuilt from scratch toward a Revolut, Mercury or Linear level of polish, with a written contract: every choice traced to a measured extraction of the three references, every element justified, no glow, no gradient text, no filler. The new landing drives a second change to the shared tokens: the system font stack of the brand file, a fluid type and spacing scale, and new dark surface and text ladders (see [Landing page](#landing-page)). `index.html` inherits these tokens but keeps its glass and glow layer for now.

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
| `--surface-raised` | `#10111D` (cards and product frames) |
| `--surface-sunken` | `#161827` (rows and panels inside a frame) |
| `--surface-control` | `#21222E` (secondary buttons, hovered links) |
| `--text` | Paper `#F7F4EE` |
| `--text-muted` | `#BBBDCE` (secondary text) |
| `--text-subtle` | `#8C8C9A` (labels, dates, captions) |
| `--text-on-accent` | Night deep `#0B0C18` (text on a Dawn button) |
| `--border` | Paper at 9% (hairlines, decorative) |
| `--border-strong` | `#6E6E7C` (strokes that carry meaning: empty ticks, chart "today" line, nodes, 3:1 at least) |
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
| Spacing (4 px base, one scale) | `--space-1` 4, `-2` 8, `-3` 12, `-4` 16 px fixed; `-5` 20 to 24, `-6` 24 to 32, `-7` 32 to 48, `-8` 40 to 64, `-9` 56 to 96, `-10` 72 to 128 px, linear between a 360 px and a 1440 px viewport (`clamp()`) |
| Layout | `--container-max` 1280 px; `--gutter` 16 to 40 px, fluid, no breakpoint |
| Controls | `--target-min` 44 px, `--control-height` 52 px, `--field-height` 56 px |
| Elevation | `--shadow-sm` (in the dark theme, a 1 px inset top edge at Paper 5%), `--shadow-md`, `--shadow-device`, `--edge-accent` (1 px inset top edge at Paper 32%, for the accent button) |
| Motion | One curve, `--ease-out` `cubic-bezier(0.16, 1, 0.3, 1)`; one duration scale, `--duration-fast` 150 ms, `-base` 260 ms, `-slow` 800 ms |

### Type tokens

All sizes grow linearly between a 360 px and a 1440 px viewport.

| Token | 360 px to 1440 px |
| --- | --- |
| `--text-display` | 40 to 84 px |
| `--text-title-1` | 32 to 56 px |
| `--text-title-2` | 26 to 40 px |
| `--text-title-3` | 20 to 26 px |
| `--text-body-lg` | 17 to 20 px |
| `--text-body` | 16 to 17 px |
| `--text-small` | 13 to 14 px |
| `--text-caption` | 12 to 13 px |
| Leading | display 1.02, titles 1.1, body 1.55 |
| Tracking | display -0.035 em, titles -0.025 em, snug -0.01 em |
| Weights | 400 and 600 on the landing (the brand file's two weights); 500 and 700 remain for `index.html` |

## Typography

- **Current:** the system font stack of `brand/README.md` (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`) for everything, held by one token, `--font-sans`, that `--font-display` and `--font-body` point to. No font file is downloaded and no request leaves for another host. Headings use 600 with tight tracking, large figures use 400 (as in the references), and every amount uses `font-variant-numeric: tabular-nums`.
- **History:** the preview first loaded General Sans (Fontshare) for headings and Manrope (Google Fonts) for text. Both were removed with the landing redesign, which forbids external font requests; the `<link>` tags were removed from `index.html` as well. The three heading-font candidates of that first session were never recorded.
- **Trade-off:** the system stack renders differently per platform (SF Pro on Apple devices, Segoe UI on Windows, Roboto or another sans on Linux and Android). The page was only seen on macOS.

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
| Night surface, inset, control | `#10111D`, `#161827`, `#21222E` | Dark surface ladder measured on the references (see [Landing page](#landing-page)) |
| Mist 200, 400, 500 | `#BBBDCE`, `#8C8C9A`, `#6E6E7C` | Secondary text, tertiary text and meaningful strokes on dark, measured on reference 02 |

Where the brief's `#494FDF` and the existing palette disagreed, the existing palette won: Dawn is the brand accent and indigo is secondary.

## Product rules carried into the visuals

- **Real is a solid line, planned is a dotted line.** This is the rule behind the logo (ADR-011) and it is applied to the chart, the legend, the "Prévu" badges, the planned transaction avatar and the planned tile (dotted border).
- **Dawn means planned, and marks the primary action.** Both roles come from the brand file. It is never used for a gain or a loss. Gains use the success colour, losses use the error colour, and neither is conveyed by colour alone (icon and sign accompany it).
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

## Landing page

`design-system-preview/landing.html` tests whether the direction holds on a public page of the Revolut, Mercury or Linear kind. It is a test page, not a decision to publish one: Demain is a private, authenticated app with no public site planned. It describes the target product of `docs/PRODUCT.md`, including features that later milestones bring (planned items and versions at M2, simulations at M3); its footer says so.

Order of work, stated plainly: the extraction below was written during the build and committed after the page, together with the justification table, not before it.

The brief was a contract: extract the references in writing first and trace every later choice to that extraction, justify every element, fluid type and spacing, motion only to explain the product, real product UI, and a blacklist (gradient headline text, glow orbs or blurred blobs, three identical icon cards, line-icon feature grids, filler bento tiles, hype copy, fake testimonials or logos, invented metrics).

### Extraction from the references

Colours were measured, not guessed: each image was drawn on a canvas in the browser and sampled (5 x 5 px averages, and the lightest and darkest pixel of text regions).

| Role | 01 lime dots | 02 blue glass | 03 onboarding | Landing value |
| --- | --- | --- | --- | --- |
| Page | `#161616` | `#040316` | `#000000` | `#0B0C18`, the brand Night deep, between the three and in the Night hue |
| Card | `#181818`, one step above the page | `#040416`, same as the page, told apart by a hairline `#10111B` | none | `#10111D`: one step above the page, plus a hairline |
| Inset row | `#1F1F1F`, table head `#313131` | `#10111A` | none | `#161827` |
| Control | `#2D2E30` | `#21222E` | none | `#21222E` (02, exact) |
| Hairline | `#252525` on `#161616` | `#10111B` on `#040316` | none | Paper at 9% |
| Text | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` | Paper `#F7F4EE` (brand) |
| Secondary text | `#B5B5B5` | `#BBBDCE` | `#D7D7D7` | `#BBBDCE` (02, exact) |
| Tertiary text and strokes | none | `#8C8C9A`, `#6E6E7C` | none | `#8C8C9A` for labels, `#6E6E7C` for strokes that carry meaning |
| Accent | lime `#DFFF1E`, on the action buttons and the active filter only | blue `#1F50FE`, on the one primary button | `#3850D8`, `#C020A0`, `#E89808`, one per screen, on the call to action | Dawn `#DB6430` |

- **Accent rule taken from the images:** one saturated colour per screen, on the primary action and one category of data, everything else neutral. **Hue taken from the brand, not from the images:** `brand/README.md` makes Dawn the accent and the colour of planned items; lime and blue are not brand colours. Dawn therefore marks the primary action and planned values, and nothing else. Image 02 uses `#DC5C30`, close to Dawn, for losses: in Demain, Dawn never means a loss.
- **Type:** all three use a neutral grotesque sans. Large figures are set in a regular weight (01 KPI row, 02 portfolio value), headings in a heavy weight (03), and in 01 the figure is about 2.2 times its label. The landing uses the system stack of the brand file, 600 for headings with tight tracking, 400 for figures, tabular figures everywhere, and the fluid scale in [Type tokens](#type-tokens) (body 16 to 17 px, figures 26 to 56 px, display 40 to 84 px).
- **Radii:** 01 has a 24 px outer frame, 16 to 20 px cards, fully round pills and round icon buttons; 02 has cards of about 16 px and buttons of about 6 px; 03 has call-to-action buttons of about 12 px. The landing uses 20 px frames (`--radius-xl`), 16 px scenario panels (`--radius-lg`), a 12 px code panel (`--radius-md`) and pill buttons and tags (as in 01).
- **Elevation:** 01 has no drop shadow, only a one or two step surface change, hairlines and a light top edge on controls; 02 separates same-colour cards with a hairline and keeps translucency for the browser chrome; 03 gives the call to action a light 1 px top edge (its glow was not kept). The landing uses a surface step, a hairline and a 1 px inset top edge, no drop shadow and no glow. The sticky header is opaque and has no blur: a translucent header let the text scrolling under it show through the links, and a backdrop blur is repainted on every scrolled frame.
- **Grid and spacing:** 01 is a dense grid with 16 px gutters, about 20 px card padding and hairline-separated bands; 02 pads its cards more generously. The landing uses one 12-column grid in a 1280 px container, a fluid 16 to 40 px gutter, 24 to 32 px frame padding and hairline-separated sections with 72 to 128 px of vertical space. Copy sits on columns 1 to 4 and product UI on columns 6 to 12, so every frame starts on the same line; below 60rem they stack.
- **Charts and numbers:** 01 draws tick-mark bars (one thin line per unit) and a dot matrix; 02 draws a thin line over an area fading to transparent, without axes, with muted labels underneath; both set currency at full size beside the figure. The landing draws the real balance as a solid Paper line over a fading area (02), planned values as Dawn dots (the brand idea and the 01 dots), the deposit ceiling as tick marks of 25 € each (01), labels below the chart, signs written on every amount and no gain or loss colour.

### Element justification

Each element of the page, what it tells the visitor, and where it comes from. Anything without a line here was removed.

| Element | Purpose | Source |
| --- | --- | --- |
| Sticky header, opaque | Keeps the install action one tap away while reading | 02 browser chrome, without its translucency |
| Reversed horizontal logo | Identity; the D itself is the real and planned rule (solid, then dots) | `brand/` |
| Section links, from 52rem | Jump to the four product ideas; on narrow screens scrolling is the navigation | none |
| "Installer" in the header, accent | The single primary action of the page | Accent rule, 01 to 03 |
| Kicker "Budget personnel, libre et auto-hébergé" | Says what the product is before the promise | `README.md` |
| h1 "Voir demain sans deviner." | The product promise | `PRODUCT.md`, idea 1 |
| Lead paragraph | Replaces the sheet; real and dated planned only; data stays home | `PRODUCT.md`, ideas 1 and 3 |
| "Installer Demain", accent | Same primary action at the end of the promise | Accent rule |
| "Voir le code source", control surface | Open source, a secondary action that must not compete with the accent | 01 dark pills |
| Hero frame "Compte courant, novembre 2026", columns 1 to 12 | Real product UI in place of an illustration; the one frame that spans the whole grid, because it is the proof of the promise | 01 and 02 cards |
| "Solde au 7 nov." | Today's real balance, the anchor of everything after it | 01 KPI, regular weight |
| "Fin du mois, réel et prévu" | What the dated planned items add up to, with no estimate | ADR-011 |
| Daily balance as a step line | A daily balance only moves on a dated movement, so it steps instead of curving | 02 line, ADR-011 |
| Area under the real line only | Recorded ground; the planned part has none | 02 area |
| "Today" line and label | Where real ends and planned starts | none |
| Axis labels "1 nov." and "30 nov." | The time span, muted and below | 02 labels |
| Legend with line samples | Real and planned told by line style and words, not colour alone | Brand rule, WCAG 1.4.1 |
| Visually hidden data table of the chart | The balance after each movement, for screen readers | ADR-012 |
| Hairline between sections | One idea per band | 01 bands |
| Section kicker | Names the product concept and matches the header link | none |
| One h2 per section | The benefit in one sentence | none |
| "Le mois" table | The monthly line view: opening balance, real rows, today's balance, planned rows, end of month; every movement of the chart is listed and the month can be checked by hand (1 862,40 − 64,30 − 12,80 − 720,00 − 8,40 = 1 056,90, then − 11,99 − 18,50 + 1 850,00 − 200,00 = 2 676,41) | `PRODUCT.md`, journeys 1 and 3 |
| "Réel" and "Prévu" with a solid dot or a dotted ring | Status by word and shape | Brand rule |
| Stronger rule above today and the total | Separates the past from the planned and from the result | none |
| "Récurrences" frame: one planned item, two versions, five due dates with a dotted top rule | One entry for every month, a price change as a dated version: the stale template disappears | `PRODUCT.md`, pain points and journey 2 |
| "Nouvelle version" | Where the new price starts | `PRODUCT.md`, journey 2 |
| "Plafonds" frame: three accounts in a chain | A deposit ceiling and its overflow account | `PRODUCT.md`, journey 7; ADR-013 |
| Node rings and dotted connectors | The path the money takes; dotted because the transfer is planned | Brand rule |
| 64-tick meter, 25 € per tick, two dotted Dawn ticks | Makes 1 550 out of 1 600 countable and shows the exact 50 € of room | 01 tick bars |
| Livret A "+150,00 €" and before and after balances | Where the surplus lands | `PRODUCT.md`, journey 7 |
| "Simulations" frame, "24 mois à rythme constant", with the "Simulation, dépenses estimées" tag | The only place with estimation says so, and names the constant-pace simulation it builds on | ADR-011, journey 4 |
| Three scenario panels: total cost, lowest balance and its date, final balance | The indicators the product names for a comparison | `PRODUCT.md`, journey 4; 02 three-column layout |
| "L'annuel coûte moins cher…" note | The trade-off of journey 4, in words | `PRODUCT.md`, journey 4 |
| "Installer" copy and facts list | Self-hosting facts | `README.md` |
| Terminal frame with four steps | The real install procedure, shortened | `README.md`, Installation |
| "Lire le guide d'installation" | The next step after reading | none |
| Footer | Licence; planned items, recurrences and simulations are not built yet; figures and names are fictional | `LICENSE`, `docs/ROADMAP.md` |
| Favicon | Identifies the tab | `brand/web/icon.svg` |

| Motion | Purpose | Values |
| --- | --- | --- |
| Real line revealed up to today, then the planned line | Real is recorded first; planned follows on dated items only | `clip-path`, 800 ms each, planned delayed by 800 ms |
| Flow leaves the checking account, the planned ticks fill the ceiling, the flow continues, then "+150,00 €" appears | How an overflow chain fills | `transform` and `opacity`, 260 ms steps |
| Colour change on hover | Interaction feedback | 150 ms |

All motion uses `--ease-out`, starts once its frame is 40% visible (the inline `IntersectionObserver`), and lives inside `@media (prefers-reduced-motion: no-preference)`. Without JavaScript or with reduced motion, the final state is shown.

Deliberately absent: glow, gradient text, ambient blobs, glass cards, vivid tiles, icons (the product UI carries the meaning), testimonials, logos, user counts.

### Copy and figures

- French, plain, sentences drawn from `PRODUCT.md` and `README.md`. No em dash.
- Every figure is synthetic and consistent with the others, computed in cents: opening balance 1 862,40 €, real movements on 2, 4, 5 and 6 November down to 1 056,90 € on 7 November, planned 12, 20, 27 and 28 November, 2 676,41 € at the end of the month. The checking table, the chart, the 28 November transfer of the chain (50 € to the Livret Jeune at 1 550 €, 150 € to the Livret A) and the 11,99 € subscription of the simulation all describe the same month.
- Simulation figures: 24 months from November 2026, 11,99 € each month (287,76 €), or 119,90 € each 1 March (239,80 €), or none; lowest balance on 5 March 2027 at 376,33 €, 304,39 € and 424,29 €. Only this frame contains estimation, and it is tagged.
- The GitHub links point to `https://github.com/iMxSquash/demain`, which only works for others once the repository is public.

### Verification of the landing

Observed in the T3 Code integrated browser (Chromium, macOS, device pixel ratio 2), page served on loopback:

- 360, 375, 768 and 1440 px: `scrollWidth` equal to the viewport width and no visible element outside it. A regression was caught this way: a visually hidden `<table>` keeps its content width (tables ignore `overflow: hidden`) and pushed `scrollWidth` to 865 px at 768; the `sr-only` class now sits on a wrapping `div`.
- Contrast of every visible text node against its composited background: 159 texts at 1440 px, 155 at 768, 375 and 360 px, none below its threshold, lowest 5.25:1 (the "Prévu" caption). UI strokes that carry meaning: `#6E6E7C` 3.74:1 on a frame, Dawn 5.25:1, Paper 17:1.
- Keyboard: real Tab presses go skip link, logo, "Installer", "Installer Demain", "Voir le code source", "Lire le guide d'installation", "Code source sur GitHub"; each shows a 2 px Paper outline, and none ends under the sticky header.
- Every visible link is at least 44 px high.
- One `h1`, no skipped heading level, `lang="fr"`.
- No request to another host; no coloured or blurred shadow (only 1 px neutral inset edges).
- Motion sampled over time: the real line, then the planned line; flow, ticks, flow, amount, in that order.
- Reduced motion: the tools cannot emulate the media feature, so the cascade was simulated by removing the `no-preference` block from the CSSOM. The final state showed, landing transitions fell to 0 s, and the existing `reduce` block switches off the base button transition.
- Console: the page was reproduced in a same-origin iframe with an error recorder injected first. No JavaScript error, no failed resource, no `console.error` or `console.warn`.
- Single theme: the landing is dark only (`color-scheme: dark`), so there is no light mode to check.

Not verified: other browsers and platforms (the system font and `mask` support differ), a real screen reader, 200% zoom, a real reduced-motion setting, and Lighthouse or axe (not available without installing a tool). The chart is not explorable with the keyboard; the hidden data table is its only equivalent.

Design hook on the landing: the rendered scan (`impeccable detect` on the served page) reports no anti-pattern. It keeps one advisory, "repeating-gradient stripes", which points at the ceiling ticks and the dotted connectors: they encode data (25 € per tick, planned flow), so they stay. `cramped-padding` was suppressed for `landing.html`: only the static scan raises it, on the three scenario panels, whose padding is a `clamp()` it cannot resolve.

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
- **Fonts.** Resolved by moving to the system stack; the rendering now depends on the visitor's platform.
- **Legacy layer in `index.html`.** The glass and glow rules, the `--glow-*`, `--glass-*` and vivid gradient tokens, and the indigo extension are still in `styles.css` because `index.html` uses them. The landing direction does not; they should go when `index.html` is brought in line.
- **Hero seam.** The hero ends with a gradient into the page background. The blend was adjusted once and not re-checked on every width.
- **Dashboard figures are staged.** They do not follow the domain rules: they are fixed text, not computed values, and the budget percentages are decorative.

## Conflicts with existing documents

These must be resolved before any code reaches `src/`. The repository documents win; the conflicts are reported here rather than silently overridden.

1. **Fonts and "nothing leaves the server".** Resolved in the preview: both pages now use the system stack and weights 400 and 600 of `brand/README.md`, and make no request to another host. Before that, the preview loaded General Sans and Manrope from third-party hosts, against the brand rule and the "no outbound call by default" invariant.
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
| Fonts | System stack as in the brand file (current), or self-hosted files | The landing proves the system stack can look premium on macOS; other platforms were not seen. |
| Glass and glow | Not in the app (the landing direction), on a few screens only, or everywhere (the `index.html` direction) | The landing drops both; `index.html` still shows them. |
| Where the preview lives | Stay on a branch, become a documented asset on `main`, or be dropped | Tracked on the `feat/landing-fintech-redesign` branch; the local `.gitignore` entries are not committed. |
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

For `design-system-preview/landing.html`, `dark-glow` was also suppressed: the browser check found no coloured or blurred shadow on that page (only 1 px neutral inset edges), and the finding came from the legacy `--glow-*` rules that `styles.css` keeps for `index.html`.

Suppressing a rule does not mean the underlying concern is resolved for the real app: the glow and contrast questions come back when the style is applied to production screens.

## Repository state

The preview (`index.html`, `landing.html`, `styles.css`, `assets/`) and this document are committed on the `feat/landing-fintech-redesign` branch. Not committed: the inspiration screenshots (third-party, licence unknown), `brand/` and `.impeccable/`. The local `.gitignore` still lists `brand/`, `design-system-preview/` and `.impeccable/`; that change is not committed, and files of an ignored folder that are already tracked stay tracked.
