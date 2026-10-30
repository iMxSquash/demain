import { authenticatePassword } from "../../auth/owner";
import { messageRef, type Translate } from "../../domain/message";
import { withDatabaseAsync } from "../../storage/with-database";
import { readText } from "./auth-form-data";
import { clientAddress, loginLimiter, tooManyAttemptsMessage } from "./limiters";

/**
 * Sensitive changes ask for the password again: a stolen session is not
 * enough. Reads the `password` field of the form. Returns the message of the
 * refusal, or null once confirmed. A wrong password counts against the same
 * budget as a failed login.
 */
export async function confirmPassword(
  formData: FormData,
  translate: Translate,
): Promise<string | null> {
  const client = await clientAddress();
  const now = Date.now();

  const gate = loginLimiter.check(client, now);
  if (!gate.allowed) {
    return tooManyAttemptsMessage(translate, gate.retryAfterMs);
  }
  const isPasswordRight = await withDatabaseAsync((db) =>
    authenticatePassword(db, readText(formData, "password")),
  );
  if (!isPasswordRight) {
    loginLimiter.recordFailure(client, now);
    return translate(messageRef("authPasswordWrong"));
  }
  loginLimiter.reset(client);
  return null;
}
