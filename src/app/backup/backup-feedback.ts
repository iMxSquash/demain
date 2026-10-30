import { BackupError, type BackupErrorCode } from "../../export/backup-error";
import { MIN_BACKUP_PASSWORD_LENGTH } from "../../export/envelope";
import { messageRef, type FeedbackKey, type MessageRef, type Translate } from "../../domain/message";

const BYTES_PER_MEGABYTE = 1024 * 1024;
// Server actions accept 21 MB (next.config.ts): this stays under it.
export const MAX_SNAPSHOT_FILE_BYTES = 20 * BYTES_PER_MEGABYTE;
export const MAX_SNAPSHOT_FILE_MEGABYTES = MAX_SNAPSHOT_FILE_BYTES / BYTES_PER_MEGABYTE;

const FEEDBACK_KEYS: Record<BackupErrorCode, FeedbackKey> = {
  passwordTooShort: "backupPasswordTooShort",
  notABackup: "backupNotABackup",
  unsupportedFormat: "backupUnsupportedFormat",
  wrongKind: "backupWrongKind",
  wrongPasswordOrCorrupt: "backupWrongPasswordOrCorrupt",
  invalidDatabase: "backupInvalidDatabase",
  newerSchema: "backupNewerSchema",
  invalidOverflowChain: "backupInvalidOverflowChain",
};

/**
 * The message for a failed backup operation. Anything but a `BackupError` is a
 * bug or an I/O failure: the user gets a generic message and the detail goes
 * to the server log, never a stack trace and never anything from the data.
 */
export function describeBackupFailure(error: unknown, translate: Translate): string {
  if (error instanceof BackupError) {
    const ref: MessageRef =
      error.code === "passwordTooShort"
        ? messageRef(FEEDBACK_KEYS[error.code], { min: MIN_BACKUP_PASSWORD_LENGTH })
        : messageRef(FEEDBACK_KEYS[error.code]);
    return translate(ref);
  }
  console.error("Backup operation failed:", error instanceof Error ? error.message : "unknown error");
  return translate(messageRef("backupFailed"));
}
