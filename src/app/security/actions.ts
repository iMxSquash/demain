"use server";

import { revalidatePath } from "next/cache";

import { disableTotp, enableTotp } from "../../auth/owner";
import { messageRef } from "../../domain/message";
import { withDatabase } from "../../storage/with-database";
import { readText, type AuthFormState } from "../auth/auth-form-data";
import { confirmPassword } from "../auth/confirm-password";
import { requireSession } from "../auth/session";
import { getTranslator } from "../translator";

const SECURITY_PATH = "/security";
// The secret travels in a hidden field: refuse anything that is not a secret
// we could have generated, so a malformed value never reaches the decoder.
const SECRET_PATTERN = /^[A-Z2-7]{32}$/;

export interface EnrollState {
  message?: string;
  backupCodes?: string[];
}

export async function enableTotpAction(
  _previous: EnrollState | null,
  formData: FormData,
): Promise<EnrollState | null> {
  await requireSession();
  const translate = await getTranslator();
  const secret = readText(formData, "secret");
  if (!SECRET_PATTERN.test(secret)) {
    return { message: translate(messageRef("authNotSaved")) };
  }

  const refusal = await confirmPassword(formData, translate);
  if (refusal) {
    return { message: refusal };
  }

  const enabled = withDatabase((db) =>
    enableTotp(db, { secret, code: readText(formData, "code"), now: new Date() }),
  );
  if (!enabled) {
    return { message: translate(messageRef("authInvalidCode")) };
  }
  // No revalidation: the page would swap this form for the "on" state and the
  // backup codes, shown only once, would vanish before they are read.
  return { backupCodes: enabled.backupCodes };
}

/** Turning the second factor off asks for the password again, as turning it on does. */
export async function disableTotpAction(
  _previous: AuthFormState | null,
  formData: FormData,
): Promise<AuthFormState | null> {
  await requireSession();
  const refusal = await confirmPassword(formData, await getTranslator());
  if (refusal) {
    return { message: refusal };
  }

  withDatabase(disableTotp);
  revalidatePath(SECURITY_PATH);
  return null;
}
