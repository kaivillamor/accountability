<script lang="ts">
  import { activity, type ActivityDay } from '#lib/activity.ts'
  import { dayOf, formatDay, isMonthStart } from '#lib/days.ts'
  import type { Entry, Tracker } from '#lib/model.ts'
  import { count } from '#lib/text.ts'

  let { tracker, entries, now }: { tracker: Tracker; entries: Entry[]; now: number } = $props()

  const WEEKS = 53
  const CELL = 13
  const PITCH = 15 // a cell plus the 2px gap
  const LEFT = 30 // room for weekday labels
  const TOP = 18 // room for month labels
  const WEEKDAY_LABELS = [
    { row: 1, name: 'Mon' },
    { row: 3, name: 'Wed' },
    { row: 5, name: 'Fri' },
  ]

  const columns = $derived(activity(tracker, entries, now, WEEKS))
  const today = $derived(dayOf(now))
  let selected = $state(dayOf(Date.now()))
  const shown = $derived(columns.flat().find((d) => d.day === selected))
  const active = $derived(
    columns
      .flat()
      .filter((d) => d.value > 0 || d.slipped)
      .toReversed(),
  )

  function describe(d: ActivityDay): string {
    if (!d.tracked) return 'Not tracked yet'
    if (tracker.kind === 'habit') return d.value === 0 ? 'Not done' : `Done ${count(d.value, 'time')}`
    if (tracker.kind === 'usage') return d.value === 0 ? 'Nothing logged' : String(d.value)
    if (d.slipped) return d.value === 0 ? 'Slipped' : `Slipped, resisted ${count(d.value, 'time')}`
    return d.value === 0 ? 'No slips' : `Resisted ${count(d.value, 'time')}`
  }

  function dateLabel(day: number): string {
    return day === today ? 'Today' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })
  }
</script>

<!-- Opens scrolled to the newest week, which matters on narrow screens. -->
<div
  class="scroll"
  {@attach (node) => {
    node.scrollLeft = node.scrollWidth
  }}
>
  <svg
    width={LEFT + WEEKS * PITCH}
    height={TOP + 7 * PITCH}
    role="img"
    aria-label="{tracker.name} over the past year, one square per day"
  >
    {#each WEEKDAY_LABELS as { row, name } (row)}
      <text class="label" x="0" y={TOP + row * PITCH + CELL - 3}>{name}</text>
    {/each}
    {#each columns as column, i (column[0].day)}
      {@const monthStart = column.find((d) => isMonthStart(d.day))}
      {#if monthStart}
        <text class="label" x={LEFT + i * PITCH} y={TOP - 6}>{formatDay(monthStart.day, { month: 'short' })}</text>
      {/if}
      <!-- Hovering or tapping a day is a pointer shortcut. The "Days with activity"
           list below gives keyboard and screen-reader users the same details. -->
      {#each column as d, row (d.day)}
        {@const x = LEFT + i * PITCH}
        {@const y = TOP + row * PITCH}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <rect
          class="cell level-{d.level}"
          class:slipped={d.slipped}
          class:today={d.day === today}
          class:selected={d.day === selected}
          {x}
          {y}
          width={CELL}
          height={CELL}
          rx="2"
          onpointerenter={() => (selected = d.day)}
        />
        {#if d.slipped}
          <path class="cross" d="M{x + 4} {y + 4}l5 5m0-5l-5 5" />
        {/if}
      {/each}
    {/each}
  </svg>
</div>

{#if shown}
  <p class="readout"><strong>{describe(shown)}</strong> <span>· {dateLabel(shown.day)}</span></p>
{/if}

<div class="legend">
  <span>Less</span>
  <svg width={5 * PITCH - 2} height={CELL} aria-hidden="true">
    {#each [0, 1, 2, 3, 4] as level (level)}
      <rect class="cell level-{level}" x={level * PITCH} width={CELL} height={CELL} rx="2" />
    {/each}
  </svg>
  <span>More</span>
  {#if tracker.kind === 'quit'}
    <svg width={CELL} height={CELL} aria-hidden="true">
      <rect class="cell slipped" width={CELL} height={CELL} rx="2" />
      <path class="cross" d="M4 4l5 5m0-5l-5 5" />
    </svg>
    <span>Slipped</span>
  {/if}
</div>

<details>
  <summary>Days with activity</summary>
  <ul>
    {#each active as d (d.day)}
      <li>{dateLabel(d.day)}: {describe(d)}</li>
    {:else}
      <li>Nothing logged in the past year.</li>
    {/each}
  </ul>
</details>

<style>
  .scroll {
    overflow-x: auto;
    margin-top: 0.75rem;
  }

  .scroll svg {
    display: block;
  }

  .label {
    font-size: 10px;
    fill: var(--ink-muted);
  }

  .cell {
    fill: var(--empty);
  }

  .level-1 {
    fill: var(--heat-1);
  }

  .level-2 {
    fill: var(--heat-2);
  }

  .level-3 {
    fill: var(--heat-3);
  }

  .level-4 {
    fill: var(--heat-4);
  }

  .slipped {
    fill: var(--critical);
  }

  .today {
    stroke: var(--ink-muted);
    stroke-width: 1;
  }

  .selected {
    stroke: var(--ink);
    stroke-width: 2;
  }

  .cross {
    stroke: var(--surface);
    stroke-width: 1.5;
    stroke-linecap: round;
    pointer-events: none;
  }

  .readout {
    margin: 0.25rem 0;
  }

  .readout span {
    color: var(--ink-secondary);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--ink-secondary);
  }

  details {
    margin-top: 0.5rem;
    font-size: 0.9rem;
  }

  summary {
    cursor: pointer;
    color: var(--ink-secondary);
  }

  ul {
    margin: 0.25rem 0 0;
    padding-left: 1.25rem;
  }
</style>
