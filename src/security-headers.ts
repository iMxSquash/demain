export const STATIC_SECURITY_HEADERS = [
  // Two years. Browsers ignore it over plain HTTP: it takes effect behind the HTTPS reverse proxy.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * The policy depends on a per-request nonce, so it is set by the proxy and not
 * by next.config.ts. `strict-dynamic` lets the nonced bootstrap load the rest.
 */
export function buildContentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  // React rebuilds server stacks with eval in development only.
  const devEval = isDevelopment ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
