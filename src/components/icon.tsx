// The ssr entry point does not export the Icon type; a type import is erased and loads no client code.
import type { Icon as PhosphorIcon } from "@phosphor-icons/react";

// Mirrors --icon-size in tokens.css: the SVG needs a number for its width and height attributes.
const ICON_SIZE = 20;

type IconProps = {
  icon: PhosphorIcon;
  // Without a label the icon is decorative and hidden from assistive technology.
  label?: string;
};

export function Icon({ icon: Glyph, label }: IconProps) {
  const accessibility = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return <Glyph size={ICON_SIZE} weight="regular" {...accessibility} />;
}
