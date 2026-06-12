<script lang="ts">
  /**
   * Data-driven dashboard. Renders the active DBC profile's signal
   * grid from `app.dbcProfile.groups` + `app.signalMeta`, using the
   * widget kind declared per-signal in the overlay JSON.
   *
   * Layout per group:
   *   • Numerics (value / bar / gauge) → 1×4 grid above.
   *   • Lamps → flex-wrap row below.
   *   • Hidden signals skipped entirely (still decoded into
   *     `app.signals` for derived expressions, just not rendered).
   *
   * The hardcoded `Dashboard.svelte` stays in use for inline TS
   * profiles. `App.svelte` switches between them at runtime based
   * on `app.dbcProfile`.
   */
  import { app } from "../lib/state.svelte";
  import {
    BarWidget,
    GaugeWidget,
    LampWidget,
    ValueWidget,
  } from "@emdzej/dashx-widgets";
  import type { SignalMetadata } from "@emdzej/dashx-vehicles";

  type LampVariant = "danger" | "warn" | "info";

  function asNumber(v: unknown): number | null {
    return typeof v === "number" ? v : null;
  }
  function asBool(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
  }

  /* Look up the decoder for a signal id to read label + unit. The
     DBC composer copies overlay-supplied label/unit onto the
     decoder, so this is just an index lookup, not a duplicate. */
  function labelFor(id: string): string {
    return app.profile?.signals.find((s) => s.id === id)?.label ?? id;
  }
  function unitFor(id: string): string {
    return app.profile?.signals.find((s) => s.id === id)?.unit ?? "";
  }

  /* Group the visible signals by group id, preserving overlay
     declaration order within each group. */
  const layout = $derived.by(() => {
    const composed = app.dbcProfile;
    if (!composed) return [];

    const byGroup = new Map<string, SignalMetadata[]>();
    for (const group of composed.groups) {
      byGroup.set(group.id, []);
    }
    for (const meta of app.signalMeta.values()) {
      if (meta.hidden) continue;
      const groupId = meta.group ?? "";
      const list = byGroup.get(groupId);
      if (list) list.push(meta);
      else {
        /* Signal references a group not declared in the overlay —
           land in the fallback "" group. */
        const fallback = byGroup.get("") ?? [];
        if (!byGroup.has("")) byGroup.set("", fallback);
        fallback.push(meta);
      }
    }
    return composed.groups
      .map((g) => ({ group: g, signals: byGroup.get(g.id) ?? [] }))
      .filter((entry) => entry.signals.length > 0);
  });

  /* Split per group into numerics + lamps so each sub-layout
     renders independently. Unknown widget kinds default to value. */
  function splitByKind(signals: SignalMetadata[]): {
    numerics: SignalMetadata[];
    lamps: SignalMetadata[];
  } {
    const numerics: SignalMetadata[] = [];
    const lamps: SignalMetadata[] = [];
    for (const s of signals) {
      if (s.widget === "lamp") lamps.push(s);
      else numerics.push(s);
    }
    return { numerics, lamps };
  }

</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-4">
  {#each layout as { group, signals } (group.id)}
    {@const split = splitByKind(signals)}
    <section class="flex flex-col gap-3">
      <h2
        class="text-xs font-semibold uppercase tracking-wider text-faint"
        title={group.description}
      >
        {group.label}
      </h2>

      {#if split.numerics.length > 0}
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
          {#each split.numerics as meta (meta.id)}
            {@const value = asNumber(app.signals[meta.id])}
            {#if meta.widget === "gauge"}
              <GaugeWidget
                label={labelFor(meta.id)}
                unit={unitFor(meta.id)}
                value={value}
                min={meta.min ?? 0}
                max={meta.max ?? 100}
                redline={meta.redline}
                tooltip={meta.description}
              />
            {:else if meta.widget === "bar"}
              <BarWidget
                label={labelFor(meta.id)}
                unit={unitFor(meta.id)}
                value={value}
                min={meta.min ?? 0}
                max={meta.max ?? 100}
                tooltip={meta.description}
              />
            {:else}
              <ValueWidget
                label={labelFor(meta.id)}
                unit={unitFor(meta.id)}
                value={value}
                fractionDigits={meta.fractionDigits ?? 0}
                tooltip={meta.description}
              />
            {/if}
          {/each}
        </div>
      {/if}

      {#if split.lamps.length > 0}
        <div class="flex flex-wrap gap-2">
          {#each split.lamps as meta (meta.id)}
            <LampWidget
              label={labelFor(meta.id)}
              value={asBool(app.signals[meta.id])}
              variant={(meta.lampVariant ?? "info") as LampVariant}
              tooltip={meta.description}
            />
          {/each}
        </div>
      {/if}
    </section>
  {/each}

</div>
