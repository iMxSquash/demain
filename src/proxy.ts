import { NextResponse, type NextRequest } from "next/server";

import { hasOwner } from "./auth/owner";
import { getSession } from "./auth/sessions";
import { SESSION_COOKIE } from "./app/auth/session";
import { withDatabase } from "./storage/with-database";

const PUBLIC_PATHS = new Set(["/login", "/login/totp", "/setup"]);

/**
 * Deny by default: anything but the sign-in pages needs a complete session,
 * and a fresh instance sends everyone to the setup page.
 */
export function proxy(request: NextRequest) {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return NextResponse.next();
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const redirectTo = withDatabase((db) => {
    if (!hasOwner(db)) {
      return "/setup";
    }
    const session = token ? getSession(db, token, new Date()) : null;
    return session && !session.mfaPending ? null : "/login";
  });
  return redirectTo
    ? NextResponse.redirect(new URL(redirectTo, request.url))
    : NextResponse.next();
}

export const config = {
  // Static assets carry no data and must load on the sign-in pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
