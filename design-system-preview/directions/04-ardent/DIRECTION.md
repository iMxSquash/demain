# Direction 04, Ardent

Status: Exploration. New brand, magenta to amber on near-black aubergine, after reference 03. Part of the five directions compared in [../index.html](../index.html) and listed in [docs/DESIGN-SYSTEM-PREVIEW.md](../../../docs/DESIGN-SYSTEM-PREVIEW.md#five-directions). Every figure, name and amount on the page is fictional.

| File | Content |
| --- | --- |
| `tokens.css` | Layer 1 primitives, 2 semantic roles, 3 component tokens, 4 glow recipe, 5 motion, 6 a few signature rules |
| `index.html` | The comparison page: hero with balance and bank card, chart with its data table, transactions, form with states, buttons and badges, mobile onboarding frame |
| `../shared/base.css` | Component anatomy shared by the five directions; it reads tokens only |
| `../shared/preview.js` | Chart rendering, toggles, filter, form demo and entrance motion, reading the motion tokens |
| `wordmark.svg` | The wordmark, outlines and strokes only, no live text |

## Brand

- **Name**: Ardent (burning, eager): money in motion, the energy of the month. Coined for this exploration; trademark availability not checked.
- **Wordmark**: `wordmark.svg`, a setting sun cut by horizontal bands (the stripes of 03) in a magenta to amber gradient over a baseline, then "ardent" in a heavy monoline (10 unit strokes).
- **Editorial tone**: warm, energetic, encouraging, never hype. "Votre argent, en mouvement." "Prenez l'élan du mois." "C'est parti."

## Palette

| Name | Value | Role |
| --- | --- | --- |
| Plum 950 | `#0E080F` | Page |
| Plum 900 | `#160E18` | Cards |
| Plum 850 | `#1E1421` | Rows, fields |
| Plum 800 | `#2B1F2E` | Controls |
| Blush 100 | `#FCF3F5` | Text, focus |
| Blush 300 | `#CDBAC6` | Secondary text |
| Blush 500 | `#9E8A99` | Labels, dates |
| Blush 600 | `#7A6676` | Meaningful strokes |
| Magenta 500 | `#E0359A` | Accent, glow, chart area |
| Magenta 600 / 700 | `#C21D80 / #A3156B` | Primary button, active chip |
| Magenta 300 | `#FF7CC2` | Real line, accent text, icons |
| Amber 400 | `#F6A430` | Secondary: planned values, gradient end |
| Apricot 300 | `#FF9E6B` | Tertiary data |
| Jade 400 | `#6BD9A8` | Success |
| Yellow 300 | `#F4D35E` | Warning |
| Vermilion 400 | `#FF6F61` | Error |

White on the brighter magenta 500 measures only 4.0:1, so the button and active chip use magenta 600 and 700 (5.55:1 and 7.30:1). Error is a vermilion, 40 degrees away from magenta, and always carries an icon and words.

### Gradients

- Primary button: magenta 600 to 700, a 70 % magenta 200 outline and a light top edge, as the call to action of 03.
- Hero card: a 24 % magenta light top right, a 12 % amber light bottom left.
- Bank card: plum 700 to 950, with a magenta to amber corner cut by dark diagonal stripes.
- Onboarding header: magenta 200, magenta, amber, aubergine, with stripes (lightened from 30 % to 20 % black after measurement).

### Contrast on solid backgrounds

Computed from the token values with the WCAG 2.2 formula. Glow is excluded from every calculation.

| Pair | Foreground | Background | Ratio | Required | Result |
| --- | --- | --- | --- | --- | --- |
| Text on page | `#FCF3F5` | `#0E080F` | 18.18:1 | 4.5:1 | Pass |
| Text on surface | `#FCF3F5` | `#160E18` | 17.37:1 | 4.5:1 | Pass |
| Muted text on surface | `#CDBAC6` | `#160E18` | 10.30:1 | 4.5:1 | Pass |
| Muted text on inset | `#CDBAC6` | `#1E1421` | 9.71:1 | 4.5:1 | Pass |
| Subtle text on page | `#9E8A99` | `#0E080F` | 6.18:1 | 4.5:1 | Pass |
| Subtle text on surface | `#9E8A99` | `#160E18` | 5.90:1 | 4.5:1 | Pass |
| Accent text on surface | `#FF7CC2` | `#160E18` | 8.03:1 | 4.5:1 | Pass |
| Label on primary button | `#FFFFFF` | `#C21D80` | 5.55:1 | 4.5:1 | Pass |
| Accent on page (UI, 3:1) | `#E0359A` | `#0E080F` | 4.85:1 | 3:1 | Pass |
| Secondary on surface (data, 3:1) | `#F6A430` | `#160E18` | 9.25:1 | 3:1 | Pass |
| Tertiary on surface (data, 3:1) | `#FF9E6B` | `#160E18` | 9.33:1 | 3:1 | Pass |
| Stroke on surface (UI, 3:1) | `#7A6676` | `#160E18` | 3.59:1 | 3:1 | Pass |
| Success on surface | `#6BD9A8` | `#160E18` | 10.91:1 | 4.5:1 | Pass |
| Warning on surface | `#F4D35E` | `#160E18` | 12.90:1 | 4.5:1 | Pass |
| Error on surface | `#FF6F61` | `#160E18` | 6.93:1 | 4.5:1 | Pass |
| Focus ring on page (3:1) | `#FCF3F5` | `#0E080F` | 18.18:1 | 3:1 | Pass |
| Focus ring on control (3:1) | `#FCF3F5` | `#2B1F2E` | 14.41:1 | 3:1 | Pass |

### Contrast on gradients, worst stop

Text placed on a gradient is measured against the stop where it is weakest (dark stripes and sheens composited in).

| Text | Foreground | Composited background | Ratio | Result |
| --- | --- | --- | --- | --- |
| Primary label, top stop | `#FFFFFF` | `#C21D80` | 5.55:1 | Pass |
| Primary label, bottom stop | `#FFFFFF` | `#A3156B` | 7.30:1 | Pass |
| Onboarding status on pink, under a stripe | `#0E080F` | `#c66896` | 5.49:1 | Pass |
| Onboarding status on pink, no stripe | `#0E080F` | `#f782bc` | 8.37:1 | Pass |
| Card status on its pill over magenta | `#FCF3F5` | `#491536` | 13.35:1 | Pass |
| Card brand on plum | `#FCF3F5` | `#3D2C40` | 11.81:1 | Pass |
| Muted text in the hero card corner | `#CDBAC6` | `#461737` | 7.95:1 | Pass |
| Subtle text in the hero card corner | `#9E8A99` | `#461737` | 4.55:1 | Pass |

## Typography

- **Pairing**: Archivo (variable) alone: headings at weight 800 and 125 % width, text at 400 and 100 %, figures at 620 and 108 %. One grotesque stretched from expanded black to regular text gives the heavy, warm headlines of 03 with a single file.
- **Scale**: display 38 to 72 px with leading 1, title 24 to 36 px, figures 40 to 68 px.
- **Licence and files**: SIL OFL 1.1, `assets/fonts/archivo/` with `OFL.txt`, Fontsource variable 5.3.0 (weight 100 to 900, width 62 to 125 %).
- **Payload**: 90.1 KB.

## Icons

Phosphor **duotone**, 16, 20 and 24 px. Used as masks, the duotone's 20 % layer keeps its opacity, so the icon reads two-tone in one colour. Static SVG files copied from `@phosphor-icons/core` 2.1.1 into `../../assets/icons/phosphor/` (with its MIT `LICENSE`), drawn with CSS `mask` so they take `currentColor`. No icon font, no sprite request, no npm dependency.

## Glow

One recipe, tokenised in layer 4 of `tokens.css`:

| Token | Value |
| --- | --- |
| `--glow-color` | Magenta `#E0359A` |
| `--glow-blur` | 36 px |
| `--glow-spread` | -4 px |
| `--glow-opacity` / `--glow-opacity-hover` | 55 % / 78 % |
| `--glow` (formula in `../shared/base.css`) | `0 0 blur spread color-mix(in srgb, color opacity, transparent)` |

Three placements, never more on one screen: the hero balance card, the primary action (`data-glow` on the button), and today's point on the chart (`drop-shadow` 9 px, 95 %). No text gradient, no decorative blurred blob.

## Motion

Energetic: a visible spring (9.5 % overshoot), entrance from 20 px with an easing that overshoots slightly, the strongest press (0.95).

| Token | Value |
| --- | --- |
| Press | 80 ms, scale 0.95 (cards 0.985) |
| Hover and colour | 150 ms, `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| Base (state changes, expand) | 260 ms |
| Entrance on scroll | 560 ms, `cubic-bezier(0.18, 1.25, 0.4, 1)`, from 20 px below, stagger 50 ms, once, at 12 % visible |
| Chart | real line drawn in 900 ms, area fades in, planned line and dots after, today's point springs in, one halo pulse |
| Spring | stiffness 340, damping 22, mass 1: settles in 660 ms, 9.5 % overshoot; sampled into a CSS `linear()` easing (`--ease-spring`) |

Micro-interactions (nothing lifts on hover, nothing appears or disappears instantly): every hover is a transition (colour, border, inset layer or opacity); the primary button's hover background is a layer that fades in, because gradients cannot be interpolated, and its glow rises to the hover opacity; buttons and chips press to the scale above and return on the spring; a trailing arrow nudges 4 px sideways on hover; a chip's check grows in when pressed. Transaction rows (native `details`) brighten as a whole tile on hover and the whole tile, open or closed, presses to 0.985. Rows and the data table open and close by animating their height (260 ms, closing at 75 %), the content fading in; filtered rows collapse and fade out or grow back; the masked balance and the card status cross-fade; the form message fades in. Only `transform`, `opacity` and colours are animated (the entrance blur is the one `filter`).

Motion (framer-motion) equivalent, documented only (not installed):

```tsx
const press = { type: "spring", stiffness: 340, damping: 22, mass: 1 };
<motion.button whileTap={{ scale: 0.95 }} transition={press} />
<motion.section
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.12 }}
  transition={{ duration: 0.56, ease: [0.18, 1.25, 0.4, 1], delay: index * 0.05 }}
/>
// useReducedMotion(): render the final state, no transition.
```

Reduced motion: under `prefers-reduced-motion: reduce` (or `?motion=reduce` for testing) every transition and animation drops to 0.01 ms, the entrance script does nothing, and nothing is ever hidden.

## What comes from which inspiration

| Reference | Taken | Not taken |
| --- | --- | --- |
| 01 lime dots | One vivid element per screen, chunky meter | Lime |
| 02 blue glass | Glowing line over a fading area | Glass, blue |
| 03 onboarding | Black ground, vivid striped gradient headers, magenta and amber, heavy headlines stepping down in tone, glowing call to action with a lighter outline, 16 px button radius | Purple and blue screens, the giant outlined title behind the phones |

## Verification

Measured in the T3 Code integrated browser (Chromium, macOS), page served on loopback, on 2026-11-08:

- 1440 x 900 and 375 x 812: `scrollWidth` equal to the viewport, no element past the right edge (a narrow overflow of the components card, caused by a `nowrap` figure, was found at 375 px and fixed).
- Text contrast of every visible text node against its composited solid background: 157 texts at 1440 px, none below its threshold; lowest on a solid background 5.55:1 (white on the active chip). Text over gradients cannot be composited by that script, so it was measured separately at the worst stop (table above).
- Glow: at most 3 elements carrying `data-glow` intersect any 900 px tall viewport (sampled every 100 px), 2 at 375 px.
- Every button, link, summary and field is at least 44 x 44 px (radio inputs excluded: their 44 px target is the label).
- Focus: `:focus-visible` draws a 2 px blush outline, offset 3 px.
- Fonts actually loaded (`document.fonts`, status `loaded`): Archivo 100 to 900. Tabular figures checked: "111111" and "000000" render at the same width in the figures font.
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
