<script lang="ts">
  import { app } from "./lib/state.svelte";
  import { connect, disconnect } from "./lib/connection.svelte";
  import { isEmbedded } from "./lib/embedded";
  import { isDarkTheme } from "./lib/theme.svelte";
  import Dashboard from "./components/Dashboard.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import AboutDialog from "./components/AboutDialog.svelte";
  import ConnectButton from "./components/ConnectButton.svelte";
  import ThemeToggle from "./components/ThemeToggle.svelte";

  /* Display string for the right-side connection chip — the
     ConnectButton renders status; this is the source hint next to
     it ("via rpc · dongle"). */
  const sourceHint = $derived.by(() => {
    if (isEmbedded) return "dongle";
    switch (app.config.source) {
      case "rpc": return "rpc";
      case "serial": return "slcan";
      case "serial-ws": return "slcan-ws";
    }
  });

  /* Apply / clear the `.dark` class on <html> based on the resolved
     theme. Re-runs when `app.config.theme` changes and — while the
     user is on "system" — listens to `prefers-color-scheme` so
     flipping the OS theme updates the app live without a reload.
     Same pattern as inpax/ncsx so the bimmerz family behaves
     identically. */
  $effect(() => {
    const apply = () => {
      const html = document.documentElement;
      if (isDarkTheme()) html.classList.add("dark");
      else html.classList.remove("dark");
    };
    apply();

    if (app.config.theme !== "system") return;
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => apply();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  });
</script>

<div class="flex h-full flex-col">
  <header class="flex items-center gap-4 border-b border-divider bg-surface px-4 py-2 text-sm">
    <button
      class="font-semibold text-accent transition hover:text-accent-muted"
      onclick={() => (app.showAbout = true)}
      title="About DASHX"
    >
      DASHX
    </button>
    <span class="text-xs text-faint">{__APP_VERSION__}</span>

    {#if app.profile}
      <span class="ml-4 text-xs text-muted">
        {app.profile.label}
      </span>
    {/if}

    <span class="flex-1"></span>

    <span class="text-xs text-faint">via {sourceHint}</span>

    <ThemeToggle />

    <button
      class="rounded border border-divider bg-surface px-2 py-0.5 text-xs text-muted transition hover:border-accent hover:bg-elevated"
      onclick={() => (app.showSettings = true)}
      title="Configure source, vehicle profile, logging"
    >
      Settings
    </button>

    <ConnectButton {connect} {disconnect} />
  </header>

  {#if app.error}
    <div role="alert" class="flex items-start gap-3 border-b border-rule bg-red-50 px-4 py-2 text-sm text-red-900 dark:bg-red-950/60 dark:text-red-100">
      <span class="flex-1 break-words">{app.error}</span>
      <button
        type="button"
        class="ml-2 rounded px-2 py-0.5 text-xs text-red-900/70 hover:bg-red-100 hover:text-red-900 dark:text-red-100/70 dark:hover:bg-red-900/40 dark:hover:text-red-100"
        aria-label="Dismiss error"
        onclick={() => (app.error = null)}
      >
        ✕
      </button>
    </div>
  {/if}

  <main class="min-h-0 flex-1 overflow-auto">
    <Dashboard />
  </main>
</div>

<SettingsDialog />
<AboutDialog />
