# Direction 01, Dawn

Status: Exploration. Strictly the existing brand of `brand/README.md`, with glow and gradients derived from Dawn. Part of the five directions compared in [../index.html](../index.html) and listed in [docs/DESIGN-SYSTEM-PREVIEW.md](../../../docs/DESIGN-SYSTEM-PREVIEW.md#five-directions). Every figure, name and amount on the page is fictional.

| File | Content |
| --- | --- |
| `tokens.css` | Layer 1 primitives, 2 semantic roles, 3 component tokens, 4 glow recipe, 5 motion, 6 a few signature rules |
| `index.html` | The comparison page: hero with balance and bank card, chart with its data table, transactions, form with states, buttons and badges, mobile onboarding frame |
| `../shared/base.css` | Component anatomy shared by the five directions; it reads tokens only |
| `../shared/preview.js` | Chart rendering, toggles, filter, form demo and entrance motion, reading the motion tokens |

## Brand

- **Name and logo**: Demain, the existing horizontal reversed logo (`../../assets/demain-horizontal-reversed.svg`), unchanged.
- **Idea**: the brand stays as it is. The only additions are a Dawn glow on three elements per screen and gradients that move between Dawn deep, Dawn and a lighter Dawn tint (same hue, about 18 to 20 degrees). No new accent hue.
- **Editorial tone**: plain, calm French taken from `docs/PRODUCT.md`. "Voir demain sans deviner." "Le réel d'abord, le prévu ensuite, jamais d'estimation."
- **Rules kept**: Dawn marks the primary action and planned values only, never a gain or a loss. Planned values are dotted, real values solid.

## Palette

| Name | Value | Role |
| --- | --- | --- |
| Night deep | `#0B0C18` | Page |
| Night surface | `#10111D` | Cards |
| Night inset | `#161827` | Fields |
| Night control | `#21222E` | Secondary buttons |
| Paper | `#F7F4EE` | Text, real line, focus |
| Mist 200 | `#BBBDCE` | Secondary text |
| Mist 400 | `#8C8C9A` | Labels, dates |
| Mist 500 | `#6E6E7C` | Meaningful strokes |
| Dawn | `#DB6430` | Primary action, planned values, glow |
| Dawn text | `#F08A5A` | Dawn as text on dark |
| Dawn light | `#F5A27A` | Light end of the Dawn gradients |
| Dawn deep | `#B3501F` | Dark end of the onboarding gradient |
| Success (proposed) | `#5FD38D` | Gains, with sign and arrow |
| Warning (proposed) | `#E9C46A` | Low balance, with icon |
| Error (proposed) | `#FF8497` | Errors, with icon and text |

Dawn light and Dawn text are tints of Dawn, not new hues. Success, warning and error are not part of the brand file, which defines none: they are proposals, never used as accent. The warning yellow sits 25 degrees away from Dawn; it always comes with an icon and a word.

### Gradients

- Primary button: 180 degrees, Dawn mixed with 28 % Dawn light, to Dawn.
- Hero card: a 16 % Dawn radial light in the top right corner over Night surface.
- Bank card: a 30 % Dawn radial over Night raised to Night deep, plus the two Dawn dots of the logo.
- Onboarding header: Dawn light, Dawn, Dawn deep, Night, with dark diagonal stripes as in reference 03.

### Contrast on solid backgrounds

Computed from the token values with the WCAG 2.2 formula. Glow is excluded from every calculation.

| Pair | Foreground | Background | Ratio | Required | Result |
| --- | --- | --- | --- | --- | --- |
| Text on page | `#F7F4EE` | `#0B0C18` | 17.71:1 | 4.5:1 | Pass |
| Text on surface | `#F7F4EE` | `#10111D` | 17.08:1 | 4.5:1 | Pass |
| Muted text on surface | `#BBBDCE` | `#10111D` | 10.07:1 | 4.5:1 | Pass |
| Muted text on inset | `#BBBDCE` | `#161827` | 9.45:1 | 4.5:1 | Pass |
| Subtle text on page | `#8C8C9A` | `#0B0C18` | 5.86:1 | 4.5:1 | Pass |
| Subtle text on surface | `#8C8C9A` | `#10111D` | 5.65:1 | 4.5:1 | Pass |
| Accent text on surface | `#F08A5A` | `#10111D` | 7.58:1 | 4.5:1 | Pass |
| Label on primary button | `#0B0C18` | `#DB6430` | 5.44:1 | 4.5:1 | Pass |
| Accent on page (UI, 3:1) | `#DB6430` | `#0B0C18` | 5.44:1 | 3:1 | Pass |
| Secondary on surface (data, 3:1) | `#F5A27A` | `#10111D` | 9.23:1 | 3:1 | Pass |
| Tertiary on surface (data, 3:1) | `#B3501F` | `#10111D` | 3.65:1 | 3:1 | Pass |
| Stroke on surface (UI, 3:1) | `#6E6E7C` | `#10111D` | 3.74:1 | 3:1 | Pass |
| Success on surface | `#5FD38D` | `#10111D` | 9.99:1 | 4.5:1 | Pass |
| Warning on surface | `#E9C46A` | `#10111D` | 11.22:1 | 4.5:1 | Pass |
| Error on surface | `#FF8497` | `#10111D` | 8.04:1 | 4.5:1 | Pass |
| Focus ring on page (3:1) | `#F7F4EE` | `#0B0C18` | 17.71:1 | 3:1 | Pass |
| Focus ring on control (3:1) | `#F7F4EE` | `#21222E` | 14.35:1 | 3:1 | Pass |

### Contrast on gradients, worst stop

Text placed on a gradient is measured against the stop where it is weakest (dark stripes and sheens composited in).

| Text | Foreground | Composited background | Ratio | Result |
| --- | --- | --- | --- | --- |
| Primary label, top stop | `#0B0C18` | `#e27545` | 6.36:1 | Pass |
| Primary label, bottom stop | `#0B0C18` | `#DB6430` | 5.44:1 | Pass |
| Primary label hover, top | `#0B0C18` | `#e78051` | 7.04:1 | Pass |
| Onboarding status on Dawn light, under a stripe | `#0B0C18` | `#b16d4d` | 4.78:1 | Pass |
| Card text on Dawn corner | `#F7F4EE` | `#5a3946` | 9.07:1 | Pass |
| Card status on its pill | `#F7F4EE` | `#3b252e` | 12.84:1 | Pass |
| Muted text in the hero card corner | `#BBBDCE` | `#301e20` | 8.47:1 | Pass |
| Subtle text in the hero card corner | `#8C8C9A` | `#301e20` | 4.75:1 | Pass |

## Typography

- **Pairing**: the system stack of the brand file for everything (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), weights 400 and 600, `tabular-nums` on every amount. Kept because the brief requires it: no file, nothing leaves the server.
- **Scale**: display 40 to 72 px, title 26 to 38 px, body 16 px, figures 44 to 76 px in weight 400 (as in references 01 and 02).
- **Payload**: 0 KB.
- **Trade-off**: renders as SF Pro on Apple devices, Segoe UI on Windows; only macOS was seen.

## Icons

Phosphor **regular**, 16, 20 and 24 px, the weight already used by `design-system-preview/index.html`. Static SVG files copied from `@phosphor-icons/core` 2.1.1 into `../../assets/icons/phosphor/` (with its MIT `LICENSE`), drawn with CSS `mask` so they take `currentColor`. No icon font, no sprite request, no npm dependency.

## Glow

One recipe, tokenised in layer 4 of `tokens.css`:

| Token | Value |
| --- | --- |
| `--glow-color` | Dawn `#DB6430` |
| `--glow-blur` | 32 px |
| `--glow-spread` | -6 px |
| `--glow-opacity` / `--glow-opacity-hover` | 50 % / 72 % |
| `--glow` (formula in `../shared/base.css`) | `0 0 blur spread color-mix(in srgb, color opacity, transparent)` |

Three placements, never more on one screen: the hero balance card, the primary action (`data-glow` on the button), and today's point on the chart (`drop-shadow` 8 px, 85 %). No text gradient, no decorative blurred blob.

## Motion

Calm, no overshoot: the landing's curve `cubic-bezier(0.16, 1, 0.3, 1)` everywhere.

| Token | Value |
| --- | --- |
| Press | 90 ms, scale 0.97 (cards 0.99) |
| Hover and colour | 140 ms, `cubic-bezier(0.16, 1, 0.3, 1)` |
| Base (state changes, expand) | 240 ms |
| Entrance on scroll | 640 ms, `cubic-bezier(0.16, 1, 0.3, 1)`, from 12 px below, stagger 60 ms, once, at 12 % visible |
| Chart | real line drawn in 1000 ms, area fades in, planned line and dots after, today's point springs in, one halo pulse |
| Spring | stiffness 260, damping 32, mass 1: settles in 645 ms, no overshoot; sampled into a CSS `linear()` easing (`--ease-spring`) |

Micro-interactions: buttons and chips press to the scale above and return on the spring; a trailing arrow nudges 2 px on hover; the primary button's glow rises to the hover opacity; transaction rows (native `details`) lift their avatar 2 px on hover, press slightly, and open their detail with a short fade and rise. Only `transform`, `opacity` and colours are animated (the entrance blur is the one `filter`).

Motion (framer-motion) equivalent, documented only (not installed):

```tsx
const press = { type: "spring", stiffness: 260, damping: 32, mass: 1 };
<motion.button whileTap={{ scale: 0.97 }} transition={press} />
<motion.section
  initial={{ opacity: 0, y: 12 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.12 }}
  transition={{ duration: 0.64, ease: [0.16, 1, 0.3, 1], delay: index * 0.06 }}
/>
// useReducedMotion(): render the final state, no transition.
```

Reduced motion: under `prefers-reduced-motion: reduce` (or `?motion=reduce` for testing) every transition and animation drops to 0.01 ms, the entrance script does nothing, and nothing is ever hidden.

## What comes from which inspiration

| Reference | Taken | Not taken |
| --- | --- | --- |
| 01 lime dots | One vivid element per screen, pill controls, tick meter (one tick per 50 EUR) | Lime |
| 02 blue glass | Glow around the primary action and the hero card, light line over a fading area | Glass, blue |
| 03 onboarding | Striped gradient header of the phone, headline stepping down in tone | Magenta, orange, purple |

## Verification

Measured in the T3 Code integrated browser (Chromium, macOS), page served on loopback, on 2026-11-08:

- 1440 x 900 and 375 x 812: `scrollWidth` equal to the viewport, no element past the right edge (a narrow overflow of the components card, caused by a `nowrap` figure, was found at 375 px and fixed).
- Text contrast of every visible text node against its composited solid background: 157 texts at 1440 px, none below its threshold. Text over gradients cannot be composited by that script, so it was measured separately at the worst stop (table above).
- Glow: at most 3 elements carrying `data-glow` intersect any 900 px tall viewport (sampled every 100 px), 2 at 375 px.
- Every button, link, summary and field is at least 44 x 44 px (radio inputs excluded: their 44 px target is the label).
- Focus: `:focus-visible` draws a 2 px Paper outline, offset 2 px.
- Fonts actually loaded (`document.fonts`, status `loaded`): none, the system stack is used (computed family `ui-sans-serif`). Tabular figures checked: "111111" and "000000" render at the same width in the figures font.
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
- The palette's status colours (success, warning, error) are proposals. The brand file defines none.
- Dark theme only: a light theme is not designed (the roadmap lists the theme question for M2).
