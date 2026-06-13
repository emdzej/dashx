<script lang="ts">
  /**
   * Data-driven dashboard. Renders the active DBC profile's signal
   * grid from the **layout config** in `layoutStore`, merged with
   * the overlay's intrinsic widget data (label / unit / min / max
   * / description / value tables).
   *
   * Two modes:
   *   • **Normal** — read-only grid. Each group is a CSS grid with
   *     widgets placed by `signal.order` and sized by `signal.span`.
   *   • **Edit** (`layoutStore.editMode === true`) — every widget
   *     gets a hover-overlay toolbar (✕ hide, ↻ widget kind cycle,
   *     ↔ span cycle, ↑↓ reorder); each group header carries inline
   *     rename + reorder + hide; a footer panel lists every hidden
   *     widget/group with a one-click "restore" button.
   *
   * Layout data lives in `app.layouts.svelte`; this component is
   * a pure renderer.
   */
  import { untrack } from "svelte";
  import { dndzone, type DndEvent } from "svelte-dnd-action";
  import { app } from "../lib/state.svelte";
  import {
    layoutStore,
    getActiveLayout,
    mergedRenderPlan,
    setSignalVisibility,
    setSignalWidget,
    setSignalSpan,
    moveSignal,
    setGroupVisibility,
    renameGroup,
    moveGroup,
    setSignalsOrderInGroup,
    setGroupsOrder,
    type WidgetSpan,
  } from "../lib/layout.svelte";
  import {
    BarWidget,
    GaugeWidget,
    LampWidget,
    ValueWidget,
  } from "@emdzej/dashx-widgets";
  import type { SignalMetadata, WidgetKind } from "@emdzej/dashx-vehicles";

  type LampVariant = "danger" | "warn" | "info";

  function asNumber(v: unknown): number | null {
    return typeof v === "number" ? v : null;
  }
  function asBool(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
  }

  /* Look up the decoder for a signal id to read label + unit. */
  function labelFor(id: string): string {
    return app.profile?.signals.find((s) => s.id === id)?.label ?? id;
  }
  function unitFor(id: string): string {
    return app.profile?.signals.find((s) => s.id === id)?.unit ?? "";
  }
  function metaFor(id: string): SignalMetadata | undefined {
    return app.signalMeta.get(id);
  }

  const profileId = $derived(app.dbcProfile?.profile.id ?? "");
  const activeLayout = $derived(profileId ? getActiveLayout(profileId) : null);

  /* The merged render plan applies the active layout's overrides
     on top of the overlay's defaults, plus picks up any signals
     added to the overlay after the layout was saved. */
  const plan = $derived.by(() => {
    if (!app.dbcProfile || !activeLayout) return null;
    return mergedRenderPlan(app.dbcProfile, activeLayout);
  });

  /* ── DnD-driven local mirror ──────────────────────────────
     svelte-dnd-action requires the items array to be mutable
     state; the action rewrites it via `consider` events to
     animate the drag. We can't pass a $derived directly. So we
     keep local $state arrays that mirror the layout's order +
     grouping, sync from the layout when its identity changes,
     and commit drag results back to the layout on each drop. */

  type GroupItem = { id: string };
  type WidgetItem = { id: string };

  let groupItems = $state<GroupItem[]>([]);
  let widgetsByGroup = $state<Record<string, WidgetItem[]>>({});

  /* Resync key. Bumps when the underlying layout identity changes
     (profile switch, layout switch) or when the set of signals /
     groups changes shape (e.g. a hidden signal toggled visible —
     the layout's `signals[id].visible` changes but the items list
     is unchanged; we still want to mirror groups membership). */
  const syncKey = $derived.by(() => {
    if (!plan || !activeLayout) return "";
    const sigKeys = [...plan.signals.values()]
      .map((s) => `${s.id}:${s.group}:${s.order}`)
      .join(",");
    const groupKeys = plan.groups
      .map((g) => `${g.id}:${g.order}`)
      .join(",");
    return `${activeLayout.id}|${groupKeys}|${sigKeys}`;
  });

  $effect(() => {
    void syncKey;
    untrack(() => {
      if (!plan) {
        groupItems = [];
        widgetsByGroup = {};
        return;
      }
      groupItems = [...plan.groups]
        .sort((a, b) => a.order - b.order)
        .map((g) => ({ id: g.id }));
      const byGroup: Record<string, WidgetItem[]> = {};
      for (const g of plan.groups) byGroup[g.id] = [];
      for (const sig of plan.signals.values()) {
        (byGroup[sig.group] ??= []).push({ id: sig.id });
      }
      for (const list of Object.values(byGroup)) {
        list.sort(
          (a, b) =>
            (plan.signals.get(a.id)?.order ?? 0) -
            (plan.signals.get(b.id)?.order ?? 0),
        );
      }
      widgetsByGroup = byGroup;
    });
  });

  /* Helper accessors used by the template — keep render code lean. */
  function signalFor(id: string) {
    return plan?.signals.get(id);
  }
  function groupFor(id: string) {
    return plan?.groups.find((g) => g.id === id);
  }

  /* ── DnD handlers ─────────────────────────────────────────
     `consider` fires every animation frame during drag — we
     just stage the items locally so the visual reflows. `finalize`
     fires once on drop; that's when we commit to the layout. */

  function handleGroupsConsider(e: CustomEvent<DndEvent<GroupItem>>): void {
    groupItems = e.detail.items;
  }
  function handleGroupsFinalize(e: CustomEvent<DndEvent<GroupItem>>): void {
    groupItems = e.detail.items;
    if (!activeLayout) return;
    setGroupsOrder(
      activeLayout,
      groupItems.map((g) => g.id),
    );
  }

  function handleWidgetsConsider(
    groupId: string,
    e: CustomEvent<DndEvent<WidgetItem>>,
  ): void {
    widgetsByGroup = { ...widgetsByGroup, [groupId]: e.detail.items };
  }
  function handleWidgetsFinalize(
    groupId: string,
    e: CustomEvent<DndEvent<WidgetItem>>,
  ): void {
    widgetsByGroup = { ...widgetsByGroup, [groupId]: e.detail.items };
    if (!activeLayout) return;
    setSignalsOrderInGroup(
      activeLayout,
      groupId,
      e.detail.items.map((i) => i.id),
    );
  }

  /* svelte-dnd-action options: shared `type` lets items cross
     between zones (widget → widget). Groups use a separate type
     so groups don't accidentally drop INTO a widget zone. */
  const widgetDndOptions = $derived({
    type: "widget" as const,
    /* Disable dragging entirely outside edit mode. */
    dragDisabled: !layoutStore.editMode,
    /* Drop indicator + drag shadow visuals come for free; we just
       supply the items + type. */
  });
  const groupDndOptions = $derived({
    type: "group" as const,
    dragDisabled: !layoutStore.editMode,
  });

  /* Hidden-signals list for the edit-mode "Restore" panel. */
  const hiddenSignals = $derived.by(() => {
    if (!plan) return [];
    return [...plan.signals.values()].filter((s) => !s.visible);
  });
  const hiddenGroups = $derived.by(() => {
    if (!plan) return [];
    return plan.groups.filter((g) => !g.visible);
  });

  /* ── Edit-mode helpers ──────────────────────────────────── */

  const WIDGET_CYCLE: WidgetKind[] = ["value", "bar", "gauge", "lamp"];

  function cycleWidget(signalId: string, current: WidgetKind): void {
    if (!activeLayout) return;
    const idx = WIDGET_CYCLE.indexOf(current);
    const next = WIDGET_CYCLE[(idx + 1) % WIDGET_CYCLE.length]!;
    setSignalWidget(activeLayout, signalId, next);
  }

  function cycleSpan(signalId: string, current: WidgetSpan): void {
    if (!activeLayout) return;
    const next = ((current % 4) + 1) as WidgetSpan;
    setSignalSpan(activeLayout, signalId, next);
  }
</script>

{#if !plan}
  <div class="p-6 text-sm text-faint">
    No DBC profile active. Pick one in Settings → Vehicle.
  </div>
{:else}
  <!-- Outer DnD zone for group reordering. In non-edit mode the
       action is configured with `dragDisabled: true` so it's a
       no-op visually + behaviourally. -->
  <div
    class="mx-auto flex max-w-6xl flex-col gap-6 p-4"
    use:dndzone={{ items: groupItems, ...groupDndOptions }}
    onconsider={handleGroupsConsider}
    onfinalize={handleGroupsFinalize}
  >
    {#each groupItems as gItem (gItem.id)}
      {@const group = groupFor(gItem.id)}
      {@const signals = widgetsByGroup[gItem.id] ?? []}
      {#if group && ((group.visible && signals.some((wi) => signalFor(wi.id)?.visible)) || layoutStore.editMode)}
        <section class="flex flex-col gap-3">
          <!-- Group header. In edit mode shows rename + reorder + hide. -->
          <div class="flex items-baseline justify-between gap-2">
            {#if layoutStore.editMode}
              <input
                type="text"
                value={group.label}
                onchange={(e) =>
                  activeLayout && renameGroup(activeLayout, group.id, (e.currentTarget as HTMLInputElement).value)}
                class="border-b border-divider bg-transparent text-xs font-semibold uppercase tracking-wider text-faint focus:border-accent focus:outline-none"
                size={Math.max(group.label.length, 8)}
              />
              <span class="flex items-center gap-1 text-faint">
                <button
                  type="button"
                  class="rounded p-1 hover:bg-elevated hover:text-foreground"
                  title="Move group up"
                  onclick={() => activeLayout && moveGroup(activeLayout, group.id, -1)}
                  aria-label="Move group up"
                >↑</button>
                <button
                  type="button"
                  class="rounded p-1 hover:bg-elevated hover:text-foreground"
                  title="Move group down"
                  onclick={() => activeLayout && moveGroup(activeLayout, group.id, 1)}
                  aria-label="Move group down"
                >↓</button>
                <button
                  type="button"
                  class="rounded p-1 hover:bg-elevated hover:text-amber-500"
                  title={group.visible ? "Hide group" : "Show group"}
                  onclick={() => activeLayout && setGroupVisibility(activeLayout, group.id, !group.visible)}
                  aria-label={group.visible ? "Hide group" : "Show group"}
                >{group.visible ? "✕" : "+"}</button>
              </span>
            {:else}
              <h2
                class="text-xs font-semibold uppercase tracking-wider text-faint"
              >
                {group.label}
              </h2>
            {/if}
          </div>

          {#if group.visible}
            <!-- Per-group DnD zone with the shared `widget` type so
                 widgets can be dragged across groups. Grid is the
                 zone's own element so reorder animations are within
                 the same grid track. -->
            <div
              class="grid grid-cols-2 gap-3 md:grid-cols-4"
              use:dndzone={{ items: signals, ...widgetDndOptions }}
              onconsider={(e) => handleWidgetsConsider(gItem.id, e)}
              onfinalize={(e) => handleWidgetsFinalize(gItem.id, e)}
            >
              {#each signals as wItem (wItem.id)}
                {@const id = wItem.id}
                {@const signal = signalFor(id)}
                {#if signal && (signal.visible || layoutStore.editMode)}
                  {@const meta = metaFor(id)}
                  {@const value = app.signals[id]}
                  {@const numericValue = asNumber(value)}
                  {@const boolValue = asBool(value)}
                  <div
                    class="relative"
                    class:opacity-40={!signal.visible}
                    class:ring-1={layoutStore.editMode}
                    class:ring-divider={layoutStore.editMode}
                    class:rounded={layoutStore.editMode}
                    class:cursor-move={layoutStore.editMode}
                    style="grid-column: span {signal.span};"
                  >
                    <!-- Widget -->
                    {#if signal.widget === "gauge"}
                      <GaugeWidget
                        label={labelFor(id)}
                        unit={unitFor(id)}
                        value={numericValue}
                        min={meta?.min ?? 0}
                        max={meta?.max ?? 100}
                        redline={meta?.redline}
                        tooltip={meta?.description}
                      />
                    {:else if signal.widget === "bar"}
                      <BarWidget
                        label={labelFor(id)}
                        unit={unitFor(id)}
                        value={numericValue}
                        min={meta?.min ?? 0}
                        max={meta?.max ?? 100}
                        tooltip={meta?.description}
                      />
                    {:else if signal.widget === "lamp"}
                      <LampWidget
                        label={labelFor(id)}
                        value={boolValue}
                        variant={(meta?.lampVariant ?? "info") as LampVariant}
                        tooltip={meta?.description}
                      />
                    {:else}
                      <ValueWidget
                        label={labelFor(id)}
                        unit={unitFor(id)}
                        value={numericValue}
                        fractionDigits={meta?.fractionDigits ?? 0}
                        tooltip={meta?.description}
                      />
                    {/if}

                    <!-- Edit-mode toolbar. Absolute-positioned so it
                         overlays the widget without disrupting layout. -->
                    {#if layoutStore.editMode}
                      <div class="absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded bg-base/90 px-1 py-0.5 text-[10px] text-faint shadow ring-1 ring-divider">
                        <button
                          type="button"
                          class="rounded px-1 hover:bg-elevated hover:text-foreground"
                          title="Move up"
                          onclick={() => activeLayout && moveSignal(activeLayout, id, -1)}
                          aria-label="Move widget up"
                        >↑</button>
                        <button
                          type="button"
                          class="rounded px-1 hover:bg-elevated hover:text-foreground"
                          title="Move down"
                          onclick={() => activeLayout && moveSignal(activeLayout, id, 1)}
                          aria-label="Move widget down"
                        >↓</button>
                        <button
                          type="button"
                          class="rounded px-1 hover:bg-elevated hover:text-foreground"
                          title="Cycle widget kind (now: {signal.widget})"
                          onclick={() => cycleWidget(id, signal.widget)}
                          aria-label="Cycle widget kind"
                        >{
                          signal.widget === "value" ? "#" :
                          signal.widget === "bar" ? "▭" :
                          signal.widget === "gauge" ? "◐" :
                          "●"
                        }</button>
                        <button
                          type="button"
                          class="rounded px-1 font-mono hover:bg-elevated hover:text-foreground"
                          title="Cycle span (now: {signal.span})"
                          onclick={() => cycleSpan(id, signal.span)}
                          aria-label="Cycle widget span"
                        >×{signal.span}</button>
                        <button
                          type="button"
                          class="rounded px-1 hover:bg-elevated hover:text-amber-500"
                          title={signal.visible ? "Hide" : "Show"}
                          onclick={() => activeLayout && setSignalVisibility(activeLayout, id, !signal.visible)}
                          aria-label={signal.visible ? "Hide widget" : "Show widget"}
                        >{signal.visible ? "✕" : "+"}</button>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </section>
      {/if}
    {/each}

    <!-- Hidden-restore footer (edit mode only). Lists every hidden
         widget + group with a click-to-restore button. -->
    {#if layoutStore.editMode && (hiddenSignals.length > 0 || hiddenGroups.length > 0)}
      <section class="rounded border border-dashed border-divider bg-base/50 p-3 text-xs">
        <div class="mb-2 font-semibold uppercase tracking-wider text-faint">
          Hidden ({hiddenSignals.length} widgets, {hiddenGroups.length} groups)
        </div>
        <div class="flex flex-wrap gap-2">
          {#each hiddenGroups as g (g.id)}
            <button
              type="button"
              class="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1 text-amber-700 hover:border-amber-500 dark:text-amber-300"
              onclick={() => activeLayout && setGroupVisibility(activeLayout, g.id, true)}
              title="Restore group"
            >
              Group: {g.label}
            </button>
          {/each}
          {#each hiddenSignals as s (s.id)}
            <button
              type="button"
              class="rounded border border-divider bg-surface px-2 py-1 text-muted hover:border-accent"
              onclick={() => activeLayout && setSignalVisibility(activeLayout, s.id, true)}
              title="Restore widget"
            >
              {labelFor(s.id)}
              <span class="ml-1 text-[10px] text-faint">{s.group}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
{/if}
