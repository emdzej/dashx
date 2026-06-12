<script lang="ts">
  import { app } from "../lib/state.svelte";
  import { saveConfig, type CanSource } from "../lib/config";
  import { isEmbedded } from "../lib/embedded";
  import { applyObd2Config } from "../lib/connection.svelte";
  import { PROFILES, findProfile } from "@emdzej/dashx-vehicles";
  import { PID_CATALOG } from "@emdzej/dashx-can-obd2";
  import {
    BUNDLED_DBC_IDS,
    loadBundledDbcProfile,
    loadUserDbcProfile,
  } from "../lib/dbc-profiles.svelte";
  import { FsaDirectory } from "@emdzej/bimmerz-vfs";

  let dbcStatus = $state<{ kind: "idle" } | { kind: "loading"; id: string } | { kind: "error"; msg: string }>({ kind: "idle" });

  /* Tag DBC profiles in the dropdown with a marker prefix so we can
     tell them apart from the inline TS profiles when reacting to a
     pick. The dropdown value stays the profile id; we just look up
     across both registries. */
  type ProfileOption = { id: string; label: string; kind: "ts" | "dbc-bundled" | "dbc-custom" };
  const profileOptions: ProfileOption[] = [
    ...PROFILES.map((p) => ({ id: p.id, label: p.label + "  (inline TS)", kind: "ts" as const })),
    ...BUNDLED_DBC_IDS.map((id) => ({
      id,
      label: id.replace("-dbc", "") + "  (DBC + overlay)",
      kind: "dbc-bundled" as const,
    })),
  ];

  async function applyVehicleSelection(id: string): Promise<void> {
    dbcStatus = { kind: "idle" };
    const tsProfile = findProfile(id);
    if (tsProfile) {
      app.profile = tsProfile;
      app.dbcProfile = null;
      app.signalMeta = new Map();
      return;
    }
    if (BUNDLED_DBC_IDS.includes(id)) {
      dbcStatus = { kind: "loading", id };
      try {
        const composed = await loadBundledDbcProfile(id);
        app.profile = composed.profile;
        app.dbcProfile = composed;
        app.signalMeta = composed.metadata;
        dbcStatus = { kind: "idle" };
      } catch (err) {
        dbcStatus = { kind: "error", msg: err instanceof Error ? err.message : String(err) };
      }
    }
  }

  /** Pick a folder containing a `.dbc` + `.overlay.json` pair via
   *  the FSA picker. Wraps the folder in `FsaDirectory` and hands
   *  it to the VFS loader. */
  async function pickCustomDbcFolder(): Promise<void> {
    type ShowDirPicker = (opts?: { id?: string }) => Promise<FileSystemDirectoryHandle>;
    const picker = (window as unknown as { showDirectoryPicker?: ShowDirPicker }).showDirectoryPicker;
    if (!picker) {
      dbcStatus = { kind: "error", msg: "File System Access not available — use Chrome/Edge." };
      return;
    }
    dbcStatus = { kind: "loading", id: "custom" };
    try {
      const handle = await picker({ id: "dashx-dbc" });
      const root = new FsaDirectory(handle);
      /* Look for the first .overlay.json in the chosen folder. */
      const entries = await root.entries();
      const overlayEntry = entries.find(
        (e) => e.kind === "file" && /\.overlay\.json$/i.test(e.name),
      );
      if (!overlayEntry) {
        dbcStatus = { kind: "error", msg: "No .overlay.json in selected folder." };
        return;
      }
      const composed = await loadUserDbcProfile(root, overlayEntry.name);
      app.profile = composed.profile;
      app.dbcProfile = composed;
      app.signalMeta = composed.metadata;
      app.config.vehicle = composed.profile.id;
      dbcStatus = { kind: "idle" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        dbcStatus = { kind: "idle" };
        return;
      }
      dbcStatus = { kind: "error", msg: err instanceof Error ? err.message : String(err) };
    }
  }

  function toggleObd2Pid(id: string): void {
    const i = app.config.obd2.pids.indexOf(id);
    if (i >= 0) app.config.obd2.pids.splice(i, 1);
    else app.config.obd2.pids.push(id);
  }

  function close(): void {
    app.showSettings = false;
  }

  /* Persist on every mutation. Cheap — config is tiny. */
  $effect(() => {
    saveConfig(app.config);
  });

  /* Push OBD-II config changes to the live connection. No-op when
     disconnected; otherwise starts/stops the poller in-place so the
     user doesn't have to reconnect after toggling. The only setting
     that DOES require reconnect is the listen-only → normal bus
     mode (decided at transport.open time) — surfaced as a hint
     below the active-poll toggle. */
  $effect(() => {
    /* explicit reads keep the effect tracking */
    void app.config.obd2.activePoll;
    void app.config.obd2.pollIntervalMs;
    void app.config.obd2.pids.length;
    void app.config.obd2.requestId;
    applyObd2Config();
  });

  /* Re-resolve profile when the user picks a different vehicle. */
  $effect(() => {
    app.profile = findProfile(app.config.vehicle) ?? null;
  });

  const SOURCES: { value: CanSource; label: string; desc: string }[] = [
    { value: "rpc",       label: "RPC (dongle)",       desc: "WebSocket to a bimmerz-box at /rpc/can/<n>." },
    { value: "serial",    label: "SLCAN (Web Serial)", desc: "USB SLCAN adapter (CANable, USB2CANFD v1, …). Pops the port picker on Connect." },
    { value: "serial-ws", label: "SLCAN (WebSocket)",  desc: "SLCAN-over-WS bridge. Useful for remote setups or a Node-side service holding the adapter." },
  ];
</script>

{#if app.showSettings}
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
      class="flex max-h-[90vh] w-full max-w-xl flex-col rounded border border-rule bg-surface shadow-2xl"
      role="document"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <header class="flex items-baseline justify-between gap-4 border-b border-divider px-4 py-3">
        <h2 class="text-sm font-bold uppercase tracking-wider text-muted">Settings</h2>
        <button class="text-xs text-faint underline-offset-2 hover:text-muted hover:underline" onclick={close}>close</button>
      </header>

      <section class="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
        {#if isEmbedded}
          <fieldset class="space-y-1 rounded border border-divider bg-elevated/60 p-3">
            <legend class="px-1 text-xs font-bold uppercase tracking-wider text-faint">Connection</legend>
            <div class="text-xs">
              Connected to dongle at
              <code class="ml-1 font-mono text-foreground">{window.location.host}</code>
            </div>
            <div class="text-xs text-faint">
              Source is fixed for this build (dongle-hosted SPA).
            </div>
          </fieldset>
        {:else}
          <fieldset class="space-y-2 rounded border border-divider bg-base p-3">
            <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-faint">Source</legend>
            <label class="block text-xs text-muted">
              CAN transport
              <select
                class="mt-0.5 w-full rounded border border-rule bg-surface px-2 py-1 text-sm text-foreground"
                bind:value={app.config.source}
              >
                {#each SOURCES as src (src.value)}
                  <option value={src.value}>{src.label}</option>
                {/each}
              </select>
              <span class="mt-1 block text-faint">
                {SOURCES.find((s) => s.value === app.config.source)?.desc}
              </span>
            </label>

            {#if app.config.source === "rpc"}
              <label class="block text-xs text-muted">
                RPC URL
                <input
                  type="url"
                  class="mt-0.5 w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-sm text-foreground"
                  bind:value={app.config.rpcUrl}
                  placeholder="ws://172.16.7.1/rpc/can/0"
                />
              </label>
            {:else if app.config.source === "serial-ws"}
              <label class="block text-xs text-muted">
                SLCAN-over-WS URL
                <input
                  type="url"
                  class="mt-0.5 w-full rounded border border-rule bg-surface px-2 py-1 font-mono text-sm text-foreground"
                  bind:value={app.config.serialWsUrl}
                />
              </label>
            {/if}
          </fieldset>
        {/if}

        <fieldset class="space-y-2 rounded border border-divider bg-base p-3">
          <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-faint">Vehicle</legend>
          <label class="block text-xs text-muted">
            Profile
            <select
              class="mt-0.5 w-full rounded border border-rule bg-surface px-2 py-1 text-sm text-foreground"
              value={app.config.vehicle}
              onchange={(e) => {
                const id = (e.currentTarget as HTMLSelectElement).value;
                app.config.vehicle = id;
                void applyVehicleSelection(id);
              }}
            >
              {#each profileOptions as opt (opt.id)}
                <option value={opt.id}>{opt.label}</option>
              {/each}
            </select>
            <span class="mt-1 block text-faint">
              Two flavours: inline TypeScript profiles (the hand-written
              decoders) and DBC + overlay profiles (loaded from
              <code class="font-mono">/profiles/&lt;id&gt;/</code>). Both share
              the bus parsing; the DBC path uses a declarative file + JSON
              overlay so you can iterate without recompiling.
            </span>
          </label>

          <div class="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              class="rounded border border-divider bg-surface px-2 py-1 text-muted hover:border-accent hover:bg-elevated"
              onclick={pickCustomDbcFolder}
            >
              Load custom DBC folder…
            </button>
            {#if dbcStatus.kind === "loading"}
              <span class="text-faint">Loading {dbcStatus.id}…</span>
            {:else if dbcStatus.kind === "error"}
              <span class="rounded bg-red-500/10 px-2 py-0.5 text-red-500" title={dbcStatus.msg}>
                Error: {dbcStatus.msg.slice(0, 60)}{dbcStatus.msg.length > 60 ? "…" : ""}
              </span>
            {/if}
          </div>
          {#if app.dbcProfile}
            <div class="rounded border border-accent/30 bg-accent/5 p-2 text-xs">
              <div class="font-semibold text-accent">DBC + overlay active</div>
              <div class="text-faint">
                {app.dbcProfile.profile.signals.length} signals decoded
                ({app.signalMeta.size} with metadata) · {app.dbcProfile.groups.length} groups
              </div>
            </div>
          {/if}
        </fieldset>

        <fieldset class="space-y-2 rounded border border-divider bg-base p-3">
          <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-faint">Charts</legend>
          <label class="block text-xs text-muted">
            History window (seconds)
            <input
              type="number"
              min="2"
              max="600"
              step="1"
              class="mt-0.5 w-24 rounded border border-rule bg-surface px-2 py-1 font-mono text-sm text-foreground"
              bind:value={app.config.chartWindowSec}
            />
            <span class="ml-2 text-faint">
              Controls the X-axis range and per-widget buffer size for
              every history chart. 10-30 s is the sweet spot for
              spotting transients; 60+ s is useful for slow trends.
            </span>
          </label>
        </fieldset>

        <fieldset class="space-y-2 rounded border border-divider bg-base p-3">
          <legend class="px-1 text-xs font-semibold uppercase tracking-wider text-faint">
            OBD-II (Mode 01 diagnostic poll)
          </legend>

          <label class="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" bind:checked={app.config.obd2.passiveSniff} />
            <span>
              Passive sniff
              <span class="block text-faint">
                Decode any Mode 01 responses on the bus (0x7E8-0x7EF).
                Free to leave on — only shows data when something is polling.
              </span>
            </span>
          </label>

          <label class="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" bind:checked={app.config.obd2.activePoll} />
            <span>
              Active poll (DASHX sends 0x7DF requests)
              <span class="block text-faint">
                Cycles through the PIDs below at the configured interval. Works
                on RPC, Web Serial SLCAN, and SLCAN-over-WS — DASHX picks the
                bus mode at connect time.
              </span>
              {#if app.status.kind === "connected"}
                <span class="mt-1 block rounded bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
                  Already connected? The bus opened in listen-only mode if
                  active was off at connect time. Reconnect to switch to normal
                  (TX-capable) mode.
                </span>
              {/if}
            </span>
          </label>

          {#if app.config.obd2.activePoll}
            <label class="block text-xs text-muted">
              Poll interval (ms)
              <input
                type="number"
                min="50"
                max="5000"
                step="10"
                class="mt-0.5 w-32 rounded border border-rule bg-surface px-2 py-1 font-mono text-sm text-foreground"
                bind:value={app.config.obd2.pollIntervalMs}
              />
              <span class="ml-2 text-faint">per request, round-robin through {app.config.obd2.pids.length} PIDs.</span>
            </label>

            <fieldset class="text-xs text-muted">
              <legend class="px-1 text-faint">Request CAN ID</legend>
              <label class="flex items-baseline gap-2">
                <input
                  type="radio"
                  value={0x7DF}
                  bind:group={app.config.obd2.requestId}
                />
                <span>
                  <span class="font-mono">0x7DF</span> — functional broadcast (spec default, what every scan tool does first).
                </span>
              </label>
              <label class="flex items-baseline gap-2">
                <input
                  type="radio"
                  value={0x7E0}
                  bind:group={app.config.obd2.requestId}
                />
                <span>
                  <span class="font-mono">0x7E0</span> — direct physical to DME (try this if 0x7DF goes silent on a known-OBD-II car).
                </span>
              </label>
              {#if app.status.kind === "connected"}
                <span class="mt-1 block text-faint">
                  Switching takes effect on the next poll cycle (no reconnect needed).
                </span>
              {/if}
            </fieldset>

            <div class="text-xs text-muted">
              PIDs to poll:
              <div class="mt-1 grid grid-cols-1 gap-1 md:grid-cols-2">
                {#each PID_CATALOG as pid (pid.id)}
                  <label
                    class="flex items-baseline gap-2 rounded border border-divider px-2 py-1"
                    title={pid.description}
                  >
                    <input
                      type="checkbox"
                      checked={app.config.obd2.pids.includes(pid.id)}
                      onchange={() => toggleObd2Pid(pid.id)}
                    />
                    <span class="font-mono text-[10px] text-faint">
                      0x{pid.pid.toString(16).toUpperCase().padStart(2, "0")}
                    </span>
                    <span>{pid.label}</span>
                    <span class="text-[10px] text-faint">{pid.unit}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
        </fieldset>
      </section>

      <footer class="flex items-center justify-end border-t border-divider bg-elevated/50 px-4 py-2">
        <button
          class="rounded bg-accent px-3 py-1 text-sm font-medium text-zinc-950 hover:bg-accent-muted"
          onclick={close}
        >
          Done
        </button>
      </footer>
    </div>
  </div>
{/if}
