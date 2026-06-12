<script lang="ts">
  import { onMount } from "svelte";
  import { app } from "./lib/state.svelte";
  import { connect, disconnect } from "./lib/connection.svelte";
  import { isEmbedded } from "./lib/embedded";
  import { isDarkTheme } from "./lib/theme.svelte";
  import { BUNDLED_DBC_IDS, loadBundledDbcProfile } from "./lib/dbc-profiles.svelte";
  import { chartConfig } from "@emdzej/dashx-widgets";
  import Dashboard from "./components/Dashboard.svelte";
  import DynamicDashboard from "./components/DynamicDashboard.svelte";
  import FrameLogPanel from "./components/FrameLogPanel.svelte";
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

  /* Auto-load the bundled DBC + overlay profile at boot when the
     persisted vehicle id matches one. Without this, refreshing the
     page with a DBC profile selected falls back to the inline TS
     profile (since `app.dbcProfile` starts null). We swallow load
     errors — Settings shows the error path with full context. */
  onMount(() => {
    const id = app.config.vehicle;
    if (BUNDLED_DBC_IDS.includes(id)) {
      void loadBundledDbcProfile(id)
        .then((composed) => {
          app.profile = composed.profile;
          app.dbcProfile = composed;
          app.signalMeta = composed.metadata;
        })
        .catch((err) => {
          if (typeof console !== "undefined") {
            console.warn("[dashx] failed to load bundled DBC profile", id, err);
          }
        });
    }
  });

  /* Sync the global chart window from persisted config. One source
     of truth: `app.config.chartWindowSec` (persisted via Settings),
     mirrored into the widgets package's reactive `chartConfig`. */
  $effect(() => {
    chartConfig.windowSec = app.config.chartWindowSec;
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

  <!-- Body row: dashboard fills the flex-1 area, frame log lives as
       a collapsable side panel to its right. The dashboard scrolls
       vertically inside the inner <div>; the panel manages its own
       overflow. min-h-0 on both is the well-known fix for nested
       flexbox + overflow-auto. -->
  <div class="flex min-h-0 flex-1">
    <main class="min-h-0 flex-1 overflow-auto">
      {#if app.dbcProfile}
        <DynamicDashboard />
      {:else}
        <Dashboard />
      {/if}
    </main>
    <FrameLogPanel />
  </div>
</div>

<SettingsDialog />
<AboutDialog />
