export type BackupErrorCode =
  | "passwordTooShort"
  | "notABackup"
  | "unsupportedFormat"
  | "wrongKind"
  | "wrongPasswordOrCorrupt"
  | "invalidDatabase"
  | "newerSchema"
  | "invalidOverflowChain";

/** A refusal the user can act on, as opposed to a bug worth a stack trace. */
export class BackupError extends Error {
  constructor(readonly code: BackupErrorCode) {
    super(code);
    this.name = "BackupError";
  }
}
