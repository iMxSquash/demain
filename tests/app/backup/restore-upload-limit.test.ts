import { beforeEach, describe, expect, it, vi } from "vitest";

import { restoreSnapshotAction } from "../../../src/app/backup/actions";
import { MAX_SNAPSHOT_FILE_BYTES } from "../../../src/app/backup/backup-feedback";
import type { MessageRef } from "../../../src/domain/message";

const flashed = vi.hoisted(() => ({ errors: [] as MessageRef[] }));

vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: () => undefined }));
vi.mock("../../../src/app/auth/session", () => ({ requireSession: async () => undefined }));
vi.mock("../../../src/app/feedback/flash", () => ({
  flashError: async (ref: MessageRef) => {
    flashed.errors.push(ref);
  },
  flashSuccess: async () => undefined,
}));

function restoreForm(file: File): FormData {
  const form = new FormData();
  form.set("snapshot", file);
  return form;
}

describe("snapshot upload limit", () => {
  beforeEach(() => {
    flashed.errors.length = 0;
  });

  it("refuses a snapshot above the limit before asking for any password", async () => {
    const file = new File([new Uint8Array(MAX_SNAPSHOT_FILE_BYTES + 1)], "demain.dmbk");
    const read = vi.spyOn(file, "arrayBuffer");

    await restoreSnapshotAction(null, restoreForm(file));

    expect(flashed.errors.map((ref) => ref.key)).toEqual(["backupFileTooLarge"]);
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a missing or empty file", async () => {
    await restoreSnapshotAction(null, restoreForm(new File([], "demain.dmbk")));

    expect(flashed.errors.map((ref) => ref.key)).toEqual(["backupFileMissing"]);
  });
});
