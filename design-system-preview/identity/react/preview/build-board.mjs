// Bundles board.tsx and inlines it in brand-board.html, between the board-chart markers.
// Run from the repository root: node design-system-preview/identity/react/preview/build-board.mjs
// esbuild comes with the repository's tooling (through tsx); it is not a direct dependency.
//
// Two passes: the first keeps identifiers readable, so the CSS module class names stay long
// (trajectory_chart_*) and cannot collide with the board's own short classes; the second
// minifies the JS alone, where those names are strings it does not touch. One pass that does
// both renames the classes to `.r`, `.t`... and breaks the board.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, transform } from "esbuild";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const BOARD = fileURLToPath(new URL("../../brand-board.html", import.meta.url));
const TARGET = "es2020";

const bundled = await build({
  entryPoints: [`${HERE}board.tsx`],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  loader: { ".module.css": "local-css" },
  define: { "process.env.NODE_ENV": '"production"' },
  minifyWhitespace: true,
  minifySyntax: true,
  legalComments: "none",
  target: TARGET,
  outdir: "board-chart",
  write: false,
});
const output = (extension) => {
  const file = bundled.outputFiles.find((entry) => entry.path.endsWith(extension));
  if (!file) throw new Error(`esbuild produced no ${extension} file`);
  return file.text;
};
const { code } = await transform(output(".js"), { minify: true, legalComments: "none", target: TARGET });

/** Replaces the content of the one `<tag id="id">` block of the page, escaping its closing tag. */
function inline(page, tag, id, text) {
  const block = new RegExp(`<${tag} id="${id}">[\\s\\S]*?</${tag}>`, "g");
  const count = page.match(block)?.length ?? 0;
  if (count !== 1) throw new Error(`brand-board.html has ${count} <${tag} id="${id}"> blocks, expected 1`);
  const body = text.replaceAll(`</${tag}`, `<\\/${tag}`);
  return page.replace(block, () => `<${tag} id="${id}">${body}</${tag}>`);
}

const css = output(".css");
let page = readFileSync(BOARD, "utf8");
page = inline(page, "style", "board-chart-css", css);
page = inline(page, "script", "board-chart", code);
writeFileSync(BOARD, page);
console.log(`Inlined ${code.length} bytes of JS and ${css.length} bytes of CSS in brand-board.html`);
