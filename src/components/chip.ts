// The chips of the add-transaction flow (DESIGN section 10, components.html "#flow .chip"): a pill
// or a tile on `surface-sunken` with a hairline, ink when chosen, and an optional 32 px disc for
// the icon. Shared by the choice chips and by the date picker trigger drawn as a chip.
const CHIP_SHAPE =
  "relative cursor-pointer items-center border border-divider bg-surface-sunken font-medium transition-colors";

export const CHIP_PILL_CLASS = `${CHIP_SHAPE} inline-flex min-h-11 gap-2 rounded-pill whitespace-nowrap`;
export const CHIP_WITH_DISC_CLASS = "pr-3 pl-1.5";
export const CHIP_TEXT_ONLY_CLASS = "px-4";
export const CHIP_TILE_CLASS = `${CHIP_SHAPE} flex min-h-19 flex-col justify-center gap-1 rounded-control px-0.5 py-2 text-center text-caption`;

export const CHIP_DISC_CLASS =
  "grid size-8 shrink-0 place-items-center rounded-pill bg-control text-text";
/** The chosen chip is ink and its disc turns to the surface. */
export const CHIP_CHOSEN_CLASS = "border-primary bg-primary text-on-primary";
