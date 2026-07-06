import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8"),
) as { version: string };

/**
 * Build modes:
 *
 *   • `pnpm web:build` — default. Browser SPA: full transport
 *     picker (SLCAN / RPC), PWA service worker, persisted
 *     config. Deployed to dashx.bimmerz.app etc.
 *
 *   • `pnpm web:build:embedded` — dongle build. The SPA is hosted by
 *     the bimmerz-box at `/dashx/`, talking back to the same origin
 *     for CAN (`/rpc/can/0`):
 *       - `__EMBEDDED__` compile-time constant tree-shakes the
 *         transport picker / source toggle.
 *       - Source locked to `"rpc"` + `${origin}/rpc/can/0` (see
 *         `lib/embedded.ts`).
 *       - PWA service worker dropped (no internet, no autoUpdate).
 *
 * Persisted theme + logging + UI prefs ride along normally in both.
 */
export default defineConfig(({ mode }) => {
  const isEmbedded = mode === "embedded";
  return {
    /* Embedded build mounts at `/dashx/`; the firmware serves
       sibling apps (`/ediabasx/`, `/inpax/`, `/ncsx/`, `/nfsx/`,
       `/dashx/`) at one HTTP root with `/rpc/*` + `/data/` as
       siblings. */
    base: isEmbedded ? "/dashx/" : "/",
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __EMBEDDED__: JSON.stringify(isEmbedded),
    },
    plugins: [
      svelte(),
      /* Bimmerz Box app manifest. The dongle's dashboard auto-
         discovers apps under `/sdcard/apps/<slug>/` and reads each
         folder's `manifest.json` to render a tile — see
         https://github.com/emdzej/bimmerz-box#app-manifest. Emitting
         from the plugin (not a static file in `public/`) keeps the
         `version` field in lockstep with package.json without a
         manual bump on every release. Only relevant to the embedded
         build. */
      isEmbedded && {
        name: "dashx-embedded-manifest",
        apply: "build" as const,
        generateBundle(): void {
          this.emitFile({
            type: "asset",
            fileName: "manifest.json",
            source: JSON.stringify(
              {
                name: "DASHX",
                description: "Live CAN dashboard — gauges, lamps, frame log",
                version: pkg.version,
                icon: "icon.svg",
                /* Advisory — the dashboard flags tiles whose
                   requirements aren't met by the dongle hardware.
                   Dashx drives CAN via `/rpc/can/0` (BMW PT-CAN /
                   F-CAN buses through the dongle's TJA1051T
                   transceivers). */
                requires: ["can"],
              },
              null,
              2,
            ) + "\n",
          });
        },
      },
      /* PWA skipped in the embedded build — no offline-cache benefit
         on hardware with no internet. */
      !isEmbedded &&
        VitePWA({
          registerType: "autoUpdate",
          includeAssets: ["icon.svg"],
          manifest: {
            name: "DASHX",
            short_name: "DASHX",
            description: "Live CAN dashboard for BMW (and future) vehicles.",
            theme_color: "#22c55e",
            background_color: "#09090b",
            display: "standalone",
            start_url: "/",
            scope: "/",
            icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }],
          },
          workbox: {
            maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
            navigateFallback: "/index.html",
          },
        }),
    ],
    server: {
      /* Sidestep ediabasx-web (5173), inpax-web (5174), ncsx-web (5175). */
      port: 5176,
    },
    optimizeDeps: {
      /* `@emdzej/bimmerz-ui` ships source-only `.svelte` +
         `.svelte.ts`. Excluded from pre-bundling so each file goes
         through `@sveltejs/vite-plugin-svelte`'s transform on-demand
         — esbuild lacks the loader for those extensions and would
         choke on TS syntax in a `.svelte.ts` rune helper. Same
         pattern the ediabasx / inpax / ncsx web apps use. */
      exclude: ["@emdzej/bimmerz-ui"],
    },
    build: {
      outDir: isEmbedded ? "dist-embedded" : "dist",
      sourcemap: !isEmbedded,
      /* virtual:pwa-register is gated behind !isEmbedded in main.ts
         but Rollup resolves the specifier statically; mark it
         external in the embedded build to suppress the resolve. */
      rollupOptions: isEmbedded
        ? { external: ["virtual:pwa-register"] }
        : undefined,
    },
  };
});
