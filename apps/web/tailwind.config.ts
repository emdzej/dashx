import type { Config } from "tailwindcss";
import bimmerzPreset from "@emdzej/bimmerz-theme";

/**
 * DASHX accent: blue-600 — matches ncsx so the bimmerz family reads
 * as one app suite. The wider family already shares the
 * `@emdzej/bimmerz-theme` tokens (bg-base/surface/elevated,
 * text-foreground/muted/faint, border-divider, font-mono, dark mode
 * via `.dark`) — only the accent slot is per-app, and DASHX leans on
 * ncsx's tone since both surface live read-only data against the
 * same dark theme. BMW M-palette colours (`bg-m-red` for danger
 * lamps, `bg-m-gradient` for brand) come from the preset.
 */
export default {
  presets: [bimmerzPreset],
  content: [
    "./index.html",
    "./src/**/*.{ts,svelte}",
    /* Pull in widgets' Tailwind classes so they don't tree-shake
       to nothing in the consumer bundle. The package ships
       source-only Svelte; classes live in those files. */
    "../../packages/widgets/src/**/*.svelte",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#2563eb", // blue-600 — matches ncsx
          muted: "#1e40af",   // blue-800
        },
      },
    },
  },
} satisfies Config;
