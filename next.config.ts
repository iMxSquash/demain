import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { CLIENT_STALE_SECONDS } from "./src/cache-lifetime";
import { STATIC_SECURITY_HEADERS } from "./src/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Caching follows ADR-023: database reads are cached in memory behind one tag that every server
// action refreshes after a write.
const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Statement files are uploaded through a server action. This must stay above
    // MAX_IMPORT_FILE_BYTES (20 MB) to leave room for the multipart overhead.
    serverActions: { bodySizeLimit: "21mb" },
    staleTimes: { dynamic: CLIENT_STALE_SECONDS },
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
