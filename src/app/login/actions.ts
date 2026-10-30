"use server";

import { redirect } from "next/navigation";

import { authenticatePassword, isTotpEnabled, verifySecondFactor } from "../../auth/owner";
import { completeMfa, createSession, getSession, revokeSession } from "../../auth/sessions";
import { messageRef } from "../../domain/message";
import { withDatabase, withDatabaseAsync } from "../../storage/with-database";
import { readText } from "../auth/auth-form-data";
import { clientAddress, loginLimiter, tooManyAttempts, totpLimiter } from "../auth/limiters";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "../auth/session";
import { refuse } from "../auth/refuse";
import { flashSuccess } from "../feedback/flash";

const HOME_PATH = "/";
const LOGIN_PATH = "/login";
const TOTP_PATH = "/login/totp";

export async function loginAction(_previous: null, formData: FormData): Promise<null> {
  const client = await clientAddress();
  const now = new Date();

  const gate = loginLimiter.check(client, now.getTime());
  if (!gate.allowed) {
    return refuse(tooManyAttempts(gate.retryAfterMs));
  }

  const password = readText(formData, "password");
  const session = await withDatabaseAsync(async (db) => {
    if (!(await authenticatePassword(db, password))) {
      return null;
    }
    const mfaPending = isTotpEnabled(db);
    return { mfaPending, token: createSession(db, now, { mfaPending }) };
  });
  if (!session) {
    loginLimiter.recordFailure(client, now.getTime());
    return refuse(messageRef("authInvalidCredentials"));
  }

  loginLimiter.reset(client);
  await setSessionCookie(session.token, session.mfaPending);
  redirect(session.mfaPending ? TOTP_PATH : HOME_PATH);
}

export async function verifyTotpAction(_previous: null, formData: FormData): Promise<null> {
  const client = await clientAddress();
  const token = await readSessionToken();
  const now = new Date();

  const pending = token ? withDatabase((db) => getSession(db, token, now)) : null;
  if (!token || !pending?.mfaPending) {
    redirect(LOGIN_PATH);
  }

  const gate = totpLimiter.check(client, now.getTime());
  if (!gate.allowed) {
    return refuse(tooManyAttempts(gate.retryAfterMs));
  }

  const verified = withDatabase((db) => {
    if (!verifySecondFactor(db, readText(formData, "code"), now)) {
      return false;
    }
    completeMfa(db, token, now);
    return true;
  });
  if (!verified) {
    totpLimiter.recordFailure(client, now.getTime());
    return refuse(messageRef("authInvalidCode"));
  }

  totpLimiter.reset(client);
  await setSessionCookie(token, false);
  redirect(HOME_PATH);
}

export async function logoutAction(): Promise<void> {
  const token = await readSessionToken();
  if (token) {
    withDatabase((db) => revokeSession(db, token));
  }
  await clearSessionCookie();
  await flashSuccess("signedOut");
  redirect(LOGIN_PATH);
}
