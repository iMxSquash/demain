# Reference audit

Measured survey of the 21 images in `design-system-preview/inspiration/`, written before any drawing. Every choice in `DECISIONS.md` cites the image IDs used here.

## Method

- Every image was opened and read. Screenshots are 2790 px wide, displayed and measured at 2000 px (factor 1.40), so coordinates below are display coordinates.
- **Colours**: sampled with a Python (Pillow) script, as the median of a small patch for surfaces and as the darkest or lightest pixel of a patch for text. Text samples are anti-aliased, so treat them as approximate (within a few units per channel).
- **Radii**: measured by probing the first pixel row of a card edge and correcting for the curve (`r - sqrt(2r - 1) = d`). The correction gives `r = 15.5` on the 33 px lime pill of 01, i.e. `r = h/2`, which validates it. Values are in display pixels, then converted to the UI scale of the mock-up where a device frame gives a scale (phone screen: 393 pt wide).
- **Contrast**: WCAG 2.x relative luminance, computed on the sampled values.
- **Confidence**: `high` = clean flat surface; `medium` = anti-aliased text or a gradient nearby; `low` = the probe hit something else. Low samples are listed but never used.

## Two layers in the references

The images mix two things that must not be confused:

1. **Product UI**: the screens themselves (dashboards, phones, cards, tables). Product decisions cite this layer.
2. **Case-study chrome**: the portfolio pages around the screens (huge two-tone headlines, italic serif section titles, cables, hands, device renders, blurred background lettering). It shows how a studio sells the work, not how the product looks. It is cited only for what it says explicitly (the typeface name in 13:54).

## Per image

ID = file number (`01` to `03`) or capture time (`06:44` = `Capture d'ecran 2026-11-11 a 13.06.44.png`).

| ID | Subject | Kept as evidence | Observed but excluded |
| --- | --- | --- | --- |
| 01 | Dark finance dashboard "Financia" | Near-black app ground `#161616`, card `#181818`, hairline divider `#212121`; white values `#ffffff`, muted labels `#ababab`; amounts set large in a regular weight; signed pills `+8%` / `-8%` on tinted grounds (`#527555`, `#52312c`); fully rounded pills; card radius about 16 px at mock scale; tick-bar and dot-matrix charts; icons in circular neutral containers; table rows about 36 px at mock scale (about 48 px at 1440) | Lime `#ddfd20` accent (works only on dark: 1.16:1 on white); multi-colour category ticks with a coloured glow under them |
| 02 | Dark investing dashboard "neuro-bank" | Single saturated blue for the one primary action (`#2658fb`); up/down arrows next to percentages (sign not carried by colour alone); muted label `#898996` on `#10111a` (5.44:1) | Glowing area charts, blue-violet light gradient, "AI Insights" glass card, grid backdrop |
| 03 | Mobile onboarding, four phones | Pure black ground `#000000`/`#030303`; heavy grotesk headlines; one primary button per screen | Saturated gradient ribbons, glowing gradient buttons, faded secondary heading lines `#c8c8c8` |
| 06:44 | Case study cover "Pulse", phone in hand | Black segmented control selected state ("Month"); light grey ground `#dbdbdb`; label grey `#838383` | Violet/coral blurred glass cards, hand, giant blurred lettering |
| 07:07 | "Pulse" overview, phone with cables | Headline ink `#080808` on `#ebebeb` (16.8:1) | Second headline line `#969696` on `#ebebeb` (2.48:1, fails AA); radar chart on violet gradient; cables |
| 07:20 | "Pulse" widget sheet | White card `#ffffff` on light ground; inner card `#f0f0f0` with radius about 39 px at blow-up scale (about 20 pt in the phone); dot-matrix chart with grey idle dots and coloured active dots; `-12%` in green `#4d9366`; caption grey `#616163` (6.18:1 on white); uppercase small labels ("MONTHLY BURN") | Violet-blue and pink-orange gradient cards |
| 07:32 | "Pulse" analytics screen | Fully rounded segmented control (r about h/2), black selected segment; cash-flow dot chart with in-flow above the axis and out-flow below (position, not only colour, carries the sign); "net this month" set small after a large amount | Violet "Payment rhythm" gradient card, red/blue gradient tiles, two-tone headline |
| 08:03 | "Pulse" runway | A "now" marker on a timeline (black dot labelled "now"), a dated end marker ("Dec '27"); "14 mo" with the unit set small and light; white card radius about 32 px at blow-up scale | Green-orange gradient ground, glassy widget gradient |
| 08:16 | "Pulse" desktop dashboard | Calm light dashboard: white cards on light ground, left sidebar, greeting plus date line, small black "Export Data" button | Gradient insight card, avatars stack, giant lettering behind |
| 08:25 | "Pulse" cards blow-up | White card `#ffffff` on `#dcdcdc`, card radius about 33 px at blow-up (about 20 pt in phone); green dot `#53a06a`, red dot `#e17261`; percentage pills on pale tints (`#fdf2e3`, `#d7fed2`); amounts with label and date row | Green-orange gradient "potential savings" card |
| 10:47 | "Orbix/Maven" phone, payments | True black UI `#000000`; list icon discs `#414141`; positive amount `+$8,500.00` in green `#70ce64` with explicit `+` sign; orange-red accent `#eb4f32` | Pastel gradient action cards, glowing orange FAB |
| 11:01 | Same, asset details and keypad | Stats panel `#1c1c1c` on black, radius about 25 px (about 23 pt); secondary button `#232323`, radius about 14 px (about 0.27 x height); dimmed decimals (`$18,450` + grey `.00`) | Glowing green line chart with dotted fill, orange-red primary button |
| 11:41 | Case study "User Research" | Body grey `#ababab` on `#090909`; neutral grotesk body text | Silver gradient headline text, italic serif titles (chrome), star logo |
| 11:54 | Transactions table on tablet | Light table ground `#f6f7fb`; status pills with text ("Completed" `#e4f9f3`, "Pending Review" `#f3e5d8`, "Canceled"); dense rows; filter buttons with chevrons; right-aligned amounts; "Showing 1-10 of 124" | Holographic gradient summary cards. Canceled pill sample `#bd8c91` is low confidence (hit text) |
| 12:21 | Component sheet | Dimmed decimals (`$7,802.62`); dark "Send" primary next to light secondary actions; segmented spending bar with a filled part and empty ticks | 3D coloured coins, holographic gradients, glass, avatar strip |
| 12:47 | Amount filter card, phone in hand | White card radius about 36 px at blow-up; histogram of thin bars with active range in black and inactive in light grey; dark value tooltip `#171717`; "Money out / Money in" with diagonal arrows; neutral chips `#f8f8f8` | Pastel gradient ground, stacked ghost cards |
| 12:59 | Mobile application overview | Dark ground `#090909`; app-icon tiles `#242424`, radius about 20 % of the tile; bottom nav with one saturated blue pill `#3c5bf6`; ticker-style thin bar charts; dimmed decimals | Italic serif "Mobile Application" title (chrome). Rule sample `#090909` is low confidence (missed the 1 px line) |
| 13:08 | Card details, transactions list | Status words in colour plus text ("Pending" `#eac86f`, "Failed" `#e38388`); "Available to spend" in green; segmented daily-limit bar | Pastel glass card |
| 13:19 | Filter sheet, move money | Line icons (accounts, date, methods, attachments) at one stroke weight; full-width pill CTA `#3c5bf6`; app-icon tile `#242424`; text-link secondary action | none in the UI |
| 13:28 | "Maven" landing on a monitor | Black pill CTA "Request for Demo"; light lavender-grey ground `#efedf8` (chrome) | Lavender ground, glossy gradient bank cards, floating nav pill, word in a glowing box |
| 13:54 | Case study "Typography" | **Typeface named: Neue Montreal** (Pangram Pangram, Mathieu Desjardins, 2018), weights Regular, Medium, Bold, chosen "for readability across dashboards, tables and financial data"; showcase blue `#5973f5` on `#090909` (4.93:1) | Italic serif title (chrome), offset shadow on the letters |

## Synthesis

### Colour

| Role | Measured values | Sources | Contrast notes |
| --- | --- | --- | --- |
| Light ground | `#ebebeb`, `#dbdbdb`, `#dcdcdc`; cool table ground `#f6f7fb` | 07:07, 07:32, 08:25, 06:44, 11:54 | |
| Light card | `#ffffff`, inner `#f0f0f0`, chip `#f8f8f8` | 07:20, 08:25, 12:47 | |
| Light ink | `#080808` | 07:07 | 16.8:1 on `#ebebeb` |
| Light muted text | `#616163` (passes); `#969696`, `#999999`, `#838383` (fail) | 07:20; 07:07, 07:32, 06:44 | `#616163` = 6.18:1 on white; the three others 2.4 to 2.7:1 on their grounds |
| Dark ground | `#000000`, `#030303`, `#090909` | 03, 10:47, 11:41, 12:59, 13:54 | |
| Dark surfaces | `#161616`, `#181818`, `#1c1c1c`, `#232323`, `#242424`; disc `#414141` | 01, 11:01, 12:59, 13:19, 10:47 | Steps of 2 to 14 units: separation by tone, not by border or shadow |
| Dark text | `#ffffff`; muted `#ababab` | 01, 11:41 | `#ababab` = 7.88:1 on `#161616` |
| Saturated blue (one per screen) | `#3c5bf6`, `#2658fb`, `#4c57e7`, `#5973f5` | 12:59, 13:19, 02, 01, 13:54 | `#3c5bf6` = 5.22:1 on white but 3.81:1 on `#090909`; `#5973f5` = 4.93:1 on `#090909` |
| Orange-red | `#eb4f32`, `#eb663d` | 10:47, 11:01, 07:20 | 3.69:1 on white (large text and components only) |
| Lime | `#ddfd20` | 01 | 1.16:1 on white: unusable on light |
| Positive | `#4d9366`, `#53a06a`, `#70ce64` | 07:20, 08:25, 10:47 | 3.70 and 3.18:1 on white (fail for text); `#70ce64` = 10.7:1 on black |
| Negative | `#e17261`, `#e38388` | 08:25, 13:08 | 3.10:1 on white (fails for text) |
| Warning | `#eac86f`; pale pill `#f3e5d8`, `#fdf2e3` | 13:08, 11:54, 08:25 | 1.62:1 on white: only usable on dark or as a pill ground |

Recurring rules observed in the product UI:

- **One saturated colour per screen**, reserved for the single primary action or the selected navigation item (02, 12:59, 13:19). Everything else is neutral.
- **The primary action on light screens is often near-black**, not coloured (06:44 "Month", 08:16 "Export Data", 12:21 "Send", 13:28 "Request for Demo").
- **Sign is never carried by colour alone**: `+`/`-` signs (01, 10:47), up/down arrows (02, 12:47), position above or below an axis (07:32, 08:25), or a status word (11:54, 13:08).

### Typography

| Observation | Sources |
| --- | --- |
| One neo-grotesk sans everywhere in the product UI; named as **Neue Montreal** in 13:54 | 13:54, 10:47, 11:01, 12:59, 13:08, 13:19 |
| Pulse screens use a close neo-grotesk of the same family type (tight, neutral, large x-height) | 06:44 to 08:25 |
| Amounts set large in **Regular**, not Bold | 01, 07:20, 08:25, 11:01 |
| **Dimmed minor units** (`.98`, `.00` in the muted colour) | 11:01, 12:21, 12:59, 13:28 |
| Units and context set small after the number ("14 mo", "net this month", "/mo") | 07:32, 08:03, 07:20 |
| Small uppercase labels with tracking for card titles ("MONTHLY BURN") | 07:20, 08:25 |
| Italic display serifs appear only as case-study titles | 11:41, 12:59, 13:54 (chrome) |

### Radii (UI scale)

| Element | Measured | Sources |
| --- | --- | --- |
| Pills, chips, segmented controls | `r = h/2` (fully rounded) | 01, 07:32, 13:19 |
| Buttons (rectangular) | `r ~ 0.27 x h` (14 px on a 52 px button) | 11:01 |
| Cards in phone UI | about 20 to 23 pt | 07:20, 08:25, 11:01 |
| Cards in desktop dashboard | about 16 px at mock scale (about 20 px at 1440) | 01 |
| App-icon tiles | about 20 % of the side | 12:59, 13:19 |
| Case-study panels | about 52 px | 08:25 (chrome, not used) |

### Density and layout

- Desktop table rows about 48 px at 1440 (01), mobile list rows about 64 pt (10:47).
- Generous card padding (about 24 px), values aligned to the left edge of the card, actions in the top right corner of a card (01, 08:25).
- Dividers are 1 px hairlines a few units off the surface (01 `#212121` on `#161616`).

### Surfaces and elevation

- Flat. Cards separate from the ground by **tone** (01, 07:20, 08:25, 11:01), not by border or drop shadow.
- The one shadow observed is a soft, wide, low-opacity shadow under a floating card (12:47). No hard shadows anywhere.

### Iconography and data marks

- Line icons, one stroke weight, rounded ends, often set in a circular neutral container (01, 10:47, 12:47, 13:19).
- Diagonal arrows for money in and out (12:47, 12:59).
- **Dot-matrix charts are the most recurrent data motif** (01, 06:44, 07:20, 07:32, 08:03, 08:16, 08:25): idle dots in grey, active dots in colour.
- Thin tick bars (01, 12:47, 12:59).
- A "now" marker on a timeline, with a dated end marker (08:03).

## What the references do not settle

- **A logo.** No image shows a mark worth following: "Financia" (01), "Pulse" (08:16), "Maven" (13:28) and the star (11:41) are generic. The mark is therefore built from the product model, and the references only govern its weight, geometry and colour.
- **Licensing of Neue Montreal** for an open source, self-hosted app (see `DECISIONS.md`, open questions).

## Addendum, round 2 (owner review of 11 Nov 2026)

The owner asked for the colour blur and gradients of the references to become the graphic signature. The gradients listed above as "observed but excluded" were sampled again; the holographic family of the Orbix and Maven screens was kept, the violet-and-coral Pulse family was not (owner's choice).

| Colour | Sampled | Source |
| --- | --- | --- |
| Sky | `#6eb1f8` | 12:21, top right gradient |
| Blue | `#9ac6f8`, `#a2cffb` | 12:21, 11:54 summary card |
| Aqua | `#91e1ec`, `#bbebf6` | 12:21 "Money in" card, avatar strip |
| Rose | `#f2cee1`, `#deaec2` | 12:47 ground, 11:54 third card |
| Peach | `#f1b28d` | 12:21 "Money in" card |
| Sand | `#f9e1cf` | 11:54 second card |
| Cream | `#f9f6e4`, `#f4f4df` | 12:21, light zone under the blur |
| Lilac (not kept) | `#c6c7f5`, `#c3beeb` | 12:21, 11:54 |

How the references use it: soft fields blurred into each other, behind ink text, on whole cards (11:54 summary cards, 12:21 component grounds, 07:20 Pulse cards). Ink text stays at 8.9:1 or more on every kept stop; the muted grey `#616163` does not (2.7 to 4.9:1), so only ink is used on the blur.
