import { NextResponse, type NextRequest } from "next/server";

import { hasOwner } from "./auth/owner";
import { getSession } from "./auth/sessions";
import { SESSION_COOKIE } from "./app/auth/session";
import { buildContentSecurityPolicy } from "./security-headers";
import { withDatabase } from "./storage/with-database";

const PUBLIC_PATHS = new Set(["/login", "/login/totp", "/setup"]);

/** Where the request must go instead, or null when it may be served. */
function findRedirect(request: NextRequest): string | null {
  if (PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return null;
  }
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  return withDatabase((db) => {
    if (!hasOwner(db)) {
      return "/setup";
    }
    const session = token ? getSession(db, token, new Date()) : null;
    return session && !session.mfaPending ? null : "/login";
  });
}

/**
 * Deny by default: anything but the sign-in pages needs a complete session,
 * and a fresh instance sends everyone to the setup page. Every page served gets
 * a content security policy with a fresh nonce.
 */
export function proxy(request: NextRequest) {
  const redirectTo = findRedirect(request);
  if (redirectTo) {
    return NextResponse.redirect(new URL(redirectTo, request.url));
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  // Next.js reads the nonce from the policy of the request to stamp its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  // Static assets carry no data and must load on the sign-in pages.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
