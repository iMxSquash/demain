import { describe, expect, it, vi } from "vitest";

import { importAction } from "../../../src/app/imports/actions";
import { MAX_IMPORT_FILE_BYTES } from "../../../src/app/imports/import-form-data";
import { translateKey } from "../translate-key";

vi.mock("next-intl/server", () => ({
  getLocale: async () => "en",
  getTranslations: async () => (key: string) => key,
}));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));
vi.mock("../../../src/app/revalidate-ledger", () => ({ revalidateLedger: () => undefined }));

function importForm(file: File): FormData {
  const form = new FormData();
  form.set("accountId", "1");
  form.set("file", file);
  return form;
}

describe("import upload limit", () => {
  it("refuses a file above the limit without reading it", async () => {
    const file = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], "statement.csv");
    const read = vi.spyOn(file, "arrayBuffer");

    const state = await importAction(null, importForm(file));

    expect(state.status).toBe("error");
    expect(state.message).toBe("fileTooLarge");
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses an empty file", async () => {
    const state = await importAction(null, importForm(new File([], "statement.csv")));

    expect(state.message).toBe("fileEmpty");
  });
});
