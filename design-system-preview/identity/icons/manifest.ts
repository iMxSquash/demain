import type { MetadataRoute } from "next";

// A manifest cannot read CSS variables: these are the values of the tokens named.
const LIGHT_BACKGROUND = "#ebebeb"; // --color-bg, light (gray-100)

/**
 * Web app manifest, served by Next.js from src/app/manifest.ts. The PNG files go in
 * public/icons/. The favicon (logo/favicon.svg as src/app/icon.svg) and the Apple touch
 * icon (src/app/apple-icon.png) use the App Router file conventions instead.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Demain",
    start_url: "/",
    display: "standalone",
    // The splash screen and the title bar before the page paints. The light ground is
    // the default theme; the dark tile of the icon stays visible on it.
    background_color: LIGHT_BACKGROUND,
    theme_color: LIGHT_BACKGROUND,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
