// The 760 px threshold (DESIGN section 10) is written once here, so the form and its loading
// skeleton cannot drift. Tailwind needs complete class names in source: no interpolation.
export const ADD_CARD_CLASS = "max-w-[920px] rounded-card bg-surface p-4 @min-[760px]:p-8";
export const WIDE_TWO_COLUMNS_CLASS = "@min-[760px]:grid-cols-2";
export const WIDE_FULL_WIDTH_CLASS = "@min-[760px]:col-span-2";
export const WIDE_DIVIDER_CLASS =
  "@min-[760px]:border-l @min-[760px]:border-divider @min-[760px]:pl-8";
