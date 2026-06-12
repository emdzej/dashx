<script lang="ts">
  import { app } from "../lib/state.svelte";

  type Props = {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
  };

  const { connect, disconnect }: Props = $props();
</script>

{#if app.status.kind === "disconnected"}
  <button
    class="rounded bg-accent px-3 py-0.5 text-xs font-medium text-zinc-950 transition hover:bg-accent-muted"
    onclick={() => void connect()}
  >
    Connect
  </button>
{:else if app.status.kind === "connecting"}
  <button class="rounded bg-elevated px-3 py-0.5 text-xs text-faint" disabled>
    Connecting…
  </button>
{:else if app.status.kind === "connected"}
  <button
    class="rounded border border-rule px-3 py-0.5 text-xs text-muted hover:border-accent hover:text-foreground"
    onclick={() => void disconnect()}
    title="Disconnect from bus"
  >
    ● Connected
  </button>
{:else}
  <button
    class="rounded border border-red-500/50 bg-red-500/10 px-3 py-0.5 text-xs text-red-500 hover:bg-red-500/20"
    onclick={() => void connect()}
    title={app.status.message}
  >
    Retry
  </button>
{/if}
