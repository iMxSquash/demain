# Direction 02, Kerf

Status: Exploration. New brand, lime on graphite, after reference 01. Part of the five directions compared in [../index.html](../index.html) and listed in [docs/DESIGN-SYSTEM-PREVIEW.md](../../../docs/DESIGN-SYSTEM-PREVIEW.md#five-directions). Every figure, name and amount on the page is fictional.

| File | Content |
| --- | --- |
| `tokens.css` | Layer 1 primitives, 2 semantic roles, 3 component tokens, 4 glow recipe, 5 motion, 6 a few signature rules |
| `index.html` | The comparison page: hero with balance and bank card, chart with its data table, transactions, form with states, buttons and badges, mobile onboarding frame |
| `../shared/base.css` | Component anatomy shared by the five directions; it reads tokens only |
| `../shared/preview.js` | Chart rendering, toggles, filter, form demo and entrance motion, reading the motion tokens |
| `wordmark.svg` | The wordmark, outlines and strokes only, no live text |

## Brand

- **Name**: Kerf, the narrow cut a saw leaves: the width of one tick, the precision of one cent. Coined for this exploration; trademark availability not checked.
- **Wordmark**: `wordmark.svg`, four bars of rising height (the tick bars of 01), the last one lime, then "kerf" in a monoline drawn with 7 unit strokes. Outlines only, no live text.
- **Editorial tone**: terse, numeric, factual. "Chaque euro, compté." "Au centime près, rien d'arrondi."

## Palette

| Name | Value | Role |
| --- | --- | --- |
| Graphite 950 | `#101110` | Page |
| Graphite 900 | `#171817` | Cards |
| Graphite 850 | `#1E1F1D` | Rows, fields |
| Graphite 800 | `#2A2B28` | Controls, chips |
| Stone 100 | `#F3F4EE` | Text |
| Stone 300 | `#B3B5AC` | Secondary text |
| Stone 500 | `#8B8D85` | Labels, dates |
| Stone 600 | `#6D6F68` | Meaningful strokes, empty ticks |
| Lime 400 | `#D4FF3A` | Accent: primary action, active chip, real line, used ticks, focus |
| Signal blue 400 | `#7C9CFF` | Secondary data series |
| Chalk 200 | `#E7E4D8` | Planned values (dotted) |
| Mint 400 | `#5BD69A` | Success |
| Amber 400 | `#FFB547` | Warning |
| Coral 400 | `#FF7468` | Error |

Lime and the success mint are both greenish (hues about 73 and 150 degrees): gains always carry a sign and an arrow, and lime never means a gain.

### Gradients

- Primary button: flat lime, as in 01; a 45 % white top edge.
- Hero card: a 6 % lime radial in the top left corner.
- Bank card: graphite 700 to 950 with a 22 % lime light in the corner and faint vertical hairlines.
- Onboarding header: lime 200, lime, olive 700, graphite, with stripes.

### Contrast on solid backgrounds

Computed from the token values with the WCAG 2.2 formula. Glow is excluded from every calculation.

| Pair | Foreground | Background | Ratio | Required | Result |
| --- | --- | --- | --- | --- | --- |
| Text on page | `#F3F4EE` | `#101110` | 17.11:1 | 4.5:1 | Pass |
| Text on surface | `#F3F4EE` | `#171817` | 16.10:1 | 4.5:1 | Pass |
| Muted text on surface | `#B3B5AC` | `#171817` | 8.58:1 | 4.5:1 | Pass |
| Muted text on inset | `#B3B5AC` | `#1E1F1D` | 7.98:1 | 4.5:1 | Pass |
| Subtle text on page | `#8B8D85` | `#101110` | 5.63:1 | 4.5:1 | Pass |
| Subtle text on surface | `#8B8D85` | `#171817` | 5.30:1 | 4.5:1 | Pass |
| Accent text on surface | `#D4FF3A` | `#171817` | 15.40:1 | 4.5:1 | Pass |
| Label on primary button | `#101110` | `#D4FF3A` | 16.37:1 | 4.5:1 | Pass |
| Accent on page (UI, 3:1) | `#D4FF3A` | `#101110` | 16.37:1 | 3:1 | Pass |
| Secondary on surface (data, 3:1) | `#7C9CFF` | `#171817` | 6.83:1 | 3:1 | Pass |
| Tertiary on surface (data, 3:1) | `#E7E4D8` | `#171817` | 13.98:1 | 3:1 | Pass |
| Stroke on surface (UI, 3:1) | `#6D6F68` | `#171817` | 3.50:1 | 3:1 | Pass |
| Success on surface | `#5BD69A` | `#171817` | 9.78:1 | 4.5:1 | Pass |
| Warning on surface | `#FFB547` | `#171817` | 10.13:1 | 4.5:1 | Pass |
| Error on surface | `#FF7468` | `#171817` | 6.74:1 | 4.5:1 | Pass |
| Focus ring on page (3:1) | `#D4FF3A` | `#101110` | 16.37:1 | 3:1 | Pass |
| Focus ring on control (3:1) | `#D4FF3A` | `#2A2B28` | 12.32:1 | 3:1 | Pass |

### Contrast on gradients, worst stop

Text placed on a gradient is measured against the stop where it is weakest (dark stripes and sheens composited in).

| Text | Foreground | Composited background | Ratio | Result |
| --- | --- | --- | --- | --- |
| Primary label hover | `#101110` | `#E2FF73` | 16.93:1 | Pass |
| Onboarding status on lime, under a stripe | `#101110` | `#afc264` | 9.66:1 | Pass |
| Card text on lime corner | `#F3F4EE` | `#5c6638` | 5.56:1 | Pass |
| Card status on its pill | `#F3F4EE` | `#373d22` | 10.25:1 | Pass |
| Muted text in the hero card corner | `#B3B5AC` | `#222619` | 7.45:1 | Pass |
| Subtle text in the hero card corner | `#8B8D85` | `#222619` | 4.60:1 | Pass |

## Typography

- **Pairing**: Schibsted Grotesk 400 and 600 for titles and text, Martian Mono 400 for every figure. A newsroom grotesque keeps the dense dashboard readable while a monospace makes columns of amounts align without effort, which is the point of this direction.
- **Scale**: denser than the others: display 36 to 64 px, title 24 to 32 px, figures 34 to 56 px, captions 12 px. Eyebrows in uppercase Martian Mono.
- **Licence and files**: SIL OFL 1.1, `assets/fonts/schibsted-grotesk/` and `assets/fonts/martian-mono/`, each with `OFL.txt`. Latin subset WOFF2 from Fontsource 5.3.0.
- **Payload**: 59.9 KB (24.3 + 25.2 + 10.4).

## Icons

Phosphor **regular**, 16, 20 and 24 px; avatars and icon buttons are round, as in 01. Static SVG files copied from `@phosphor-icons/core` 2.1.1 into `../../assets/icons/phosphor/` (with its MIT `LICENSE`), drawn with CSS `mask` so they take `currentColor`. No icon font, no sprite request, no npm dependency.

## Glow

One recipe, tokenised in layer 4 of `tokens.css`:

| Token | Value |
| --- | --- |
| `--glow-color` | Lime `#D4FF3A` |
| `--glow-blur` | 28 px |
| `--glow-spread` | -4 px |
| `--glow-opacity` / `--glow-opacity-hover` | 38 % / 55 % |
| `--glow` (formula in `../shared/base.css`) | `0 0 blur spread color-mix(in srgb, color opacity, transparent)` |

Three placements, never more on one screen: the hero balance card, the primary action (`data-glow` on the button), and today's point on the chart (`drop-shadow` 7 px, 80 %). No text gradient, no decorative blurred blob.

## Motion

Snappy and mechanical: short durations, `cubic-bezier(0.2, 0, 0, 1)`, a stiff spring with almost no overshoot.

| Token | Value |
| --- | --- |
| Press | 70 ms, scale 0.96 (cards 0.99) |
| Hover and colour | 110 ms, `cubic-bezier(0.2, 0, 0, 1)` |
| Base (state changes, expand) | 200 ms |
| Entrance on scroll | 420 ms, `cubic-bezier(0.25, 1, 0.5, 1)`, from 8 px below, stagger 35 ms, once, at 12 % visible |
| Chart | real line drawn in 700 ms, area fades in, planned line and dots after, today's point springs in, one halo pulse |
| Spring | stiffness 520, damping 40, mass 1: settles in 466 ms, no overshoot; sampled into a CSS `linear()` easing (`--ease-spring`) |

Micro-interactions (nothing lifts on hover, nothing appears or disappears instantly): every hover is a transition (colour, border, inset layer or opacity); the primary button's hover background is a layer that fades in, because gradients cannot be interpolated, and its glow rises to the hover opacity; buttons and chips press to the scale above and return on the spring; a trailing arrow nudges 2 px sideways on hover; a chip's check grows in when pressed. Transaction rows (native `details`) brighten as a whole tile on hover and the whole tile, open or closed, presses to 0.99. Rows and the data table open and close by animating their height (200 ms, closing at 75 %), the content fading in; filtered rows collapse and fade out or grow back; the masked balance and the card status cross-fade; the form message fades in. Only `transform`, `opacity` and colours are animated (the entrance blur is the one `filter`).

Motion (framer-motion) equivalent, documented only (not installed):

```tsx
const press = { type: "spring", stiffness: 520, damping: 40, mass: 1 };
<motion.button whileTap={{ scale: 0.96 }} transition={press} />
<motion.section
  initial={{ opacity: 0, y: 8 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.12 }}
  transition={{ duration: 0.42, ease: [0.25, 1, 0.5, 1], delay: index * 0.035 }}
/>
// useReducedMotion(): render the final state, no transition.
```

Reduced motion: under `prefers-reduced-motion: reduce` (or `?motion=reduce` for testing) every transition and animation drops to 0.01 ms, the entrance script does nothing, and nothing is ever hidden.

## What comes from which inspiration

| Reference | Taken | Not taken |
| --- | --- | --- |
| 01 lime dots | Graphite ladder one step apart, lime on the action and active chip only, pill nav with a tinted current item, round icon buttons, tick bars, dot-matrix plot ground | Multicolour category rainbow, avatars |
| 02 blue glass | Thin line over a fading area | Glass, blue |
| 03 onboarding | Striped gradient phone header | Magenta, orange |

## Verification

Measured in the T3 Code integrated browser (Chromium, macOS), page served on loopback, on 2026-11-08:

- 1440 x 900 and 375 x 812: `scrollWidth` equal to the viewport, no element past the right edge (a narrow overflow of the components card, caused by a `nowrap` figure, was found at 375 px and fixed).
- Text contrast of every visible text node against its composited solid background: 157 texts at 1440 px, none below its threshold; lowest on a solid background 4.92:1 (transaction dates). Text over gradients cannot be composited by that script, so it was measured separately at the worst stop (table above).
- Glow: at most 3 elements carrying `data-glow` intersect any 900 px tall viewport (sampled every 100 px), 2 at 375 px.
- Every button, link, summary and field is at least 44 x 44 px (radio inputs excluded: their 44 px target is the label).
- Focus: `:focus-visible` draws a 2 px lime outline, offset 2 px.
- Fonts actually loaded (`document.fonts`, status `loaded`): Schibsted Grotesk 400, Schibsted Grotesk 600, Martian Mono 400. Tabular figures checked: "111111" and "000000" render at the same width in the figures font.
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
