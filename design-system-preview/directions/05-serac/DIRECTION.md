# Direction 05, Serac

Status: Exploration. New brand, glacial mint and cyan on cold black, serif figures. Part of the five directions compared in [../index.html](../index.html) and listed in [docs/DESIGN-SYSTEM-PREVIEW.md](../../../docs/DESIGN-SYSTEM-PREVIEW.md#five-directions). Every figure, name and amount on the page is fictional.

| File | Content |
| --- | --- |
| `tokens.css` | Layer 1 primitives, 2 semantic roles, 3 component tokens, 4 glow recipe, 5 motion, 6 a few signature rules |
| `index.html` | The comparison page: hero with balance and bank card, chart with its data table, transactions, form with states, buttons and badges, mobile onboarding frame |
| `../shared/base.css` | Component anatomy shared by the five directions; it reads tokens only |
| `../shared/preview.js` | Chart rendering, toggles, filter, form demo and entrance motion, reading the motion tokens |
| `wordmark.svg` | The wordmark, outlines and strokes only, no live text |

## Brand

- **Name**: Serac, a block of glacier ice: cold, clear, durable. Coined for this exploration; trademark availability not checked.
- **Wordmark**: `wordmark.svg`, an isometric ice block with mint, cyan and frost faces, then "serac" in a fine monoline (4.5 unit strokes).
- **Editorial tone**: precise, quiet, long-term, like a ledger. "La précision, sur la durée." "Net. Précis. Durable."

## Palette

| Name | Value | Role |
| --- | --- | --- |
| Frost 950 | `#06090B` | Page |
| Frost 900 | `#0C1114` | Cards |
| Frost 850 | `#121A1E` | Fields |
| Frost 800 | `#1B252A` | Controls |
| Glacier 100 | `#ECF5F4` | Text |
| Glacier 300 | `#A7B8B6` | Secondary text |
| Glacier 500 | `#7E908E` | Labels, dates |
| Glacier 600 | `#62736F` | Meaningful strokes |
| Mint 300 | `#78F0C8` | Accent: primary action, real line, glow, focus of fields |
| Cyan 400 | `#3FC6EE` | Secondary: planned values |
| Ice 100 | `#CFEFF6` | Tertiary, focus ring, icons |
| Moss 300 | `#B4E36A` | Success |
| Sand 300 | `#F2C46B` | Warning |
| Salmon 300 | `#FF8A8F` | Error |

Mint is the accent, so success is a yellower moss (about 85 degrees apart) and always carries a sign and an arrow. The brief's "chiffres en serif" is applied to every amount, axis label and the balance.

### Gradients

- Primary button: flat mint, a white top edge.
- Hero card: a 7 % mint wash from the top.
- Bank card: frost 700 to 950 with a 20 % cyan light and two thin mint and cyan facet lines.
- Onboarding header: ice, mint, cyan, cold black, with stripes.

### Contrast on solid backgrounds

Computed from the token values with the WCAG 2.2 formula. Glow is excluded from every calculation.

| Pair | Foreground | Background | Ratio | Required | Result |
| --- | --- | --- | --- | --- | --- |
| Text on page | `#ECF5F4` | `#06090B` | 18.00:1 | 4.5:1 | Pass |
| Text on surface | `#ECF5F4` | `#0C1114` | 17.12:1 | 4.5:1 | Pass |
| Muted text on surface | `#A7B8B6` | `#0C1114` | 9.20:1 | 4.5:1 | Pass |
| Muted text on inset | `#A7B8B6` | `#121A1E` | 8.53:1 | 4.5:1 | Pass |
| Subtle text on page | `#7E908E` | `#06090B` | 5.96:1 | 4.5:1 | Pass |
| Subtle text on surface | `#7E908E` | `#0C1114` | 5.67:1 | 4.5:1 | Pass |
| Accent text on surface | `#78F0C8` | `#0C1114` | 13.65:1 | 4.5:1 | Pass |
| Label on primary button | `#04120D` | `#78F0C8` | 13.76:1 | 4.5:1 | Pass |
| Accent on page (UI, 3:1) | `#78F0C8` | `#06090B` | 14.36:1 | 3:1 | Pass |
| Secondary on surface (data, 3:1) | `#3FC6EE` | `#0C1114` | 9.52:1 | 3:1 | Pass |
| Tertiary on surface (data, 3:1) | `#CFEFF6` | `#0C1114` | 15.67:1 | 3:1 | Pass |
| Stroke on surface (UI, 3:1) | `#62736F` | `#0C1114` | 3.80:1 | 3:1 | Pass |
| Success on surface | `#B4E36A` | `#0C1114` | 12.78:1 | 4.5:1 | Pass |
| Warning on surface | `#F2C46B` | `#0C1114` | 11.65:1 | 4.5:1 | Pass |
| Error on surface | `#FF8A8F` | `#0C1114` | 8.39:1 | 4.5:1 | Pass |
| Focus ring on page (3:1) | `#CFEFF6` | `#06090B` | 16.48:1 | 3:1 | Pass |
| Focus ring on control (3:1) | `#CFEFF6` | `#1B252A` | 12.89:1 | 3:1 | Pass |

### Contrast on gradients, worst stop

Text placed on a gradient is measured against the stop where it is weakest (dark stripes and sheens composited in).

| Text | Foreground | Composited background | Ratio | Result |
| --- | --- | --- | --- | --- |
| Primary label hover | `#04120D` | `#9AF5D7` | 14.96:1 | Pass |
| Onboarding status on ice, under a stripe | `#06090B` | `#90bab7` | 9.41:1 | Pass |
| Card text on cyan corner | `#ECF5F4` | `#2b515e` | 7.76:1 | Pass |
| Card status on its pill | `#ECF5F4` | `#172930` | 13.56:1 | Pass |
| Muted text in the hero card top | `#A7B8B6` | `#142121` | 8.02:1 | Pass |
| Subtle text in the hero card top | `#7E908E` | `#142121` | 4.94:1 | Pass |

## Typography

- **Pairing**: Newsreader (variable, optical size) for titles and every figure, Atkinson Hyperlegible Next 400 and 600 for text and labels. A text serif with lining tabular figures gives amounts an editorial, ledger-like weight, and a sans designed for legibility keeps small labels unambiguous (1, l and I differ).
- **Scale**: the largest and airiest: display 44 to 80 px, figures 48 to 84 px, body leading 1.6, section space 64 to 112 px.
- **Licence and files**: SIL OFL 1.1, `assets/fonts/newsreader/` and `assets/fonts/atkinson-hyperlegible-next/`, each with `OFL.txt`, Fontsource 5.3.0.
- **Payload**: 156.8 KB (132.0 + 12.1 + 12.7), the heaviest of the five.

## Icons

Phosphor **light**, 18, 20 and 24 px; avatars are hairline-bordered squares and rows are separated by hairlines, like a ledger. Static SVG files copied from `@phosphor-icons/core` 2.1.1 into `../../assets/icons/phosphor/` (with its MIT `LICENSE`), drawn with CSS `mask` so they take `currentColor`. No icon font, no sprite request, no npm dependency.

## Glow

One recipe, tokenised in layer 4 of `tokens.css`:

| Token | Value |
| --- | --- |
| `--glow-color` | Mint `#78F0C8` |
| `--glow-blur` | 40 px |
| `--glow-spread` | -8 px |
| `--glow-opacity` / `--glow-opacity-hover` | 35 % / 52 % |
| `--glow` (formula in `../shared/base.css`) | `0 0 blur spread color-mix(in srgb, color opacity, transparent)` |

Three placements, never more on one screen: the hero balance card, the primary action (`data-glow` on the button), and today's point on the chart (`drop-shadow` 8 px, 75 %). No text gradient, no decorative blurred blob.

## Motion

Slow and precise: the longest durations, `cubic-bezier(0.33, 1, 0.68, 1)`, a soft spring with no overshoot, the lightest press (0.985).

| Token | Value |
| --- | --- |
| Press | 110 ms, scale 0.985 (cards 0.995) |
| Hover and colour | 180 ms, `cubic-bezier(0.33, 1, 0.68, 1)` |
| Base (state changes, expand) | 320 ms |
| Entrance on scroll | 860 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, from 8 px below, stagger 90 ms, once, at 12 % visible |
| Chart | real line drawn in 1500 ms, area fades in, planned line and dots after, today's point springs in, one halo pulse |
| Spring | stiffness 140, damping 24, mass 1: settles in 872 ms, no overshoot; sampled into a CSS `linear()` easing (`--ease-spring`) |

Micro-interactions (nothing lifts on hover): buttons and chips press to the scale above and return on the spring; a trailing arrow nudges 2 px on hover; the primary button's glow rises to the hover opacity; transaction rows (native `details`) brighten on hover without moving, press slightly, and open their detail with a short fade and rise. Only `transform`, `opacity` and colours are animated (the entrance blur is the one `filter`).

Motion (framer-motion) equivalent, documented only (not installed):

```tsx
const press = { type: "spring", stiffness: 140, damping: 24, mass: 1 };
<motion.button whileTap={{ scale: 0.985 }} transition={press} />
<motion.section
  initial={{ opacity: 0, y: 8 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.12 }}
  transition={{ duration: 0.86, ease: [0.16, 1, 0.3, 1], delay: index * 0.09 }}
/>
// useReducedMotion(): render the final state, no transition.
```

Reduced motion: under `prefers-reduced-motion: reduce` (or `?motion=reduce` for testing) every transition and animation drops to 0.01 ms, the entrance script does nothing, and nothing is ever hidden.

## What comes from which inspiration

| Reference | Taken | Not taken |
| --- | --- | --- |
| 01 lime dots | One vivid element per screen, hairline tick meter | Lime, density |
| 02 blue glass | Thin line over a fading area, dark cold ground | Glass |
| 03 onboarding | Striped gradient phone header in mint and cyan | Warm hues |

## Verification

Measured in the T3 Code integrated browser (Chromium, macOS), page served on loopback, on 2026-11-08:

- 1440 x 900 and 375 x 812: `scrollWidth` equal to the viewport, no element past the right edge (a narrow overflow of the components card, caused by a `nowrap` figure, was found at 375 px and fixed).
- Text contrast of every visible text node against its composited solid background: 157 texts at 1440 px, none below its threshold; lowest on a solid background 5.23:1 (disabled button, exempt). Text over gradients cannot be composited by that script, so it was measured separately at the worst stop (table above).
- Glow: at most 3 elements carrying `data-glow` intersect any 900 px tall viewport (sampled every 100 px), 2 at 375 px.
- Every button, link, summary and field is at least 44 x 44 px (radio inputs excluded: their 44 px target is the label).
- Focus: `:focus-visible` draws a 2 px ice outline, offset 2 px.
- Fonts actually loaded (`document.fonts`, status `loaded`): Newsreader 200 to 800, Atkinson Hyperlegible Next 400 and 600. Tabular figures checked: "111111" and "000000" render at the same width in the figures font.
- Network: every resource is served by the loopback origin; no request to another host, no CDN, no web font service.
- Console: the page was reloaded in a same-origin iframe with an error and `console.error`/`console.warn` recorder injected before any script, then the range chips, the transaction filter, the card freeze, the balance mask and the form submit were clicked: no entry.
- Interactions: the filter leaves 1 row for "Prévu" and updates the live count; submitting the form moves focus to the invalid date field and writes the error in the status region.
- Reduced motion (`?motion=reduce`, which sets the same rules as the media query): `data-motion="reduce"`, no block hidden, transitions at 0.01 ms.

Not verified:

- Screenshots: `preview_snapshot` timed out on every attempt, on these pages and on the existing `design-system-preview/index.html`, because the T3 tab stayed reported as not visible. The pages were therefore judged by measurements, not by eye. Owner review in a visible browser is required.
- Entrance and chart animations could not be watched: the hidden tab does not advance animation timelines. Their code paths ran without error, and the reveal only hides a block after the observer reports it off screen, so the page stays readable if the observer never fires.
- The real `prefers-reduced-motion` OS setting, other browsers and platforms, 200 % zoom, a screen reader, axe or Lighthouse (not installed).

## Open points for the owner

- Pick or reject this direction; nothing here is adopted.
- The palette's status colours (success, warning, error) are proposals.
- Dark theme only: a light theme is not designed (the roadmap lists the theme question for M2).
- The brand name is coined and was not checked for trademarks.
