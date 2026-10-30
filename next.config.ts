import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { STATIC_SECURITY_HEADERS } from "./src/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Statement files are uploaded through a server action. This must stay above
    // MAX_IMPORT_FILE_BYTES (20 MB) to leave room for the multipart overhead.
    serverActions: { bodySizeLimit: "21mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: STATIC_SECURITY_HEADERS }];
  },
};

export default withNextIntl(nextConfig);
