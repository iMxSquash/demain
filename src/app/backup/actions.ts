"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { messageRef } from "../../domain/message";
import { restoreSnapshot } from "../../export/snapshot";
import { withDatabaseAsync } from "../../storage/with-database";
import { readText } from "../auth/auth-form-data";
import { confirmPassword } from "../auth/confirm-password";
import { refuse } from "../auth/refuse";
import { requireSession } from "../auth/session";
import { flashSuccess } from "../feedback/flash";
import {
  backupFailureRef,
  MAX_SNAPSHOT_FILE_BYTES,
  MAX_SNAPSHOT_FILE_MEGABYTES,
} from "./backup-feedback";

const LOGIN_PATH = "/login";

/**
 * Replaces the whole database with a snapshot. It cannot be undone from the
 * app, so the current password is asked again on top of the snapshot's own.
 * The sessions table is the snapshot's too: the user signs in again, with the
 * credentials the snapshot holds.
 */
export async function restoreSnapshotAction(_previous: null, formData: FormData): Promise<null> {
  await requireSession();

  const file = formData.get("snapshot");
  if (!(file instanceof File) || file.size === 0) {
    return refuse(messageRef("backupFileMissing"));
  }
  if (file.size > MAX_SNAPSHOT_FILE_BYTES) {
    return refuse(messageRef("backupFileTooLarge", { max: MAX_SNAPSHOT_FILE_MEGABYTES }));
  }
  const refusal = await confirmPassword(formData);
  if (refusal) {
    return refuse(refusal);
  }

  try {
    const snapshot = Buffer.from(await file.arrayBuffer());
    await withDatabaseAsync((db) =>
      restoreSnapshot(db, snapshot, readText(formData, "snapshotPassword")),
    );
  } catch (error) {
    return refuse(backupFailureRef(error));
  }

  revalidatePath("/", "layout");
  await flashSuccess("backupRestored");
  redirect(LOGIN_PATH);
}
