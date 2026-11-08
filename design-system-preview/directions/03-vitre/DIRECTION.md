# Direction 03, Vitre

Status: Exploration. New brand, cobalt and violet frosted glass on ink, after reference 02. Part of the five directions compared in [../index.html](../index.html) and listed in [docs/DESIGN-SYSTEM-PREVIEW.md](../../../docs/DESIGN-SYSTEM-PREVIEW.md#five-directions). Every figure, name and amount on the page is fictional.

| File | Content |
| --- | --- |
| `tokens.css` | Layer 1 primitives, 2 semantic roles, 3 component tokens, 4 glow recipe, 5 motion, 6 a few signature rules |
| `index.html` | The comparison page: hero with balance and bank card, chart with its data table, transactions, form with states, buttons and badges, mobile onboarding frame |
| `../shared/base.css` | Component anatomy shared by the five directions; it reads tokens only |
| `../shared/preview.js` | Chart rendering, toggles, filter, form demo and entrance motion, reading the motion tokens |
| `wordmark.svg` | The wordmark, outlines and strokes only, no live text |

## Brand

- **Name**: Vitre (French for a window pane): seeing your accounts through clear glass. Coined for this exploration; trademark availability not checked.
- **Wordmark**: `wordmark.svg`, two overlapping rounded panes, cobalt and translucent violet, then "vitre" in a light monoline (5 unit strokes).
- **Editorial tone**: clear, reassuring, transparent. "Vos comptes, en toute transparence." "Rien de caché."

## Palette

| Name | Value | Role |
| --- | --- | --- |
| Ink 950 | `#05061A` | Page (with a cobalt horizon at the top) |
| Ink 900 | `#0B0D26` | Base under glass cards |
| Field | `#080A21` | Ink 950 at 55 % over a card (computed) |
| Ink 800 | `#1D2042` | Controls, tooltip |
| Haze 100 | `#F4F5FF` | Text |
| Haze 300 | `#B8BBDA` | Secondary text |
| Haze 500 | `#9497B8` | Labels, dates (lightened from #8B8EB0 after measurement) |
| Haze 600 | `#6C6F93` | Meaningful strokes |
| Cobalt 500 | `#3360FF` | Accent, glow, chart area |
| Cobalt 600 / 700 | `#2A55F5 / #1F44D6` | Primary button, active chip, bank card |
| Cobalt 400 | `#6C8BFF` | Real line, used meter |
| Violet 400 | `#A08CFF` | Planned values (dotted) |
| Ice 300 | `#9ED8FF` | Focus, today's point, icons |
| Mint 400 | `#4FD8A8` | Success |
| Amber 300 | `#FFC266` | Warning |
| Rose 400 | `#FF7A8A` | Error |

Violet is used here because the brief asks for it, against the taste skill's "no violet" rule; the brief wins. Glass surfaces are translucent fills plus a hairline and a top highlight; there is no `backdrop-filter` on scrolling cards (cost), only the page's cobalt horizon behind them.

### Gradients

- Page: a cobalt 20 % horizon fading to ink over 640 px.
- Glass: 160 degrees, haze 7 % to 2.5 %, over 70 % ink 900.
- Hero card: an 18 % cobalt light top left and a 14 % violet light bottom right.
- Bank card (the vivid object, like the insight card of 02): cobalt 700 to violet 600, with an 8 % sheen band and a 6 % top light.
- Onboarding header: ice, cobalt, violet 600, ink, with stripes.
- Transaction rows: rounded 16 px glass tiles (haze 5 %) 8 px apart, hover at haze 4 % with the same radius (subtle text 4.67:1 on hover), taken from Kerf at the owner's request.

### Contrast on solid backgrounds

Computed from the token values with the WCAG 2.2 formula. Glow is excluded from every calculation.

| Pair | Foreground | Background | Ratio | Required | Result |
| --- | --- | --- | --- | --- | --- |
| Text on page | `#F4F5FF` | `#05061A` | 18.48:1 | 4.5:1 | Pass |
| Text on surface | `#F4F5FF` | `#0B0D26` | 17.60:1 | 4.5:1 | Pass |
| Muted text on surface | `#B8BBDA` | `#0B0D26` | 10.15:1 | 4.5:1 | Pass |
| Muted text on inset | `#B8BBDA` | `#080A21` | 10.37:1 | 4.5:1 | Pass |
| Subtle text on page | `#9497B8` | `#05061A` | 7.04:1 | 4.5:1 | Pass |
| Subtle text on surface | `#9497B8` | `#0B0D26` | 6.71:1 | 4.5:1 | Pass |
| Accent text on surface | `#8EA6FF` | `#0B0D26` | 8.23:1 | 4.5:1 | Pass |
| Label on primary button | `#FFFFFF` | `#2A55F5` | 5.65:1 | 4.5:1 | Pass |
| Accent on page (UI, 3:1) | `#3360FF` | `#05061A` | 4.07:1 | 3:1 | Pass |
| Secondary on surface (data, 3:1) | `#A08CFF` | `#0B0D26` | 6.99:1 | 3:1 | Pass |
| Tertiary on surface (data, 3:1) | `#9ED8FF` | `#0B0D26` | 12.48:1 | 3:1 | Pass |
| Stroke on surface (UI, 3:1) | `#6C6F93` | `#0B0D26` | 3.94:1 | 3:1 | Pass |
| Success on surface | `#4FD8A8` | `#0B0D26` | 10.66:1 | 4.5:1 | Pass |
| Warning on surface | `#FFC266` | `#0B0D26` | 11.97:1 | 4.5:1 | Pass |
| Error on surface | `#FF7A8A` | `#0B0D26` | 7.64:1 | 4.5:1 | Pass |
| Focus ring on page (3:1) | `#9ED8FF` | `#05061A` | 13.10:1 | 3:1 | Pass |
| Focus ring on control (3:1) | `#9ED8FF` | `#1D2042` | 10.26:1 | 3:1 | Pass |

### Contrast on gradients, worst stop

Text placed on a gradient is measured against the stop where it is weakest (dark stripes and sheens composited in).

| Text | Foreground | Composited background | Ratio | Result |
| --- | --- | --- | --- | --- |
| Primary label, top stop | `#FFFFFF` | `#2A55F5` | 5.65:1 | Pass |
| Primary label, bottom stop | `#FFFFFF` | `#1F44D6` | 7.35:1 | Pass |
| Onboarding status on ice, no stripe | `#05061A` | `#84bbff` | 10.06:1 | Pass |
| Onboarding status on ice, under a stripe | `#05061A` | `#628abd` | 5.62:1 | Pass |
| Card text on cobalt with both sheens | `#FFFFFF` | `#3d5ddb` | 5.55:1 | Pass |
| Card text on violet end | `#FFFFFF` | `#6854cc` | 5.63:1 | Pass |
| Muted text in the hero card corner | `#B8BBDA` | `#1f2959` | 7.34:1 | Pass |
| Subtle text in the hero card corner | `#9497B8` | `#1f2959` | 4.85:1 | Pass |
| Subtle text on the page horizon | `#9497B8` | `#0e1848` | 5.94:1 | Pass |
| Subtle text on a glass card at the horizon | `#9497B8` | `#1c203e` | 5.57:1 | Pass |

## Typography

- **Pairing**: the system stack of the brand file, as in direction 01 (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`), weights 400 and 600, `tabular-nums` on every amount. Chosen by the owner over a dedicated font (Mona Sans was tried first). A stack has no variable width and only two reliable weights, so the wide titles and light figures of the first version are gone.
- **Scale**: display 40 to 72 px, title 26 to 38 px, figures 44 to 76 px at weight 400.
- **Payload**: 0 KB, no font file.
- **Trade-off**: renders as SF Pro on Apple devices, Segoe UI on Windows; only macOS was seen.

## Icons

Phosphor **light**, 18, 22 and 26 px (one step larger than the regular directions so the thin stroke stays legible); avatars are rounded squares, as the icon buttons of 02. Static SVG files copied from `@phosphor-icons/core` 2.1.1 into `../../assets/icons/phosphor/` (with its MIT `LICENSE`), drawn with CSS `mask` so they take `currentColor`. No icon font, no sprite request, no npm dependency.

## Glow

One recipe, tokenised in layer 4 of `tokens.css`:

| Token | Value |
| --- | --- |
| `--glow-color` | Cobalt `#3360FF` |
| `--glow-blur` | 44 px |
| `--glow-spread` | -6 px |
| `--glow-opacity` / `--glow-opacity-hover` | 60 % / 80 % |
| `--glow` (formula in `../shared/base.css`) | `0 0 blur spread color-mix(in srgb, color opacity, transparent)` |

Three placements, never more on one screen: the hero balance card, the primary action (`data-glow` on the button), and the real line of the chart (`drop-shadow` 6 px, 90 %), as in 02; today's point has no glow so the count stays at three. No text gradient, no decorative blurred blob.

## Motion

Fluid: `cubic-bezier(0.22, 1, 0.36, 1)`, a soft spring with 3.5 % overshoot, entrance with a 6 px blur that clears.

| Token | Value |
| --- | --- |
| Press | 100 ms, scale 0.97 (cards 0.99) |
| Hover and colour | 160 ms, `cubic-bezier(0.22, 1, 0.36, 1)` |
| Base (state changes, expand) | 280 ms |
| Entrance on scroll | 720 ms, `cubic-bezier(0.22, 1, 0.36, 1)`, from 16 px below and a 6 px blur, stagger 70 ms, once, at 12 % visible |
| Chart | real line drawn in 1200 ms, area fades in, planned line and dots after, today's point springs in, one halo pulse |
| Spring | stiffness 190, damping 20, mass 1: settles in 767 ms, 3.5 % overshoot; sampled into a CSS `linear()` easing (`--ease-spring`) |

Micro-interactions (nothing lifts on hover, nothing appears or disappears instantly): every hover is a transition (colour, border, inset layer or opacity); the primary button's hover background is a layer that fades in, because gradients cannot be interpolated, and its glow rises to the hover opacity; buttons and chips press to the scale above and return on the spring; a trailing arrow nudges 3 px sideways on hover; a chip's check grows in when pressed. Transaction rows (native `details`) brighten as a whole tile on hover and the whole tile, open or closed, presses to 0.99. Rows and the data table open and close by animating their height (280 ms, closing at 75 %), the content fading in; filtered rows collapse and fade out or grow back; the masked balance and the card status cross-fade; the form message fades in. Only `transform`, `opacity` and colours are animated (the entrance blur is the one `filter`).

Motion (framer-motion) equivalent, documented only (not installed):

```tsx
const press = { type: "spring", stiffness: 190, damping: 20, mass: 1 };
<motion.button whileTap={{ scale: 0.97 }} transition={press} />
<motion.section
  initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}
  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
  viewport={{ once: true, amount: 0.12 }}
  transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1], delay: index * 0.07 }}
/>
// useReducedMotion(): render the final state, no transition.
```

Reduced motion: under `prefers-reduced-motion: reduce` (or `?motion=reduce` for testing) every transition and animation drops to 0.01 ms, the entrance script does nothing, and nothing is ever hidden.

## What comes from which inspiration

| Reference | Taken | Not taken |
| --- | --- | --- |
| 01 lime dots | One vivid element per screen | Lime, density |
| 02 blue glass | Ink page, translucent cards told apart by a hairline, cobalt primary button with a lighter outline, glowing line over a strong fading area, small-radius buttons, a vivid gradient object | Third-party logos, browser chrome |
| 03 onboarding | Striped gradient phone header | Magenta, orange |

## Verification

Measured in the T3 Code integrated browser (Chromium, macOS), page served on loopback, on 2026-11-08:

- 1440 x 900 and 375 x 812: `scrollWidth` equal to the viewport, no element past the right edge (a narrow overflow of the components card, caused by a `nowrap` figure, was found at 375 px and fixed).
- Text contrast of every visible text node against its composited solid background: 157 texts at 1440 px, none below its threshold; lowest on a solid background 5.65:1 (white on the active chip). Text over gradients cannot be composited by that script, so it was measured separately at the worst stop (table above).
- Glow: at most 3 elements carrying `data-glow` intersect any 900 px tall viewport (sampled every 100 px), 2 at 375 px.
- Every button, link, summary and field is at least 44 x 44 px (radio inputs excluded: their 44 px target is the label).
- Focus: `:focus-visible` draws a 2 px ice outline, offset 2 px.
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
- The palette's status colours (success, warning, error) are proposals.
- Dark theme only: a light theme is not designed (the roadmap lists the theme question for M2).
- The brand name is coined and was not checked for trademarks.
