# Decisions

One line per choice, with the evidence that justifies it. Reference IDs are those of [00-reference-audit.md](00-reference-audit.md) (`01` to `03`, then capture times such as `07:20`). `DOMAIN` and `PRODUCT` point to `docs/DOMAIN.md` and `docs/PRODUCT.md`. "Owner" means a decision taken by the owner during review.

Version 0.6 (12 Nov 2026): the owner's answers to the open points of the integration plan. Phosphor icons, a Settings page, an interim phone tab bar, Credit and Debit for balances, the import review as a page, a step for a transfer above a ceiling, the chart without planned items, a WOFF2 font, the migration in one pull request, `src/app/tokens.css` as the source after integration.

Version 0.5 (12 Nov 2026): motion. The owner asked for it, with the `motion` library, on states, floating layers, the add-transaction flow, the chart and pages; reduced motion turns it all off; content rendered by the server never starts in a hidden state that would make the page jump.

Version 0.4 (12 Nov 2026): the wordmark redrawn in Host Grotesk, a `shadow-raised` token, `font-mono` set to the text face, the token names kept, U+202F in the shipped font, and the wide layout of the add-transaction flow.

Version 0.3 (11 Nov 2026): Host Grotesk as the text face, a lighter dark control border, interaction tokens, the components, the add-transaction flow, the React trajectory chart, the Tailwind mapping, the appearance setting and the app icons. [DESIGN.md](DESIGN.md) is the specification that applies these decisions to the app.

Version 0.2 (11 Nov 2026). Version 0.1 (symbol "Pivot d", hand-drawn wordmark, no gradient) was rejected by the owner: misaligned bottoms, a visible seam between the half-circle and the bar, a wordmark with uneven spacing, and no graphic signature from the references.

## Brief

| Item | Content | Justification |
| --- | --- | --- |
| Positioning | A forward-looking personal budget, run on your own server, for people who want the next months to be legible. | PRODUCT, "Vision and essence" and "Target user" |
| Promise | See ahead, without guessing. | PRODUCT, idea 1 |
| Tone | Exact. Calm. Forward. | Exact: DOMAIN invariants 1 and 9. Calm: the flat product UI of 01, 08:16, 11:54. Forward: the name and the trajectory view |
| Must never evoke | Trading and speculation, luck, gamified saving, a bank's corporate shield, neon glow | DOMAIN (no estimation outside simulations); the glowing stock charts of 02 and 11:01; fintech clichés (logo-design library, payments-fintech summary). One exception asked by the owner: a soft halo on the trajectory lines, kept low (see Trajectory chart) |

## Symbol exploration

| Round | Direction | Result |
| --- | --- | --- |
| 1 | Pivot d, Today D, Overflow (`concepts/`) | Rejected by the owner (see above) |
| 2 | **A. Aube** (`concepts/round-2/concept-a-aube-*`) | **Selected by the owner**, with a gap added between the stem and the half-circle at the owner's request |
| 2 | B. Futurs: lowercase d with concentric rings | Rejected: reads as a target or a radar, rings merge at 16 px |
| 2 | C. Tuile: Neue Montreal d on a holographic tile | Not selected: a font letter, less ownable; it remains the strongest app-icon option if the owner reconsiders |
| 2 | Aube gap studies (`concepts/round-2/aube-w*-g*`) | Gap 16 closes at 16 px; gaps 24 and 32 stay open; 24 kept as the best balance with a 40 stem |

### Selection criteria, round 2 (out of 5)

| Criterion | A | B | C | How it was judged |
| --- | --- | --- | --- | --- |
| Distinctiveness | 4 | 2 | 3 | Against the payments-fintech conventions of the logo-design library |
| Legible at 16 px | 5 | 3 | 5 | True-pixel canvas test in the T3 browser |
| One colour | 4 | 3 | 5 | A is a plain D without the gap; the gap makes it ownable in one colour |
| Reference fit | 5 | 3 | 5 | A carries the holographic blur of 11:54 and 12:21 and the ink of the product UI |

## Logo construction

| Choice | Value | Justification |
| --- | --- | --- |
| Idea | Ink stem = what is real; gap = today; holographic half-disc = what comes, still an estimate | DOMAIN invariant 9 (the real trajectory contains no estimate) and the owner's request for the blur |
| Grid | 256 units | logo-design skill |
| Stem | 40 x 208 | 2.5 px at 16 px, above the 1/48 detail floor of the skill |
| Gap | 24 | Stays open at 16 px (tested); 0.6 x the stem |
| Half-disc | Right half of a circle of radius 104, diameter = stem height | Top and bottom on exactly the same lines as the stem, no overshoot (owner: the bottoms must align) |
| No seam | Monochrome variants are one path; colour variants put the stem and the half-disc in separate fills with a real gap between them | The seam of v0.1 came from two shapes touching; the gap removes any contact |
| Optical centre | 4 units left of the geometric centre, for the symbol on its own grid | The half-disc carries most of the mass (skill, optical corrections). Inside a tile the opposite holds, see App icon |
| Colour version | Ink stem, half-disc filled with the holographic gradient (blue to aqua to sand, with sky, rose and peach fields) | Graphic signature, see below |
| Colour reverse | White stem, same half-disc | For dark grounds and the app icon |
| On a holographic surface | Ink version (stem and half-disc in ink) | The gradient half-disc disappears on its own family of colours (found in the browser check of the header) |
| Black, white, mono | One flat colour, one path | Print and single-colour use; mono is the today blue `#3555f6` |
| Favicon | 16 px cut: stem 3, gap 2, half-disc of radius 7, from y 1 to 15, all on whole pixels; the stem turns white in dark mode | The master scaled to 16 px puts edges on half pixels (blurred in the test) |
| App icon | Colour reverse symbol on a `#090909` tile with a 20 % radius; symbol 56 % of the tile height, centred vertically, 16 px right of its box centre at 512 (3.125 % of the tile, scaled with it) | App-icon tiles of 12:59 and 13:19. Owner, by eye: the rounded side reads light, so a box-centred mark looks left; 6.7 px (area centroid) to 14 px were still short, 16 px approved |
| App icon files | `icons/icon-192.png` and `icon-512.png` (rounded tile, transparent corners); `apple-touch-icon.png` 180 and `icon-maskable-512.png` (square tile, no alpha: the platform applies its mask); sources `logo/app-icon.svg` and `logo/app-icon-full-bleed.svg`; `icons/manifest.ts` | Rendered by the browser engine from the SVG sources at each exact size. The maskable symbol reaches 0.380 of the size, inside the 0.40 safe circle |
| Wordmark | "demain" in Host Grotesk Medium (weight 560), converted to outlines with fontTools from the shipped variable file, tracking -0.02 em; the face has no kerning pair for these six letters. 800 units wide at 256 tall (Neue Montreal: 786). Until 12 Nov 2026 it was set in Neue Montreal Medium | Owner, 12 Nov 2026: redraw it in Host Grotesk rather than license Neue Montreal for a logo. The app's own face, free to ship; -0.02 em is the heading tracking, which also keeps the density of the earlier wordmark |
| Horizontal lockup | Symbol top on the d ascender, symbol bottom on the baseline, gap between symbol and word = 0.40 x the symbol height | Shared top and bottom lines; 0.45 looked loose in the render |
| Vertical lockup | Symbol over the wordmark at half scale, 36 units apart, both centred | Square placements |
| Clear space | Twice the gap on every side | A logo element, so it scales with the mark |
| Minimum size | Symbol 16 px (favicon cut below 24 px); horizontal lockup 96 px wide | Smallest sizes that passed the browser test |

## Graphic signature: the holographic blur

| Choice | Value | Justification |
| --- | --- | --- |
| Family | Sky `#6eb1f8`, blue `#9ac6f8`, aqua `#bbebf6`, rose `#f2cee1`, peach `#f1b28d`, sand `#f9e1cf`, cream ground `#f9f6e4` | Sampled in 12:21, 11:54, 12:47 (audit addendum). Owner chose this family over the violet and coral of the Pulse screens |
| Lilac left out | `#c6c7f5` not used | Keeps away from the generic violet-to-blue gradient excluded at the start |
| Rendering | Radial colour fields over a linear blue-to-sand base, blurred with `filter: blur(28px)` inside a clipped card | The fields of 11:54 and 12:21 are soft and bleed into each other |
| Meaning | The blur means "not real yet": simulations, scenarios, estimates, and brand moments (header, empty states, onboarding, the half-disc) | DOMAIN: estimates exist only in simulations; the real trajectory stays sharp |
| Never | Behind a real balance, a transaction or a chart of real data; as a glow around an element; under text other than ink | Glow excluded at the start; contrast (muted grey fails on the blur) |
| Text on the blur | Ink only (`--color-on-holo`), in both themes | 8.88:1 or more on every stop; `#616163` falls to 2.74:1 on sky |
| Estimate tag | Translucent white pill "Estimate" on simulation cards | Says it in words, not by colour alone |

## Palette

Every primitive keeps a hue sampled in the references. Where the sampled value failed WCAG AA, only the lightness was changed, and the original is named.

| Token | Value | Source | Adjustment |
| --- | --- | --- | --- |
| `--gray-0` | `#ffffff` | 07:20, 08:25, 12:47 card | none |
| `--gray-50` | `#f0f0f0` | 07:20 inner card | none |
| `--gray-100` | `#ebebeb` | 07:07, 07:32, 08:25 ground | none |
| `--gray-200` | `#dcdcdc` | 08:25 panel | hairline only |
| `--gray-500` | `#838383` | 06:44 label grey | fails as text, used for control borders (3.18:1 min) |
| `--gray-600` | `#616163` | 07:20 caption | none; replaces the failing greys of 07:07, 07:32, 06:44 |
| `--gray-800` | `#2e2e30` | one tone step up from `--gray-950` | hover and pressed state of the ink button (light theme) |
| `--gray-950` | `#080808` | 07:07 headline | none |
| `--night-0` to `--night-4`, `--night-8` | `#090909`, `#161616`, `#1c1c1c`, `#212121`, `#242424`, `#ababab` | 11:41, 01, 11:01, 12:59 | none |
| `--night-5` | `#2e2e2e` | one tone step up from `--night-4` | hover of a dark control |
| `--night-6` | `#727272` | 10:47 disc `#414141` | lifted to 3.2:1 on the dark control tone `--night-4`. It was `#676767`, which passed on the card (3.20:1) but gave only 2.74:1 against the field's own fill, so a dark field had no visible edge |
| `--blue-600` | `#3555f6` | 12:59, 13:19 `#3c5bf6` | darkened to 4.66:1 on `#ebebeb` |
| `--blue-400` | `#6f85f6` | 13:54 `#5973f5` | lightened to 4.70:1 on `--night-4` |
| `--green-700`, `--green-400` | `#3c7350`, `#70ce64` | 07:20 `#4d9366` darkened; 10:47 | as noted |
| `--red-700`, `--red-300` | `#bf3924`, `#e38388` | 08:25 `#e17261` darkened; 13:08 | as noted |
| `--amber-700`, `--amber-300` | `#826313`, `#eac86f` | 13:08 `#eac86f` darkened; 13:08 | as noted |
| State tints | `#e4f9f3`, `#f3e5d8` (11:54), others 12 to 16 % mixes | 11:54, 01 | as noted |
| `--holo-*` | see signature | 12:21, 11:54, 12:47 | none |
| Accent role | The blue marks today (chart rule and pill), focus and links; navigation selection is ink or white, so blue keeps one meaning | One saturated colour per screen: 02, 12:59, 13:19. The symbol no longer uses it: its "today" is the gap | none |
| Primary action | Ink | 06:44, 08:16, 12:21, 13:28 | none |
| States never by colour alone | Sign, word or position | 01, 02, 07:32, 11:54, 13:08; DOMAIN | none |

### Interaction tokens

Added with the components. Each one is a semantic token with a light and a dark value, so a state never hardcodes a colour.

| Token | Light | Dark | Use | Justification |
| --- | --- | --- | --- | --- |
| `--color-primary-hover` | `--gray-800` | `--gray-200` | Hover and pressed fill of the ink button | One tone step, faded over `--motion-duration-state` (see Motion) |
| `--color-control-hover` | `--gray-200` | `--night-5` | Hover of a secondary button, a keypad key, an icon button, a field's reveal button | Same rule |
| `--color-danger`, `--color-on-danger` | `--red-700`, `--gray-0` | `--red-300`, `--night-0` | Fill and label of the confirm button of a destructive action, only inside its dialog | Red stays rare, so it keeps its meaning |
| `--color-backdrop` | `rgb(8 8 8 / 0.45)` | `rgb(0 0 0 / 0.6)` | Behind a modal dialog | Dims the page without hiding where the user was |

### Contrast (computed, WCAG 2.x relative luminance)

Every pair is computed from the tokens in both themes. The three pages compute their own pairs live in the browser. The values below were recomputed from `tokens.css` with the same formula: 74 pairs per theme, 148 in total, 0 below threshold. Text needs 4.5:1; borders, rings, marks and chart lines need 3:1. Holographic pairs are the same in both themes.

#### Brand board (`brand-board.html`)

| Use | Foreground on background | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| Body text | `--color-text` on `--color-surface` | 4.5 | 20.03 | 18.10 |
| Body text on ground | `--color-text` on `--color-bg` | 4.5 | 16.80 | 19.91 |
| Muted text | `--color-text-muted` on `--color-surface` | 4.5 | 6.18 | 7.88 |
| Muted text on ground | `--color-text-muted` on `--color-bg` | 4.5 | 5.18 | 8.67 |
| Muted text on inner surface | `--color-text-muted` on `--color-surface-sunken` | 4.5 | 5.42 | 7.42 |
| Primary button | `--color-on-primary` on `--color-primary` | 4.5 | 20.03 | 19.91 |
| Link and accent text | `--color-accent` on `--color-surface` | 4.5 | 5.55 | 5.48 |
| Accent text on ground | `--color-accent` on `--color-bg` | 4.5 | 4.66 | 6.03 |
| Idle segment | `--color-text-muted` on `--color-control` | 4.5 | 5.42 | 6.76 |
| Count badge | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Tooltip | `--color-surface` on `--color-text` | 4.5 | 20.03 | 18.10 |
| Label on accent | `--color-on-accent` on `--color-accent` | 4.5 | 5.55 | 6.03 |
| Text on holo sky | `--color-on-holo` on `--holo-sky` | 4.5 | 8.88 | 8.88 |
| Text on holo blue | `--color-on-holo` on `--holo-blue` | 4.5 | 11.26 | 11.26 |
| Text on holo aqua | `--color-on-holo` on `--holo-aqua` | 4.5 | 15.57 | 15.57 |
| Text on holo rose | `--color-on-holo` on `--holo-rose` | 4.5 | 14.01 | 14.01 |
| Text on holo peach | `--color-on-holo` on `--holo-peach` | 4.5 | 10.96 | 10.96 |
| Text on holo sand | `--color-on-holo` on `--holo-sand` | 4.5 | 15.93 | 15.93 |
| Positive amount | `--color-positive` on `--color-surface` | 4.5 | 5.58 | 9.22 |
| Positive pill | `--color-positive` on `--color-positive-tint` | 4.5 | 5.09 | 6.81 |
| Negative amount | `--color-negative` on `--color-surface` | 4.5 | 5.49 | 6.78 |
| Negative pill | `--color-negative` on `--color-negative-tint` | 4.5 | 4.58 | 5.30 |
| Warning text | `--color-warning` on `--color-surface` | 4.5 | 5.61 | 11.19 |
| Warning pill | `--color-warning` on `--color-warning-tint` | 4.5 | 4.54 | 7.87 |
| Control border | `--color-border-control` on `--color-surface` | 3 | 3.79 | 3.76 |
| Control border on ground | `--color-border-control` on `--color-bg` | 3 | 3.18 | 4.14 |
| Focus ring | `--color-focus` on `--color-bg` | 3 | 4.66 | 6.03 |
| Today line | `--chart-today` on `--color-surface` | 3 | 5.55 | 5.48 |
| Real line | `--chart-real` on `--color-surface` | 3 | 20.03 | 18.10 |
| Planned line | `--chart-planned` on `--color-surface` | 3 | 6.18 | 7.88 |
| Logo stem | `--logo-ink` on `--color-bg` | 3 | 16.80 | 19.91 |

#### Components (`components.html`)

| Use | Foreground on background | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| Field text | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Placeholder | `--color-text-muted` on `--color-control` | 4.5 | 5.42 | 6.76 |
| Hint | `--color-text-muted` on `--color-surface` | 4.5 | 6.18 | 7.88 |
| Field border | `--color-border-control` on `--color-surface` | 3 | 3.79 | 3.76 |
| Field border on its fill | `--color-border-control` on `--color-control` | 3 | 3.33 | 3.23 |
| Read-only border on card | `--color-border-control` on `--color-surface` | 3 | 3.79 | 3.76 |
| Focus ring on card | `--color-focus` on `--color-surface` | 3 | 5.55 | 5.48 |
| Focus ring on field | `--color-focus` on `--color-control` | 3 | 4.87 | 4.70 |
| Focus ring on ground | `--color-focus` on `--color-bg` | 3 | 4.66 | 6.03 |
| Error text | `--color-negative` on `--color-surface` | 4.5 | 5.49 | 6.78 |
| Invalid border | `--color-negative` on `--color-control` | 3 | 4.82 | 5.82 |
| Checked box | `--color-primary` on `--color-surface` | 3 | 20.03 | 18.10 |
| Check mark | `--color-on-primary` on `--color-primary` | 3 | 20.03 | 19.91 |
| Primary hover | `--color-on-primary` on `--color-primary-hover` | 4.5 | 13.55 | 14.52 |
| Secondary | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Secondary hover | `--color-text` on `--color-control-hover` | 4.5 | 14.60 | 13.58 |
| Disabled label | `--color-text-muted` on `--color-surface-sunken` | 4.5 | 5.42 | 7.42 |
| Destructive button | `--color-on-danger` on `--color-danger` | 4.5 | 5.49 | 7.46 |
| Success word | `--color-positive` on `--color-surface` | 4.5 | 5.58 | 9.22 |
| Toast disc mark | `--color-positive` on `--color-positive-tint` | 3 | 5.09 | 6.81 |
| Error disc mark | `--color-negative` on `--color-negative-tint` | 3 | 4.58 | 5.30 |
| Warning notice text | `--color-text` on `--color-warning-tint` | 4.5 | 16.22 | 12.73 |
| Warning word | `--color-warning` on `--color-warning-tint` | 4.5 | 4.54 | 7.87 |
| Row hover | `--color-text` on `--color-surface-sunken` | 4.5 | 17.57 | 17.04 |
| Active option | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Today in calendar | `--color-accent` on `--color-surface` | 4.5 | 5.55 | 5.48 |
| Chosen day | `--color-on-primary` on `--color-primary` | 4.5 | 20.03 | 19.91 |

#### Add-transaction flow (`form-proposals.html`)

| Use | Foreground on background | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| Tile text on expense tint | `--color-text` on `--color-negative-tint` | 4.5 | 16.71 | 14.16 |
| Tile text on income tint | `--color-text` on `--color-positive-tint` | 4.5 | 18.26 | 13.36 |
| Expense tile border | `--color-negative` on `--color-surface` | 3 | 5.49 | 6.78 |
| Income tile border | `--color-positive` on `--color-surface` | 3 | 5.58 | 9.22 |
| Expense icon in its disc | `--color-negative` on `--color-negative-tint` | 3 | 4.58 | 5.30 |
| Income icon in its disc | `--color-positive` on `--color-positive-tint` | 3 | 5.09 | 6.81 |
| Today chip ring | `--color-accent` on `--color-surface-sunken` | 3 | 4.87 | 5.16 |
| Out icon on segment | `--color-negative` on `--color-control` | 3 | 4.82 | 5.82 |
| In icon on segment | `--color-positive` on `--color-control` | 3 | 4.90 | 7.91 |
| Later chip text | `--color-text` on `--color-warning-tint` | 4.5 | 16.22 | 12.73 |
| Later icon | `--color-warning` on `--color-warning-tint` | 3 | 4.54 | 7.87 |
| Chip and keypad text | `--color-text` on `--color-surface-sunken` | 4.5 | 17.57 | 17.04 |
| Selected chip | `--color-on-primary` on `--color-primary` | 4.5 | 20.03 | 19.91 |
| Minus on the amount field | `--color-negative` on `--color-control` | 3 | 4.82 | 5.82 |
| Plus on the amount field | `--color-positive` on `--color-control` | 3 | 4.90 | 7.91 |
| Muted segment label | `--color-text-muted` on `--color-control` | 4.5 | 5.42 | 6.76 |

## Typography

| Choice | Value | Justification |
| --- | --- | --- |
| Family | Host Grotesk, one variable file (weight axis 300 to 800), for headings, text, figures and controls | Owner's choice, among ten open neo-grotesks measured against Neue Montreal (the face named in 13:54). Instrument Sans was the other finalist; the owner found Host Grotesk better, and its files were removed |
| Licence | SIL Open Font License 1.1, no reserved font name, `fsType` 0: it can ship in the app and its Docker image, and be subset or extended | `fonts/OFL-HostGrotesk.txt`. Neue Montreal is a commercial face whose licence for an open source app is unknown |
| Proportions | x-height 0.496 em, cap height 0.700 em, x-height / cap 0.709, stem / cap 0.129; Neue Montreal: 0.510, 0.715, 0.713, 0.126 | Measured with fontTools. Lowercase is wider (1.050 against 0.938 of the x-height), so text reads a little more open |
| Weights | Regular 400, Medium 560, Bold 800 | Stem / cap height matched to Neue Montreal: 0.129 against 0.126 (Regular), 0.166 against 0.166 (Medium). 800 is the axis maximum (0.200; Neue Montreal Bold is 0.252) |
| Figures | Always tabular in this face: `tabular-nums` changes nothing, columns of amounts line up by default | Measured: every figure has the same advance |
| French thousands separator | The shipped file maps U+202F (narrow no-break space, used by `Intl` in French) to the face's thin space, U+2009, 0.15 em; the upstream file has no glyph for it | Owner's decision, 12 Nov 2026. Without it the browser borrowed the space from a fallback face, and its width depended on the system (15.4 px against 20 px in a serif fallback, for 100 px text; 15.0 px now). The `Intl` output stays standard and no code replaces it. A `cmap` entry only: no new glyph, so the variation tables are untouched |
| Wordmark | Host Grotesk Medium outlines, like the text | Owner, 12 Nov 2026 (see Logo) |
| Monospace | None: `font-mono` sets Host Grotesk | Owner, 12 Nov 2026. Its figures are already tabular, the usual reason for a monospace face. The two uses in `src/` show the TOTP secret and the backup codes, both base32 (A to Z, 2 to 7): the alphabet has no 0, 1, 8 or 9, so no monospace is needed to tell O from 0 or I from 1 |
| Fallback stack | "Helvetica Neue", Helvetica, Arial, sans-serif, after Host Grotesk | Closest neo-grotesks commonly installed |
| One family only | No display serif | The italic serifs of 11:41, 12:59, 13:54 are case-study titles |
| Amounts | Regular, tabular figures, minor units dimmed, sign written | 01, 07:20, 08:25, 11:01; 11:01, 12:21, 12:59, 13:28 |
| Labels | 12 px uppercase, 0.06 em tracking, medium; written in sentence case and uppercased by CSS | 07:20, 08:25; accented capitals (À, É) stay correct in French |
| Scale | 12, 13, 15, 20, 28, 36, 56 px; line height 1.45 up to 20 px, 1.1 from 28 px; tracking -0.02 em from 20 px | 07:20, 01, 08:03 |

## Grid, space, radii, elevation, icons

| Choice | Value | Justification |
| --- | --- | --- |
| Spacing | 4 px grid; card padding 24, card gaps 16; inside the narrow app mock, card padding 16 and gaps 12 | 01, 08:25, 08:16 |
| Mobile | One column under 768 px, 16 px side margin | 07:32, 10:47, 12:59 |
| Radii | Card 20, control 12, tile 20 %, pill fully rounded | Measured, see audit |
| Elevation | Tone only for cards; one soft wide shadow for floating layers; one small tight shadow, `--shadow-raised` (`0 1px 2px`, 8 % black in light, 40 % in dark), for a control lifted from its own track, today the selected type segment | 01, 07:20, 08:25, 11:01; 12:47. Raised: owner, 12 Nov 2026, "relief by shadow must be possible in some cases"; the dark value is stronger so the relief still shows on a dark track |
| Touch target | 44 px | Owner's accessibility rules |
| Motion tokens | Five durations, three easings, two offsets (see Motion) | Owner, 12 Nov 2026. Until then none were defined, since the references are still images |
| Icons | Phosphor Icons, Regular weight, through `@phosphor-icons/react`, 20 px, in a neutral disc; diagonal arrows for money in and out. Until 12 Nov 2026, hand-drawn line icons (1.5 stroke, round ends, 24 grid) | Owner, 12 Nov 2026: one maintained set rather than drawing each icon, including the navigation ones that were missing. Regular keeps the round ends and the light line of the references (13:19, 11:54, 12:47, 01, 10:47, 12:59); at 20 px its stroke is 1.25 px, judged on `components.html` |

## Components

Drawn on `components.html`, which also holds the add-transaction flow and the custom pickers. Each control keeps the behaviour the app already has (labels, linked errors, native dialog, toasts that name their kind); shape and colour are new.

| Choice | Value | Justification |
| --- | --- | --- |
| Button hierarchy | Ink primary, one per screen; neutral secondary on the control tone; text link for a third action; red only on the confirm button inside a destructive dialog | 06:44, 08:16, 12:21 (ink primary), 12:21 (neutral secondary), 13:19 (text action) |
| Button shape | Pill, 44 px tall, 16 px side padding, medium weight | 01, 07:32, 13:19 pills; 44 px target |
| Hover and pressed | One tone step (`--color-primary-hover`, `--color-control-hover`), faded over `--motion-duration-state`; the link thickens its underline | The tone says it; size and position never change, so nothing under the pointer shifts |
| Disabled | Explicit colours (muted text on the inner surface), never opacity | Opacity cannot be measured; these pairs pass 4.5:1 |
| Pending | Keeps its fill, the label becomes the ongoing verb ("Adding…"), `aria-busy="true"` | The button does not jump; assistive tech hears the state |
| Field anatomy | Label above, hint under the label, control, error under the control; the hint and the error are linked with `aria-describedby` | The app's `FormField`; long labels of today ("Amount (without a sign, the type sets the direction)") split into a short label and a hint |
| Field shape | 48 px tall, control tone fill, 1 px border at 3:1, control radius 12, 12 px side padding | 48 px like the table rows (01). Tone alone gives 1.1:1, so the border shows where the field is |
| Field states | Hover: border in ink. Focus: border in ink and a 2 px blue ring, 2 px offset. Invalid: 2 px red border and a message that starts with "Error:" and an alert icon. Disabled: inner surface, hairline border, muted text. Read-only: no fill, 3:1 border, ink text, still focusable | Focus is the only place besides today where blue appears; colour is never alone |
| Exact syntax | A field that expects an exact syntax refuses any other character as it is typed, pasted or dropped, says why in a polite live message, and flags an incomplete value when it is left. The server applies the same rule and stays the authority | Owner's rule. Amount: digits and one comma or point, decimals of the currency, spaces of a paste removed. Currency code: three letters, uppercased |
| Pickers | Custom select (WAI-ARIA select-only combobox) and date picker (dialog with a grid), drawn with the tokens; the browser's own pickers are not used | Owner's request. Full keyboard support: arrows, Home, End, Page Up and Down, Shift with Page for a year in the calendar, type-ahead in the list, Escape |
| Picker details | Options 44 px with a check on the selected one; calendar 332 px wide, 44 px round days, centred under its field, today with a blue ring and blue text, chosen day filled in ink, no hover on the chosen day | Owner: the selected date must not react to hover |
| Pickers without JavaScript | The server renders the native control; the script swaps it on load | The app's forms post without JavaScript today |
| Checkbox | 20 px box in a 44 px row, 6 px radius, 1.5 px border; checked is ink with a white tick | Blue already means today |
| Segmented control | Pill track on the control tone, 44 px segments; the selected segment is ink (the appearance setting) or raised on white (the transaction type, whose icons carry red and green) | 07:32 segmented control, 06:44 |
| Password | A 44 px icon button inside the field shows or hides the value, with one fixed label and `aria-pressed` | Owner's request; a changing label would be announced as a new control |
| File | The native input stays, hidden visually; a secondary button "Choose a file" and the file name show it | Keeps the native picker and its accessibility |
| Disclosure | Native `details`, 44 px summary between two hairlines, chevron turns on open | Rare options wait without leaving the page |
| Toast | Surface card, card radius, overlay shadow, tinted disc with the icon, the kind in words ("Success.", "Error."), a 44 px close button. Text sits in a slot two lines tall: one line centred, two lines fill it, more lines grow downwards with the disc and the button level with the first two. A success leaves after 8 seconds unless pointed at or focused; an error stays | Owner: one line centred, two lines centred on both, further lines must not shift the design |
| Notice | Warning tint, ink text, "Warning:" in the warning colour | The word says it, the colour repeats it |
| Empty state | Inner surface, centred text in muted, one secondary action | 11:54 empty states; voice rule "what to do" |
| Dialog | The native `dialog`, card radius, overlay shadow, backdrop token; Cancel takes the focus first, Escape closes, the destructive action is on the right | The app's `ConfirmActionButton` |
| Table | 48 px rows, hairlines between rows, uppercase label headers, figures right-aligned; a row hovers to the inner surface; income has a plus sign and the positive colour, expenses stay ink with their minus; status words in pills | 01, 11:54, 13:08 |
| Phone tab bar | Four destinations in a 343 px pill track, 52 px items, selected item in ink | 07:32. Width test: the longest candidate French label, "Vue d’ensemble" (77 px at 12 px), still fits the 80 px item; the page uses "Aperçu" |
| Settings page | `/settings` holds Appearance and Language, then links to Security and Backup; the sidebar ends with it | Owner, 12 Nov 2026: the sidebar of the board already ends with Settings, and the app had no such page |
| Phone tab bar, interim | Overview, Transactions, Accounts, Imports until Calendar (M2) and Simulations (M3) exist | Owner, 12 Nov 2026: the four most frequent tasks of M1; the planned destinations take their places when they land |
| Balance side | A balance that can be negative is typed without a sign, with a Credit or Debit segmented control | Owner, 12 Nov 2026, preferred to a minus sign: the amount keeps one syntax everywhere, and the side is a word, not a character |
| Import review | A page of its own instead of an 80rem dialog | Owner, 12 Nov 2026: a dialog stays at 420 px for a confirmation; a review needs a page |
| Transfer above a ceiling | A step in the add-transaction flow: what fits, what does not, where the surplus goes (another account, or kept in the source), a button that says the result | Owner, 12 Nov 2026, to keep transfers in the flow. DOMAIN: a manual transfer shows the split and lets the user choose. The server keeps computing the split |
| Appearance setting | System, Light, Dark as a segmented control of native radios, posted like the language switcher; stored in a `theme` cookie and rendered on the server as `data-theme` on `<html>` (no attribute for System) | Owner: the app has a light and dark setting. Server rendering means no flash of the other theme and no script |

## Add-transaction flow

Retained by the owner on 11 Nov 2026 from three proposals (`form-proposals.html`): A, one screen; B, three steps; C, a quick sheet with a keypad. The retained flow is also on `components.html`, in place of the old one-screen form.

| Choice | Value | Justification |
| --- | --- | --- |
| Goal | A usual expense needs only the amount, and a label if wanted: everything else has a default | Owner: simplify what the user enters, with colours and icons that are understood without reading |
| Three steps | 1. How much? 2. What for? 3. Check and save. A three-segment progress bar and "Step 1 of 3" read aloud | Proposal B's rhythm; one question per screen fits a phone |
| Step 1, from C | Type segments Out, In, Move, Interest with their icons; the amount in display size (56 px) with its sign drawn from the type (red minus, green plus); a 3 x 4 keypad of 52 px keys | Owner: keep C's start. The keypad can only produce a valid amount |
| Typed amount | The display is also a text field: it can be typed with a keyboard, keeps the same look and follows the same exact-syntax rule; it grows with its content | Owner: type the price by hand without changing C's display |
| Step 2, from B, unchanged | "What was it?" with suggestions from history (dashed chips), then a grid of category chips with icons, "Later" first | Owner: B's step 2 as it is. Picking a suggestion fills the category through the existing categorization rule, and says so |
| "Later" | An explicit category chip in amber: the transaction goes to the to-categorize queue | The app already queues uncategorized transactions; the user now sees it |
| Step 3, editable in place | Recap rows (amount and type, label and category) with "Edit", which opens the editor in the row; "Done" closes it and returns the focus | Owner: editing must not go back to an earlier step |
| When | Chips Today (blue ring while not chosen), Yesterday, and "Pick a date", which opens the date picker component | Owner: the calendar of the date picker component |
| Account | Account chips; a transfer replaces them with From and "To, the account that receives", and the From account is disabled in To | Owner: a transfer must choose the receiving account; the same account cannot be both |
| More details | Note and payment mode (Card, Transfer, Direct debit) inside a disclosure on step 3 | Owner: "More details" on step 3; rare fields stay out of the way |
| Colour meanings | Red and a down-right arrow for money out; green and an up-right arrow for money in; ink for a chosen chip; amber for Later; blue only on the Today chip | One meaning per colour, as in the identity |
| Save button | Says what will happen: "Add expense of €42.00"; a transfer names its destination, "Move €42.00 to Savings A" | Voice rule: a verb and an object |
| Wide layout | From 760 px of available width, one screen in two columns (amount, label and category on the left; date, account and save on the right), at most 920 px; no keypad, steps or recap; Save checks the amount and the label | Owner: a desktop version of the form. Proposal A (one screen) was the one suited to desktop; on a keyboard, steps only add clicks |

## Trajectory chart

The React reference in `react/` (hand-written SVG with `d3-scale` and `d3-shape`, as ADR-012). It replaces the board's single-total chart: where the board differs, this section wins.

| Choice | Value | Justification |
| --- | --- | --- |
| What it draws | Month-end balance of each account (Checking in ink, Savings in muted grey), real up to today, then dated planned items only | DOMAIN and ADR-011: no estimation in the real trajectory |
| Real and planned | Solid line up to today, dashed (6 5) after; the planned zone sits on the inner surface with "Up to today" and "Planned ahead", hidden when they do not fit | Never colour alone: the dash and the zone say it |
| Series names | Written at the start of each line, with a halo, pushed apart when they collide | A legend far from the line is slower to read; the old "Checking" label collided with the minimum label |
| Zero baseline | Always on the axis, integer ticks only, about four ticks, compact labels (`€12K`, `12 k €` in French) | A balance read from another baseline misleads; same rule as `src/charts/line-chart-geometry.ts` |
| Markers | None at rest; round markers on every series appear only for the month being read (hover or keyboard) | Owner: static points looked machine-made, and every point must be round |
| Glow | A soft halo in each line's own tone (`drop-shadow` 5 px, 40 %), on the two data lines only | Owner's request. It goes against "never a neon glow", so it is kept low; the today rule, the legend and the zone have none |
| Today | Blue rule and a pill on the month axis, sized to its word | 12:59 blue pill; the pill sits where dates are read |
| Lowest planned balance | One direct label, kept inside the planned zone | The figure a forward-looking budget is checked for |
| Month labels | The last month first, then the first, then a rhythm counted from today; never under the Today pill; the first and last aligned on the plot edges | Two labels must never overlap at 375 px |
| Reading | Inverted tooltip (month, kind, value per series), crosshair; arrow keys, Home, End and Escape when focused; focus starts on today; a polite live region announces keyboard and click reads only | 12:47 tooltip; WCAG 2.1.1 |
| Data table | The same months and values, with the kind of each month, under the chart | DOMAIN: every chart has an equivalent data table |
| Width | Drawn at the element's real pixel width, re-measured when the font loads | Text keeps 12 px at every size, no horizontal scroll |

## Implementation

| Choice | Value | Justification |
| --- | --- | --- |
| Tailwind v4 | `tailwind.css` imports Tailwind and `tokens.css`, then declares the names with `@theme inline reference`: utilities read the tokens (`bg-surface` gives `var(--color-surface)`) and the values exist only in `tokens.css` | One source of values; the dark theme follows without `dark:` |
| Default theme removed | Tailwind's palette, sizes, weights, radii and shadows are reset: only identity values compile | An off-system class fails to build instead of shipping |
| Spacing | Not mapped: Tailwind's 0.25rem step is the 4 px grid (`p-6` is 24 px, `min-h-11` is 44 px) | Nothing to translate |
| `dark:` variant | Same selectors as `tokens.css` (system preference unless `data-theme="light"`, or `data-theme="dark"`) | Should almost never be needed |
| Checked | 41 utilities compared with their token in six states (system light or dark, attribute absent, light or dark): no difference | Browser check of a demo page |
| Theme preference code | `theme/theme-preference.ts` (allowlist, attribute for `<html>`) and `theme/actions.ts` (server action, as `setLocaleAction`), with tests | Reference code: the setting does not exist in `src/` yet |
| Token names | Kept, so utilities read `bg-bg`, `text-text`, `text-text-muted` | Owner, 12 Nov 2026: each utility names its token, at the cost of some repetition |
| Migration | Adopting the mapping is a migration: 40 classes of `src/` stop compiling (`font-mono` now compiles). DESIGN.md lists their replacements. It lands in the same pull request as `tailwind.css` | Counted by compiling `src/` against both stylesheets, 12 Nov 2026. Tailwind drops an unknown class silently, so the build would pass on an unstyled app; owner, 12 Nov 2026: one pull request rather than a transitional stylesheet |
| Font file | A WOFF2 subset of the shipped TTF, with U+202F still mapped to the thin space | Owner, 12 Nov 2026, as DESIGN.md preferred; the mapping is checked after conversion |
| Source of the tokens | `src/app/tokens.css` once integrated; the copy in this folder stays as the reference pages were validated | Owner, 12 Nov 2026: one place to change a value in the app |
| Chart without planned items | Every part is built; the planned parts show only when there is something planned | Owner, 12 Nov 2026: build the chart of DESIGN.md now, it fills in when planned items arrive (M2) |

## Motion

Asked by the owner on 12 Nov 2026, after the plan to apply the identity had kept "Motion: none". The references are still images, so no value can be sampled from them: each one is chosen for its role, as written below, and the owner confirms them on `components.html`. Every motion has one purpose; a motion without one is not added.

| Choice | Value | Justification |
| --- | --- | --- |
| Library | `motion` (npm), behind `LazyMotion`, for what the browser mounts: entrances and exits of layers, flow steps | Owner's choice, among CSS only, the library, or both. Exits need the element to stay until its motion ends, which `AnimatePresence` does. A dependency: added in its own pull request with an ADR |
| CSS for the rest | Transitions for states, keyframes in the stylesheet for what the server renders | They need no JavaScript, keep the server components server-side, and are allowed by the content security policy |
| Nothing rendered by the server starts hidden | No initial state in a `style` attribute or in Motion's `initial` for content in the HTML; `initial={false}` on Motion components rendered by the server | Owner, 12 Nov 2026: the page must never show its final state and then jump. `style-src` carries a nonce only (`src/security-headers.ts`), so a style attribute from the server is blocked, and the state would only arrive with the script |
| State, 120 ms | Hover, press, check, selection fade from one tone to the next | Short enough to read as the answer to the action, long enough to soften a tone step that used to snap |
| Exit 140 ms, enter 200 ms | Layers leave faster than they arrive | What leaves no longer matters; what arrives is read |
| Step 260 ms, offset 24 px | A flow step slides from the side the user goes to | The direction says forward or back; 24 px is visible on a 375 px phone without crossing the screen |
| Draw 600 ms | The trajectory line drawn once, left to right, real then planned | Reads the timeline in its own order, once: the longest motion allowed, so nothing else lasts more |
| Easings | Decelerate in, accelerate out, standard between two states | The usual pairing for things that arrive and leave; no spring, no overshoot, to stay calm |
| Offset 8 px | Layers and pages rise as they fade in | Says where the layer comes from without travelling |
| Reduced motion | Every duration and offset at 0, fades included | Owner's rule: motion is off under reduced motion, not merely softened. Nothing carries meaning through motion alone (WCAG 2.3.3) |
| Never | Counting figures, bounce, parallax, scroll motion, loops, motion on the holographic signature or the chart glow, input that waits for a motion | A real amount is shown as it is (principle 1); a loop or an autoplay over 5 seconds would need a pause control (WCAG 2.2.2) |
| Tailwind | Default easings and animations reset; `transition-*` utilities read the state tokens | An off-system easing fails to compile, like an off-system colour; `duration-*` still compiles and is refused in review |

## Voice, five rules

| Rule | Justification |
| --- | --- |
| Say what is real and what is planned | DOMAIN invariant 9, ADR-011 |
| Number first, words after | 07:32, 08:03 |
| Plain verbs, no hype | Owner's convention: buttons are a verb and an object |
| Neutral about money | Brief "Calm" |
| Errors say what happened and what to do | Owner's conventions; overflow review flow of DOMAIN |

## Brand board elements

Since version 0.3 the board shows the React trajectory chart (`react/preview/board.tsx`, bundled inline by `react/preview/build-board.mjs`) with two accounts that add up to the total balance. The trajectory rows below record how the chart evolved; the Trajectory chart section above is the current rule, so the ring markers and the single total line no longer apply.

| Element | Justification |
| --- | --- |
| Holographic header with the ink lockup and the promise | Brand moment, owner's request for the blur |
| Exploration, round 2 | Shows the three directions and why A was kept |
| Construction diagram (dashed full circle, top and bottom lines, "gap 24, today") | Makes the alignment and the idea visible |
| Clear space, minimum sizes, app icon | Logo-design guidelines |
| Signature section with a sample and use / never rules | Defines when the blur may appear |
| Swatches with a 1 px hairline; contrast table computed in JavaScript | Light swatches would vanish otherwise; values cannot drift from the CSS |
| Dashboard: balance, trajectory, account with ceiling, planned items stay on white | Real data stays sharp (DOMAIN) |
| Dashboard: simulation card and empty scenario state on the blur, with an "Estimate" tag | Estimates and brand moments carry the signature (DOMAIN, PRODUCT idea 2) |
| Trajectory: solid real line, dashed planned line with ring markers, blue today rule, data table | DOMAIN: never colour alone; every chart has a data table |
| Trajectory merged with the total balance: one card, the number first, the chart under it | 08:16 ("Monthly burn" figure over its chart), 07:32 ("net this month" over the cash-flow chart); voice rule "number first" |
| Trajectory drawn in script at the real pixel width, 12 px text at every size, no horizontal scroll on mobile | The fixed viewBox scaled the text and forced a 520 px scroll at 375 px |
| Y axis with three to five round values (`€12k`), recessive hairlines, tabular figures | dataviz skill: recessive grid and axes; a balance needs a scale to be read |
| Planned zone: the area after today on the inner-surface grey, labelled "Up to today" and "Planned ahead" | DOMAIN: real and planned must read apart without colour; the zone repeats what the dash says |
| Today as a blue pill on the month axis, not a label at the top | The old top label collided with the line; the pill sits where the eye reads dates (12:59 blue pill) |
| One direct label: the lowest planned balance | The figure a forward-looking budget is checked for; dataviz rule: selective direct labels, never a number on every point |
| Hover crosshair and an inverted tooltip (month, kind, balance, change from the previous month); arrow keys, Home and End when focused, read aloud through a polite live region | 12:47 dark value tooltip; dataviz skill: hover layer by default; WCAG 2.1.1 keyboard |
| Horizon control "3 months, 6 months, 12 months", the data table follows it | 07:32 segmented control (Month, Quarter, Year); the table always matches what is drawn |
| Month labels thin out by width; sparse labels carry the short year ("Jul 26", "Jul 27") | Two Julys must never look alike on a 12-month horizon at 375 px |
| Navigation, wide (container 900 px and more): left sidebar, icon and label, selected item raised on white, "To categorize" with its count, Settings at the foot | 08:16 sidebar (selected item on a lighter pill, settings grouped at the foot); the to-categorize queue is an M1 feature (DOMAIN) |
| Navigation, narrow: logo and a round "Add transaction" button on top, a floating tab bar at the bottom, four destinations, selected tab in ink | 07:32 floating bottom bar, 12:59 bottom nav with one filled pill; ink rather than blue because blue already means today |
| Selected state is a filled shape plus `aria-current`, never colour alone; every target 44 px or more | Owner's accessibility rules |
| The switch is a container query on the mock, not a media query | The mock is narrower than the page; it behaves like the app would in the same width |
| Synthetic amounts | CLAUDE.md: no personal financial data |

## Open questions for the owner

1. **Trademark.** No clearance search was done for the symbol or the name.
2. **Gradient in print.** The colour symbol uses four gradients; print and embroidery should use the black, white or mono masters.
3. **Roadmap.** "Dark theme and phone layout details" is an open question of M2 in `docs/ROADMAP.md`. The appearance setting and the phone navigation are now decided here; the roadmap should record it when the work lands in `src/`.