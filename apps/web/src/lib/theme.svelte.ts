/**
 * Theme persistence + resolution helpers. Mirrors the ncsx / inpax
 * convention so the bimmerz family handles theme identically:
 *
 *   • `app.config.theme` is the user's *choice* — `"light"`,
 *     `"dark"`, or `"system"`. Persisted to localStorage.
 *   • `isDarkTheme()` resolves that choice into a concrete bool,
 *     consulting `prefers-color-scheme` for the `"system"` branch.
 *   • `cycleTheme()` steps through light → dark → system → light;
 *     the top-bar `ThemeToggle` calls it on click.
 *
 * App.svelte owns the `$effect` that flips `.dark` on `<html>` and
 * subscribes to `matchMedia` while the user is on `"system"`. That
 * effect re-runs when `app.config.theme` changes, so flipping the
 * toggle propagates immediately.
 */

import { app } from "./state.svelte";
import { saveConfig, type ThemeChoice } from "./config";

/** Persist + apply a theme choice. */
export function setTheme(choice: ThemeChoice): void {
  app.config.theme = choice;
  saveConfig(app.config);
}

/** Step through light → dark → system → light. Used by the toggle. */
export function cycleTheme(): void {
  const order: ThemeChoice[] = ["light", "dark", "system"];
  const idx = order.indexOf(app.config.theme);
  setTheme(order[(idx + 1) % order.length]!);
}

/**
 * Resolve the user's theme choice into a concrete light/dark flag.
 * For `"system"` we consult `prefers-color-scheme` at call time.
 * Safe in SSR / pre-DOM contexts (returns the light branch).
 */
export function isDarkTheme(): boolean {
  if (app.config.theme === "dark") return true;
  if (app.config.theme === "light") return false;
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
