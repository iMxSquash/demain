"use server";

import { redirect } from "next/navigation";

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, setupOwner } from "../../auth/owner";
import { createSession } from "../../auth/sessions";
import { messageRef } from "../../domain/message";
import { parseEnv } from "../../storage/env";
import { withDatabaseAsync } from "../../storage/with-database";
import { readText } from "../auth/auth-form-data";
import { refuse } from "../auth/refuse";
import { setSessionCookie } from "../auth/session";
import { flashSuccess } from "../feedback/flash";

export async function setupAction(_previous: null, formData: FormData): Promise<null> {
  const password = readText(formData, "password");
  if (password !== readText(formData, "confirm")) {
    return refuse(messageRef("authPasswordMismatch"));
  }

  const now = new Date();
  const outcome = await withDatabaseAsync(async (db) => {
    const result = await setupOwner(db, {
      providedToken: readText(formData, "token"),
      expectedToken: parseEnv(process.env).DEMAIN_SETUP_TOKEN,
      password,
      now,
    });
    return result.ok
      ? { ok: true as const, token: createSession(db, now, { mfaPending: false }) }
      : result;
  });

  if (outcome.ok) {
    await setSessionCookie(outcome.token, false);
    await flashSuccess("setupDone");
    redirect("/");
  }
  switch (outcome.reason) {
    case "alreadyConfigured":
      redirect("/login");
    case "tooShort":
      return refuse(messageRef("authPasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
    case "tooLong":
      return refuse(messageRef("authPasswordTooLong", { max: MAX_PASSWORD_LENGTH }));
    case "invalidToken":
      return refuse(messageRef("authSetupRefused"));
  }
}
