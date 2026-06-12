<script lang="ts">
  import { app } from "../lib/state.svelte";

  function close(): void {
    app.showAbout = false;
  }
</script>

{#if app.showAbout}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={close}
    onkeydown={(e) => e.key === "Escape" && close()}
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      class="w-full max-w-md rounded border border-rule bg-surface shadow-2xl"
      role="document"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="flex items-baseline justify-between border-b border-divider px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-muted">About</h2>
        <button class="text-xs text-faint underline-offset-2 hover:text-muted hover:underline" onclick={close}>close</button>
      </header>
      <section class="space-y-3 px-4 py-4 text-sm">
        <p>
          <span class="font-semibold text-accent">DASHX</span>
          <span class="ml-2 text-xs text-faint">v{__APP_VERSION__}</span>
        </p>
        <p class="text-xs text-faint">
          Live CAN dashboard for BMW (and future) vehicles. Pure
          listen / cycle messages — no diagnostic protocols.
        </p>
        <p class="text-xs text-faint">
          See
          <a
            href="https://github.com/emdzej/dashx"
            target="_blank"
            rel="noopener noreferrer"
            class="text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            github.com/emdzej/dashx
          </a>
          for source + release notes.
        </p>
      </section>
    </div>
  </div>
{/if}
