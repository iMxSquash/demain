import { messageRef, type Translate } from "../../domain/message";
import { readText } from "../auth/auth-form-data";

const HTTP_UNAUTHORIZED = 401;
const HTTP_BAD_REQUEST = 400;
const ISO_DATE_LENGTH = 10;

/** Route handlers answer instead of redirecting: the caller is a fetch, not a navigation. */
export function unauthorized(translate: Translate): Response {
  return Response.json(
    { message: translate(messageRef("backupSessionExpired")) },
    { status: HTTP_UNAUTHORIZED },
  );
}

export function errorResponse(message: string): Response {
  return Response.json({ message }, { status: HTTP_BAD_REQUEST });
}

/**
 * The password typed twice, so that a typo cannot lock the owner out of their
 * own backup. Returns the response to send back when the two differ.
 */
export function readConfirmedPassword(
  formData: FormData,
  translate: Translate,
): { password: string } | { errorResponse: Response } {
  const password = readText(formData, "password");
  if (password !== readText(formData, "passwordConfirmation")) {
    return { errorResponse: errorResponse(translate(messageRef("authPasswordMismatch"))) };
  }
  return { password };
}

export function fileResponse(file: Buffer, fileName: string): Response {
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(file.length),
      // Financial data: no browser or proxy cache keeps a copy.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function todayStamp(now: Date): string {
  return now.toISOString().slice(0, ISO_DATE_LENGTH);
}
