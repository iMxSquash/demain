import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export interface SourceFile {
  /** Path from the repository root, as error messages print it. */
  relative: string;
  text: string;
  /** Code lines only, trimmed: comments are prose, not calls. */
  codeLines: { line: number; text: string }[];
}

/** Every `.ts` and `.tsx` file under `directory` (relative to the repository root), for source guards. */
export function readSourceFiles(directory: string): SourceFile[] {
  return readdirSync(directory, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file))
    .map((file) => {
      const relative = path.join(directory, file);
      const text = readFileSync(relative, "utf8");
      return {
        relative,
        text,
        codeLines: text
          .split("\n")
          .map((line, index) => ({ line: index + 1, text: line.trim() }))
          .filter(({ text: code }) => !/^(\/\/|\/\*|\*)/.test(code)),
      };
    });
}
