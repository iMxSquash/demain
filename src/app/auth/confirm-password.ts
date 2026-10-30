import { authenticatePassword } from "../../auth/owner";
import { messageRef, type MessageRef } from "../../domain/message";
import { withDatabaseAsync } from "../../storage/with-database";
import { readText } from "./auth-form-data";
import { clientAddress, loginLimiter, tooManyAttempts } from "./limiters";

/**
 * Sensitive changes ask for the password again: a stolen session is not
 * enough. Reads the `password` field of the form. Returns the reason of the
 * refusal, or null once confirmed. A wrong password counts against the same
 * budget as a failed login.
 */
export async function confirmPassword(formData: FormData): Promise<MessageRef | null> {
  const client = await clientAddress();
  const now = Date.now();

  const gate = loginLimiter.check(client, now);
  if (!gate.allowed) {
    return tooManyAttempts(gate.retryAfterMs);
  }
  const isPasswordRight = await withDatabaseAsync((db) =>
    authenticatePassword(db, readText(formData, "password")),
  );
  if (!isPasswordRight) {
    loginLimiter.recordFailure(client, now);
    return messageRef("authPasswordWrong");
  }
  loginLimiter.reset(client);
  return null;
}
