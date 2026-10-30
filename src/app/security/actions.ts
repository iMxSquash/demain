"use server";

import { revalidatePath } from "next/cache";

import { disableTotp, enableTotp } from "../../auth/owner";
import { messageRef } from "../../domain/message";
import { withDatabase } from "../../storage/with-database";
import { readText } from "../auth/auth-form-data";
import { confirmPassword } from "../auth/confirm-password";
import { refuse } from "../auth/refuse";
import { requireSession } from "../auth/session";
import { flashSuccess } from "../feedback/flash";

const SECURITY_PATH = "/security";
// The secret travels in a hidden field: refuse anything that is not a secret
// we could have generated, so a malformed value never reaches the decoder.
const SECRET_PATTERN = /^[A-Z2-7]{32}$/;

export interface EnrollState {
  backupCodes: string[];
}

export async function enableTotpAction(
  _previous: EnrollState | null,
  formData: FormData,
): Promise<EnrollState | null> {
  await requireSession();
  const secret = readText(formData, "secret");
  if (!SECRET_PATTERN.test(secret)) {
    return refuse(messageRef("authNotSaved"));
  }

  const refusal = await confirmPassword(formData);
  if (refusal) {
    return refuse(refusal);
  }

  const enabled = withDatabase((db) =>
    enableTotp(db, { secret, code: readText(formData, "code"), now: new Date() }),
  );
  if (!enabled) {
    return refuse(messageRef("authInvalidCode"));
  }
  // No revalidation and no toast: setting the notice cookie would refresh the
  // page, which would swap this form for the "on" state and the backup codes,
  // shown only once, would vanish before they are read. The codes screen is the notice.
  return { backupCodes: enabled.backupCodes };
}

/** Turning the second factor off asks for the password again, as turning it on does. */
export async function disableTotpAction(_previous: null, formData: FormData): Promise<null> {
  await requireSession();
  const refusal = await confirmPassword(formData);
  if (refusal) {
    return refuse(refusal);
  }

  withDatabase(disableTotp);
  revalidatePath(SECURITY_PATH);
  await flashSuccess("totpDisabled");
  return null;
}
