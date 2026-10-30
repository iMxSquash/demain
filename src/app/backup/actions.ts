"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { messageRef } from "../../domain/message";
import { restoreSnapshot } from "../../export/snapshot";
import { withDatabaseAsync } from "../../storage/with-database";
import { readText, type AuthFormState } from "../auth/auth-form-data";
import { confirmPassword } from "../auth/confirm-password";
import { requireSession } from "../auth/session";
import { getTranslator } from "../translator";
import {
  describeBackupFailure,
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
export async function restoreSnapshotAction(
  _previous: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState | null> {
  await requireSession();
  const translate = await getTranslator();

  const file = formData.get("snapshot");
  if (!(file instanceof File) || file.size === 0) {
    return { message: translate(messageRef("backupFileMissing")) };
  }
  if (file.size > MAX_SNAPSHOT_FILE_BYTES) {
    return {
      message: translate(messageRef("backupFileTooLarge", { max: MAX_SNAPSHOT_FILE_MEGABYTES })),
    };
  }
  const refusal = await confirmPassword(formData, translate);
  if (refusal) {
    return { message: refusal };
  }

  try {
    const snapshot = Buffer.from(await file.arrayBuffer());
    await withDatabaseAsync((db) =>
      restoreSnapshot(db, snapshot, readText(formData, "snapshotPassword")),
    );
  } catch (error) {
    return { message: describeBackupFailure(error, translate) };
  }

  revalidatePath("/", "layout");
  redirect(LOGIN_PATH);
}
