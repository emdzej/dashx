<script lang="ts">
  /**
   * Side panel hosting the raw frame log. Lives at the right edge
   * of the dashboard layout (`App.svelte`'s `<main>` row), parallel
   * to the dashboard content.
   *
   * Two states:
   *   • **collapsed** — 32 px-wide rail with a vertical "Frame log"
   *     label + the frame counter, click expands.
   *   • **expanded**  — fixed-width column (default 400 px). Header
   *     with title, counter, and collapse button; body fills the
   *     remaining height with the existing `FrameLog` table inside
   *     a scroll container.
   *
   * State is component-local and not persisted. Same pattern as the
   * old `<details bind:open>` it replaces — the user expects a fresh
   * page load to start with the log closed.
   */

  import { app } from "../lib/state.svelte";
  import { FrameLog } from "@emdzej/dashx-widgets";

  let open = $state(false);

  function toggle(): void {
    open = !open;
  }
</script>

<aside
  class="flex h-full shrink-0 flex-col border-l border-divider bg-surface transition-[width] duration-150 ease-out"
  class:w-96={open}
  class:w-8={!open}
  aria-label="Frame log"
>
  {#if open}
    <!-- Expanded header -->
    <div class="flex items-center justify-between border-b border-divider px-3 py-2">
      <div class="flex flex-col">
        <span class="text-xs font-semibold uppercase tracking-wider text-muted">
          Frame log
        </span>
        <span class="text-[10px] text-faint">
          {app.frames.length} {app.frames.length === 1 ? "frame" : "frames"}
        </span>
      </div>
      <button
        type="button"
        class="rounded p-1 text-faint transition hover:bg-elevated hover:text-foreground"
        onclick={toggle}
        title="Collapse panel"
        aria-label="Collapse frame log"
      >
        <!-- chevron right (→) — points the direction the panel will
             move when collapsed. -->
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="6 3, 11 8, 6 13" />
        </svg>
      </button>
    </div>
    <!-- Scrollable body — the FrameLog table handles its own
         sticky header inside this scroll container. -->
    <div class="min-h-0 flex-1 overflow-hidden">
      <div class="h-full overflow-auto">
        <FrameLog frames={app.frames} />
      </div>
    </div>
  {:else}
    <!-- Collapsed rail: full-height clickable button. The whole
         strip is the toggle so users can hit it without aiming. -->
    <button
      type="button"
      class="flex h-full w-full flex-col items-center justify-between gap-2 py-2 text-faint transition hover:bg-elevated hover:text-foreground"
      onclick={toggle}
      title="Expand frame log"
      aria-label="Expand frame log"
    >
      <!-- chevron left (←) at top so the panel hints which way it
           will expand. -->
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <polyline points="10 3, 5 8, 10 13" />
      </svg>
      <!-- Vertical label — uses CSS writing-mode so it reads from
           bottom to top (matches the chevron-up reading flow). -->
      <span
        class="select-none text-[10px] font-semibold uppercase tracking-wider"
        style="writing-mode: vertical-rl; transform: rotate(180deg);"
      >
        Frame log · {app.frames.length}
      </span>
      <span></span>
    </button>
  {/if}
</aside>
