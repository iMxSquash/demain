import { describe, expect, it, vi } from "vitest";

import { restoreSnapshotAction } from "../../../src/app/backup/actions";
import { MAX_SNAPSHOT_FILE_BYTES } from "../../../src/app/backup/backup-feedback";
import { translateKey } from "../translate-key";

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/translator", () => ({ getTranslator: async () => translateKey }));

function restoreForm(file: File): FormData {
  const form = new FormData();
  form.set("snapshot", file);
  return form;
}

describe("snapshot upload limit", () => {
  it("refuses a snapshot above the limit before asking for any password", async () => {
    const file = new File([new Uint8Array(MAX_SNAPSHOT_FILE_BYTES + 1)], "demain.dmbk");
    const read = vi.spyOn(file, "arrayBuffer");

    const state = await restoreSnapshotAction(null, restoreForm(file));

    expect(state?.message).toBe("backupFileTooLarge");
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a missing or empty file", async () => {
    const state = await restoreSnapshotAction(null, restoreForm(new File([], "demain.dmbk")));

    expect(state?.message).toBe("backupFileMissing");
  });
});
