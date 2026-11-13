/**
 * Keeps the classes that the identity removed out of `src/` (DESIGN.md section 16).
 * Tailwind drops an unknown class without any error, so a class of the old palette
 * would build and leave its element unstyled.
 */

const PALETTE =
  "white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";

const FORBIDDEN_CLASSES: readonly RegExp[] = [
  // Default palette colours: `bg-blue-800`, `text-white`, `backdrop:bg-black/40`, `stroke-neutral-300`
  new RegExp(
    `^(bg|text|border(-[xytrblse])?|fill|stroke|ring|ring-offset|inset-ring|outline|divide|decoration|placeholder|accent|caret|from|via|to|shadow)-(${PALETTE})(-\\d+)?(/\\d+)?$`,
  ),
  // The other namespaces that globals.css resets: their named steps no longer compile.
  /^rounded(-[trblse]{1,2})?(-(xs|sm|md|lg|xl|\dxl))?$/,
  /^shadow(-(2xs|xs|sm|md|lg|xl|2xl|inner))?$/,
  /^font-(thin|extralight|light|normal|semibold|extrabold|black)$/,
  /^text-(xs|sm|base|lg|xl|\dxl)$/,
  /^leading-(tight|snug|normal|relaxed|loose)$/,
  /^tracking-(tighter|tight|normal|wide|wider|widest)$/,
  /^ease-(in|out|in-out)$/,
  /^animate-(spin|ping|pulse|bounce)$/,
  // Tailwind does not read durations from the theme, so `duration-*` still compiles;
  // transitions take the motion tokens through their defaults (DESIGN.md section 6).
  /^duration-/,
];

// A colour is a token of tokens.css, never a value written in a component. The
// lookahead keeps in-page anchors such as `#add-row` out.
const HEX_COLOUR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;

const STRING_LITERAL = /"[^"\n]*"|'[^'\n]*'|`[^`]*`/g;

function baseClass(token: string): string {
  return (token.split(":").pop() ?? "").replace(/^!|!$/g, "");
}

function findForbiddenClasses(source: string): string[] {
  // Quotes and braces also split, for the classes picked inside a template literal.
  const tokens = (source.match(STRING_LITERAL) ?? []).flatMap((literal) =>
    literal.split(/[\s"'`${}]+/),
  );
  return tokens.filter((token) => {
    const base = baseClass(token);
    return FORBIDDEN_CLASSES.some((pattern) => pattern.test(base));
  });
}

/** Every class of `source` that the identity refuses, then every hex colour of a component. */
export function findIdentityViolations(source: string, fileName: string): string[] {
  const hexColours = fileName.endsWith(".tsx") ? (source.match(HEX_COLOUR) ?? []) : [];
  return [...findForbiddenClasses(source), ...hexColours];
}
