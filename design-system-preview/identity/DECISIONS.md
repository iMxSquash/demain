# Decisions

One line per choice, with the evidence that justifies it. Reference IDs are those of [00-reference-audit.md](00-reference-audit.md) (`01` to `03`, then capture times such as `07:20`). `DOMAIN` and `PRODUCT` point to `docs/DOMAIN.md` and `docs/PRODUCT.md`. "Owner" means a decision taken by the owner during review.

Version 0.9 (21 Nov 2026): the calendar, line view and To pay screens (issue #177): the month grid with its compact phone cell, the monthly line view, the actions on one occurrence and the dialog to change it, the To pay page, and the navigation entries they need. Under "Calendar", the only point marked as the owner's (19 Nov 2026) is that the design pass comes first; what the issue scope or a cited document states is marked "Issue #177", and every other choice is proposed and waits for the owner's validation on `components.html`. The navigation and the phone tab bar come from the proposal of issue #177, not from a decision of the owner: they conflict with DESIGN.md section 6 and ROADMAP (open question 9).

Version 0.8 (20 Nov 2026): the planned item screens (issue #176): the `/planned` list, the create form, the edit page with its versions, and the confirmations. The owner's decisions of 19 Nov 2026 are recorded under "Planned items"; every other choice there is proposed and waits for the owner's validation on `components.html`.

Version 0.7 (16 Nov 2026): the loading skeleton and its shimmer, the one motion allowed to repeat (owner's decision of 12 Nov 2026, issue #126). The band tone and the 1500 ms cycle are proposed and wait for the owner's validation on `components.html`.

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

#### Appearance setting in the app (#107)

Measured from `src/app/tokens.css` in both themes (WCAG 2.x relative luminance). The first four rows reuse pairs already listed above (Idle segment, Body text on control, Primary button); they are repeated because the segmented control is the first screen to use them together. The focus ring pairs are new: its 2 px offset plus its 2 px width are wider than the 3 px track padding, so the ring lands on the track and on the ground around it.

| Use | Foreground on background | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| Idle segment label | `--color-text-muted` on `--color-control` | 4.5 | 5.42 | 6.76 |
| Hovered segment label | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Selected segment label | `--color-on-primary` on `--color-primary` | 4.5 | 20.03 | 19.91 |
| Selected pill against the track | `--color-primary` on `--color-control` | 3 | 17.57 | 15.52 |
| Focus ring over the track | `--color-focus` on `--color-control` | 3 | 4.87 | 4.70 |
| Focus ring over the ground | `--color-focus` on `--color-bg` | 3 | 4.66 | 6.03 |

#### Select picker (#119)

Measured from `src/app/tokens.css` in both themes with the same formula. The list sits on `surface` in a 1 px `divider` border (DESIGN.md, section 8). Rows 1 to 4 reuse pairs listed above; they are repeated because the picker is the first control to put them on the same list. Rows 5 and 6 are new.

| Use | Foreground on background | Needs | Light | Dark |
| --- | --- | --- | --- | --- |
| Option | `--color-text` on `--color-surface` | 4.5 | 20.03 | 18.10 |
| Active or hovered option | `--color-text` on `--color-control` | 4.5 | 17.57 | 15.52 |
| Disabled option | `--color-text-muted` on `--color-surface` | 4.5 | 6.18 | 7.88 |
| Check of the selected option | `--color-text` on `--color-control` | 3 | 17.57 | 15.52 |
| Keyboard ring on the active option | `--color-focus` on `--color-control` | 3 | 4.87 | 4.70 |
| Keyboard ring on a selected, inactive row | `--color-focus` on `--color-surface` | 3 | 5.55 | 5.48 |

Two things are not met by a ratio and are decided here. The `divider` border of the list reads 1.37:1 (light) and 1.12:1 (dark) against `surface`: it is not what tells the options apart (their text and the 44 px rows do), and `shadow-overlay` lifts the list from the page, so it stays the quiet hairline of every popover. The active option is `control` on `surface`, 1.14:1 and 1.17:1: tone alone is not enough to say which option is active, so the keyboard adds the 2 px `focus` ring (the only blue allowed besides today, DESIGN.md section 4) and a pointer hovers to the same tone while the pointer itself shows where it is. The selected option never relies on tone: it is medium weight with a check.

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
| Skeleton block on card (decorative) | `--color-surface-sunken` on `--color-surface` | none | 1.14 | 1.06 |
| Skeleton band on block, proposed (decorative) | `--color-control-hover` on `--color-surface-sunken` | none | 1.20 | 1.25 |
| Skeleton band on block, as written in the issue (decorative) | `--color-control` on `--color-surface-sunken` | none | 1.00 | 1.10 |
| Skeleton block on the page ground, chosen (decorative) | `--color-surface` on `--color-bg` | none | 1.19 | 1.10 |
| Skeleton block on the page ground, not chosen (decorative) | `--color-surface-sunken` on `--color-bg` | none | 1.05 | 1.17 |
| Skeleton band on a block of the page ground (decorative) | `--color-control-hover` on `--color-surface` | none | 1.37 | 1.33 |

#### Data display in the app (#114)

Tables, pills, the count badge and the empty state add no foreground and background pair: each one reuses a pair of the tables above, measured in both themes.

| Use | Reused pair | Listed as | Light | Dark |
| --- | --- | --- | --- | --- |
| Column header and caption of a table on its card | `--color-text-muted` on `--color-surface` | Hint | 6.18 | 7.88 |
| Row text on hover | `--color-text` on `--color-surface-sunken` | Row hover | 17.57 | 17.04 |
| Neutral pill, count badge | `--color-text` on `--color-control` | Secondary | 17.57 | 15.52 |
| Warning pill | `--color-warning` on `--color-warning-tint` | Warning word | 4.54 | 7.87 |
| Empty state text | `--color-text-muted` on `--color-surface-sunken` | Disabled label | 5.42 | 7.42 |
| Empty state action | `--color-text` on `--color-control` | Secondary | 17.57 | 15.52 |
| Focus ring of the scroll region | `--color-focus` on `--color-surface` | Focus ring on card | 5.55 | 5.48 |

The hairline between rows (`--color-divider`) is a separator, not a component boundary, and carries no information. In the light theme `--color-control` and `--color-surface-sunken` are the same tone (`#f0f0f0`), so a neutral pill on a hovered row loses its outline there while its word keeps the Secondary ratio.

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
| Other pages on a phone | A Settings icon button in the top bar; `/settings` ends with a "More" list (Balances, Categories, Rules, Currencies, Backup, Security) | Owner, 12 Nov 2026, open to change after use: four tabs cannot hold every page, and Settings already gathers the rare ones |
| Navigation icons | `Scales`, `Tag`, `Funnel`, `CurrencyEur`, `Archive`, `ShieldCheck` for the pages outside the tab bar; `CalendarBlank` and `ArrowsSplit` for Calendar and Simulations | Owner, 12 Nov 2026, from the proposal; `ArrowsSplit` keeps the diverging paths of the board's earlier Simulations icon |
| Surplus button label | "Move €50.00, the rest to Savings B" | Owner, 12 Nov 2026: the longer label took two lines on a phone |
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

## Planned items

The screens of DESIGN.md section 17, drawn on `components.html` with existing components only. "Owner, 19 Nov 2026" marks what the owner decided before the design pass; "Proposed" marks what this pass chose and the owner has not yet validated.

| Choice | Value | Justification |
| --- | --- | --- |
| Way in | `/planned` is reached from a link in the calendar and from an entry in the wide sidebar | Owner, 19 Nov 2026. The calendar changes one occurrence (ROADMAP, M2); `/planned` changes the item behind it |
| Way in on a phone | The tab bar keeps its four destinations: the calendar link is the way in | Proposed, from the interim tab bar (owner, 12 Nov 2026). Whether `/planned` also joins the "More" list of `/settings` is an open question |
| Average windows | 3, 6 or 12 previous occurrences, 3 by default, offered as three choice chips | Owner, 19 Nov 2026. DOMAIN: `average_window` is 3, 6 or 12 |
| Provision | Only on a repeating item: there is no one-off provision. On a one-off the checkbox stays, unavailable, with the reason written under it | Owner, 19 Nov 2026. DOMAIN: `accepts_multiple_transactions` needs a repetition. A control that is silently disabled tells nothing |
| Deletion | "Delete" exists only when no transaction is linked to the item. Otherwise the page says why in a sentence and points to "Cancel this planned item" | Owner, 19 Nov 2026 (issue #180). A linked transaction must keep the item it settles |
| Amount | Typed without a sign: the type (Out, In, Move, Interest) gives the sign. The type segments are those of the add-transaction flow | DOMAIN invariant 1 and DESIGN section 9 (owner, 12 Nov 2026). One syntax for every amount |
| Amount mode | Two segments, "Fixed amount" and "Rolling average". The amount of the second is labelled "Starting estimate" and a hint says it is used until a previous amount exists | ADR-011: nothing is estimated unless the user chooses it. DOMAIN: the amount of a rolling average is its starting estimate |
| First date and end date | The date picker field, not the Today and Yesterday chips | Proposed. A series starts on any day, often in the future; the chips of the add-transaction flow suit a transaction that already happened |
| Repetition | A select of seven choices, then a number field only for "Monthly on a given day", "Every N months" and "Every N weeks" | Proposed, from DOMAIN `repetition_kind` and `repetition_value`. There is no count of occurrences in DOMAIN, so none is drawn |
| Matching | A closed disclosure "Matching" with the window in days (5) and the tolerance in percent (5), both with exact-syntax rules | Proposed. DOMAIN defaults suit most items, so they stay out of the way, as "More details" in the add-transaction flow |
| Real values only | The list and the forms use no blur and no dashed line | Proposed. They show what the user entered, not a projection (DESIGN section 1). The dash belongs to the trajectory chart |
| List, wide | A table with a name, the schedule in words, the account, the next date and the amount, 48 px rows | Proposed. DESIGN section 8 table; the schedule in words is read before any date |
| List, phone | Two-line rows of 64 px instead of a table: name and amount, then schedule, account and next date | Proposed. Five columns do not fit 343 px; the recap rows of the add-transaction flow (56 px) are the precedent, one line taller here |
| Ended and cancelled | Behind a disclosure under the list, each with a word in a pill | Proposed. The list answers what is still coming; history stays one tap away |
| Versions | A table of the versions with the word "In effect" or "Upcoming" in a pill, inside a scrolling region that takes the focus | Proposed. Versions are compared across columns, so the table stays a table on a phone |
| Change from a date | A disclosure holding the version fields. A same-day version triggers a warning notice, and the button then says "Replace the version of 1 Jan 2026" | Proposed. DOMAIN does not say what a second version on the same day does; replacing keeps one version per day. To be confirmed by the owner |
| Cancel and delete | Each opens the native dialog, Cancel taking the focus first. The dismiss button says "Keep it", never "Cancel", so the two words never meet | The app's `ConfirmActionButton` and the Dialog row above. Red stays on the confirm button only |
| Save button | Says the verb and the kind: "Add planned expense". It carries no amount | Voice rule, as the add-transaction save button. The amount is already on the same screen |

## Calendar

The screens of DESIGN.md section 18, drawn on `components.html` with existing components only. "Owner, 19 Nov 2026" marks only what the text of issue #177 attributes to the owner (the design pass comes first); "Issue #177" marks what the issue scope or a cited document states; "Proposed" marks what this pass chose and the owner has not yet validated, which is every measure, layout and line of copy.

| Choice | Value | Justification |
| --- | --- | --- |
| Design first | The calendar screens are designed on `components.html` before any code under `src/` | Owner, 19 Nov 2026 (issue #177) |
| Screens | The month header with the "Grid" and "Lines" links and the account selector of the daily balance, the month grid with the day details, the monthly line view, the actions on an unsettled occurrence, the "To pay" page and its sidebar entry with a count badge, the navigation and the phone layout, light and dark | Issue #177 (scope list) |
| Statuses | Planned, Partial, Confirmed, Overdue and Cancelled, each a word in a pill | Issue #177 (scope list). DOMAIN, "Occurrence status": never colour alone |
| No estimation | No figure of these screens is estimated: real transactions and explicitly dated planned items only | Issue #177 (scope list). ADR-011 and DOMAIN, "The real chart" |
| Navigation | Sidebar Overview, Calendar, Transactions, Accounts, Imports, Planned, To pay; phone tab bar Overview, Calendar, Accounts, Imports, with Transactions and To pay in the More list | Proposed (issue #177), open question 9. It conflicts with DESIGN.md section 6 and ROADMAP, "Phone layout details" |
| Sidebar, "To categorize" | Kept, with its count, after "To pay" | Proposed. The issue's list omits it; DESIGN.md section 6 and the brand board keep it |
| Icons | `Repeat` for Planned and `Receipt` for To pay, added to DESIGN.md section 7 | Proposed. Neither page nor section names one; `Tray` is to categorize and `CalendarBlank` is Calendar, so neither can be reused |
| Count badge | `rounded-pill bg-control text-text`, padding 2 8, `text-caption`, tabular, a hidden word after the number ("3 due") | Proposed. DESIGN.md section 8 ("text on control") had no markup. The board draws 28 px in `text-label`; this one follows the issue's measures |
| Count of "To pay" | The occurrences in the "Due" section (overdue and due today), not those of the next 7 days | Proposed. A badge counts what needs action now, as "To categorize" does |
| Real and planned | Real: ink, the word "Real", a solid dot. Planned: muted text, a dashed hairline, the word "Planned" (a hollow ring on a phone cell) | Proposed. The dashed segment of the trajectory chart, DESIGN.md section 11; DOMAIN, "The real chart": never by colour alone |
| Status pill colour | Neutral for every status except Overdue, which is the warning pill | Proposed, to be confirmed (question 9). DESIGN.md section 4 ties amber to what needs attention, and an overdue occurrence does. Blue and red fills stay out |
| Month header | `h1` "Calendar", a link "Planned items", a month navigator of two 44 px icon buttons around an `h2`, a two-link view switch in the track of a segmented control, a Select "Daily balance" | Proposed. Section 17 gives the "Planned items" link to the calendar (owner, 19 Nov 2026). Links, not radios, since the switch changes the URL |
| Account selector | "Checking accounts, EUR" by default, then one option per account in its own currency | Issue #177 (scope item) for the content; the Select pattern and the hint are proposed |
| Grid, wide | Seven columns, cells of 96 x 104 px at least, padding 8, gap 4, from a container of 744 px | Proposed. Seven cells of 96 px, six gaps of 4 px and 48 px of card padding make 744 px, so the 640 px of the form switch cannot hold them without scrolling sideways |
| Cell content | Day number, end-of-day balance, counts in words ("2 real", "1 planned"), "Below zero" in text, "Unplaced surplus" in text | Proposed. Issue #177 scope; DOMAIN, "Deposit ceiling and overflow": the unplaced surplus is flagged in the calendar |
| Today | The 1.5 px accent inner ring, the accent day number and the word "Today" | Proposed, from DESIGN.md section 9 (today in the date picker) |
| Selected day | Ink fill, every element in `on-primary` | Proposed. Red, amber and muted text fail on the ink fill (3.65:1 for red), so the words carry the meaning there |
| Keyboard | One tab stop (roving tabindex), arrows, Home and End by week, Page Up and Page Down by month (Shift a year), Enter and Space select, keys that leave the month change the month shown | The date picker of ADR-025, as the issue asks. Not a new rule |
| Compact cell | A phone cell of 49 x 56 px with the day number and up to three glyphs: a solid dot for real entries, a hollow ring for planned ones, a short bar for below zero, and a legend in words above the weekday row | Proposed, to be confirmed (question 9). Seven columns of 343 px leave 49 px, too little for the wide cell and for 12 px text, so the content moves to the day details. The legend is above and not between the weekday row and the days because a paragraph inside a `grid` is not valid |
| Accessible name of a day | One label: the day, "today", the end-of-day balance with the currency code, the counts in words, "below zero", "unplaced surplus" | Proposed. The compact cell shows less than it says |
| Day details | A card under the grid: the date and "Today", the balance in `text-amount`, the counts as a title, then the entries with Real or Planned, a status pill, the amount and the actions | Proposed. The main reading surface on a phone |
| Line view | A table (caption "November 2026"; Date, Description, Account, Kind, Status, Amount, Balance at end of day), 48 px rows, the balance on the last row of each day, from a container of 880 px; a stacked list below | Proposed. Section 8 table; seven columns need about 856 px with the card padding |
| Planned income above a ceiling | A line under its description, "Exceeds the declared ceiling of Savings A", with a warning icon and `text-warning` | Proposed. DOMAIN: the income is accepted with a warning |
| Cancelled | A muted, struck-through description and the pill "Cancelled"; its only action is "Restore" | Proposed. The strike is decoration, the word is the status |
| Actions | "Mark as paid", "Link a transaction" and "Change" as secondary 44 px buttons; a settled row has none; the actions of a table row sit in a row of their own under it | Proposed, "Mark as paid" style to be confirmed (question 9). The primary is the one main action of a screen, and none of these screens has one; seven columns have no room for three buttons and a menu would be a new component |
| Change dialog | The native dialog of 420 px, "Change this occurrence", a "Move", "Change", "Skip" segmented choice, a date and an amount field, a note that only this occurrence changes, Cancel (focused first) and Save, and a link button "Restore" when an override exists | Proposed, from the scope of issue #177 and DOMAIN, "Occurrence override" |
| To pay | Sections "Due" then "Due in the next 7 days", a card per occurrence with the date and the amount prefilled and editable and "Mark as paid"; "Nothing to pay." when both are empty | Proposed, from the scope of issue #177. Prefilled with the remaining amount for a partial occurrence (DOMAIN) |
| Phone tab bar | Overview, Calendar, Accounts, Imports; Transactions and To pay in the More list, the badge on the To pay row only | Proposed (issue #177), open question 9. See the Navigation row |

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
| Theme preference code | `src/app/theme/theme-preference.ts` (allowlist, attribute for `<html>`), `actions.ts` (server action, as `setLocaleAction`) and `theme-switcher.tsx` (the control, rendered in the header), with tests in `tests/app/theme/` | Landed in #107; the root layout reads the cookie and renders `data-theme` |
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
| Draw 600 ms | The trajectory line drawn once, left to right, real then planned | Reads the timeline in its own order, once: the longest motion allowed, so nothing else lasts more, except the cycle of the shimmer, which repeats |
| Shimmer 1500 ms (proposed) | One sweep of a soft band over a loading skeleton, with `--motion-ease-move`, repeated while the content loads. The only repeating motion | Owner, 12 Nov 2026: a skeleton that does not move reads as a broken page, one that moves says the app is working. 1.5 s is slow enough to stay calm and read as a sweep, fast enough that a load of one or two seconds shows a full pass; under 5 s so the cycle is never mistaken for a long autoplay. No new easing: the standard one already eases both ends, which leaves a short rest between sweeps. Limits: it runs only while loading and ends when the content replaces the skeleton; no other colour, no glow, no holographic tint; pure CSS from the first paint; never beside content being read; at 0 ms under reduced motion, where a zero active duration applies nothing and the band stays outside its block, so the skeleton is static |
| Shimmer band tone (proposed) | `--color-control-hover` over `--color-surface-sunken` | The issue asks for `control`, but `control` and `surface-sunken` are both `gray-50` in the light theme: the band would measure 1.00:1 and never show. `control-hover` is the next tone up in both themes (`gray-200`, `night-5`) and already exists. The owner confirms or chooses another token on `components.html`, which draws both |
| Skeleton block tone | `surface-sunken` on a card, `surface` on the page ground | Found in the app, on the first render of a loading page: titles and fields sit on the ground, where `surface-sunken` reads 1.05:1 in the light theme and the skeleton looked broken. `surface` reads 1.19:1 there (1.10:1 in dark, against 1.17:1 for `surface-sunken`, a loss accepted to keep one rule in both themes). Same order of faintness as a block on a card (1.14:1 and 1.06:1). Owner to confirm |
| Skeleton content | Blocks only for data that is really loading, as shapes with no figure, label or amount. Everything static (title, section heading, back link, intro, caption, column heading, hint) is drawn as it is. A heading or caption that holds data (an account name, a currency, columns that are accounts) is a block | Owner, 16 Nov 2026, after seeing titles drawn as blocks: a fake loading of what never changes reads as a page that is not ready, and the skeleton would hide what the user can already read. No invented data (DOMAIN, `CLAUDE.md`) |
| Skeleton structure | A page draws its static parts at once and loads each section of data behind its own `Suspense` boundary; the skeleton of a section is built from the same components as the loaded section (the real table head, the same section) | Owner, 16 Nov 2026: no duplicate of the page that could drift, each element shows as soon as it is ready, and the skeleton stays faithful to the page once loaded |
| Skeleton size | Same as the final content: table in the real markup with 48 px rows, chart with its 280 px plot | The content replaces the skeleton without moving anything (CLS under 0.1) |
| Skeleton accessibility | `aria-busy="true"` on the loading region (never on the page's `main`, whose headings stay readable), one visually hidden polite status message in words that is added once the page is hydrated (a live region already filled in the first markup is usually not announced), blocks `aria-hidden`, focus never moved | Meaning never rests on the motion or the tone alone (WCAG 2.3.3, 1.4.1) |
| No pause control | None for the shimmer | WCAG 2.2.2 exempts motion that is essential, and a loading indicator shown while the content cannot be used is. The cycle itself is under 5 s, but a slow load lasts longer, so the argument rests on the exception, not on the cycle. Open point for the owner |
| Easings | Decelerate in, accelerate out, standard between two states | The usual pairing for things that arrive and leave; no spring, no overshoot, to stay calm |
| Offset 8 px | Layers and pages rise as they fade in | Says where the layer comes from without travelling |
| Reduced motion | Every duration and offset at 0, fades included | Owner's rule: motion is off under reduced motion, not merely softened. Nothing carries meaning through motion alone (WCAG 2.3.3) |
| Never | Counting figures, bounce, parallax, scroll motion, loops (except the shimmer above), motion on the holographic signature or the chart glow, input that waits for a motion | A real amount is shown as it is (principle 1); a loop or an autoplay over 5 seconds would need a pause control (WCAG 2.2.2), which the shimmer does not because it is essential while loading |
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
3. **Roadmap.** The dark theme (#107) and the phone navigation (#112) are recorded as decided in `docs/ROADMAP.md`.
4. **Planned items, phone.** Is `/planned` reached from the calendar link only, or also from the "More" list of `/settings` (ROADMAP, phone navigation)?
5. **Planned items, fields that cannot change.** The edit page shows the type, the account and the first date as read-only text. DOMAIN does not say whether they can change after creation.
6. **Planned items, limits and messages not in DOMAIN.** The largest number of months or weeks between dates, and the largest matching window in days, are not documented. The forms refuse zero and a non-integer, and nothing more until DOMAIN says. The error messages and their rules (an end date not before the first date, a tolerance between 0 and 100 with 2 decimals, the "could not be saved" line) are proposed too, as is the same-day replacement of a version.
7. **Planned items, category.** DOMAIN gives a planned item a category (`category_id`, nullability not stated) while a transfer has none (DOMAIN, transactions). The form follows the add-transaction form: no category for a move, an optional one for the other types. A provision matches the same category, so a provision without a category is also undocumented.
8. **Planned items, cancel.** DOMAIN has no way back from a cancelled item, and says only that it produces nothing after today. The edit page offers no way back, and no "Change from a date" or "End date" on a cancelled item.
9. **Calendar, navigation and proposed points.** Issue #177 proposes a phone tab bar of Overview, Calendar, Accounts and Imports with Transactions and To pay in the More list of `/settings`, a sidebar of Overview, Calendar, Transactions, Accounts, Imports, Planned and To pay, and no tab and no More row for Planned. ROADMAP, "Phone layout details", says: "a floating tab bar (Overview, Transactions, Accounts, Imports until Calendar and Simulations land) and the other pages in the More list of `/settings`". DESIGN.md section 6 says: four destinations (Overview, Calendar, Accounts, Simulations), interim Overview, Transactions, Accounts and Imports, with Calendar taking the place of Transactions and Simulations the place of Imports when they land, and a More list of Balances, Categories, Rules, Currencies, Backup and Security. Which one wins? Three consequences to decide: Transactions leaves the tab bar once Calendar lands and the documents do not say where it goes; the due count of "To pay" is on a phone only on a row in the More list, never on the bar or on the Settings button; and Planned is reached from the calendar link only (see question 4). The same pass proposes, for the owner's confirmation: the compact phone cell with its three glyphs (a solid dot, a hollow ring, a bar) and its legend; the Overdue pill in the warning colour while the other statuses stay neutral; "Mark as paid" as a secondary button; the grid breakpoint of 744 px (the frozen 640 px cannot hold cells of 96 px); the action row under a table row; and which occurrences "To pay" lists, and the label of its button, for an income, a move or an interest. "Link a transaction" has no destination designed yet.
