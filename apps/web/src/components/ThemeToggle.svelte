<script lang="ts">
  /**
   * Cycle-style theme toggle for the top bar — one click steps
   * through light → dark → system → light. The icon reflects the
   * user's *choice* (not the resolved theme), so `"system"` shows
   * a half-moon glyph rather than sun/moon — important because
   * clicking needs to feel like changing the setting, not the
   * screen the user is looking at.
   *
   * Mirrors inpax's ThemeToggle so the bimmerz family behaves
   * identically across apps. Persistence + resolution live in
   * `theme.svelte.ts`; App.svelte's `$effect` applies the `.dark`
   * class on `<html>` whenever `app.config.theme` changes.
   */

  import { app } from "../lib/state.svelte";
  import { cycleTheme } from "../lib/theme.svelte";

  const icon = $derived(
    app.config.theme === "light"
      ? "☀"
      : app.config.theme === "dark"
        ? "☾"
        : "◐",
  );

  const label = $derived(
    app.config.theme === "light"
      ? "Light theme — click to switch to dark"
      : app.config.theme === "dark"
        ? "Dark theme — click to follow system"
        : "Theme follows system — click to switch to light",
  );
</script>

<button
  type="button"
  class="rounded p-1 text-lg leading-none text-muted hover:bg-elevated hover:text-foreground"
  title={label}
  aria-label={label}
  onclick={cycleTheme}
>
  <span aria-hidden="true">{icon}</span>
</button>
