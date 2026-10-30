import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import {
  buildContentSecurityPolicy,
  STATIC_SECURITY_HEADERS,
} from "../../src/security-headers";

function directive(policy: string, name: string): string[] {
  const found = policy
    .split(";")
    .map((part) => part.trim().split(/\s+/))
    .find(([directiveName]) => directiveName === name);
  return found ? found.slice(1) : [];
}

describe("content security policy", () => {
  const policy = buildContentSecurityPolicy("abc123", false);

  it("allows scripts and styles only from the app itself or with the request nonce", () => {
    expect(directive(policy, "script-src")).toEqual([
      "'self'",
      "'nonce-abc123'",
      "'strict-dynamic'",
    ]);
    expect(directive(policy, "style-src")).toEqual(["'self'", "'nonce-abc123'"]);
  });

  it("never allows inline or eval code in production", () => {
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("allows eval in development only, where React needs it", () => {
    expect(directive(buildContentSecurityPolicy("abc123", true), "script-src")).toContain(
      "'unsafe-eval'",
    );
  });

  it("blocks plugins, framing and any request to another origin", () => {
    expect(directive(policy, "default-src")).toEqual(["'self'"]);
    expect(directive(policy, "connect-src")).toEqual(["'self'"]);
    expect(directive(policy, "object-src")).toEqual(["'none'"]);
    expect(directive(policy, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(policy, "form-action")).toEqual(["'self'"]);
    expect(directive(policy, "base-uri")).toEqual(["'self'"]);
  });
});

describe("static security headers", () => {
  const byKey = new Map(STATIC_SECURITY_HEADERS.map(({ key, value }) => [key, value]));

  it("sets the headers required by the architecture document", () => {
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Referrer-Policy")).toBe("no-referrer");
    expect(byKey.get("Strict-Transport-Security")).toMatch(/^max-age=\d{8,}/);
    expect(byKey.get("Permissions-Policy")).toContain("camera=()");
  });

  it("applies them to every route of the app", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];

    expect(rules).toEqual([{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }]);
  });
});
