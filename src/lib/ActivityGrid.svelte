<script lang="ts">
  import { activity, dayLines, type ActivityDay } from '#lib/activity.ts'
  import { idsOf, type Card } from '#lib/arrange.ts'
  import { dayOf, formatDay, isMonthStart } from '#lib/days.ts'
  import type { Entry } from '#lib/model.ts'

  // Every card in page order. A staged habit's card stands for its stages.
  let { cards, entries, now }: { cards: Card[]; entries: Entry[]; now: number } = $props()

  const WEEKS = 53
  const CELL = 13
  const PITCH = 15 // a cell plus the 2px gap
  const GAP = 1 // between the two parts of a split day, narrower than the gap between days
  const LEFT = 30 // room for weekday labels
  const TOP = 18 // room for month labels
  const WEEKDAY_LABELS = [
    { row: 1, name: 'Mon' },
    { row: 3, name: 'Wed' },
    { row: 5, name: 'Fri' },
  ]

  // Cards switched off in the filter, so new trackers show up automatically.
  let hidden = $state<string[]>([])
  const shown = $derived(cards.filter((card) => !hidden.includes(card.tracker.id)))
  const shownIds = $derived(shown.flatMap(idsOf))
  const columns = $derived(
    activity(
      entries.filter((e) => shownIds.includes(e.trackerId)),
      now,
      WEEKS,
    ),
  )
  const today = $derived(dayOf(now))
  const activeDays = $derived(
    columns
      .flat()
      .filter((d) => d.entries.length > 0)
      .toReversed(),
  )

  let wrap: HTMLDivElement
  let tip = $state<{ day: ActivityDay; left: number; top: number; alignRight: boolean }>()

  function toggle(id: string) {
    hidden = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]
    tip = undefined
  }

  function showTip(day: ActivityDay, cell: SVGRectElement) {
    const cellBox = cell.getBoundingClientRect()
    const wrapBox = wrap.getBoundingClientRect()
    const left = cellBox.left - wrapBox.left + cellBox.width / 2
    tip = { day, left, top: cellBox.top - wrapBox.top, alignRight: left > wrapBox.width / 2 }
  }

  // What each shown card logged on each day, in card order. The pop-up lists these lines, and a
  // day's square splits by them.
  const linesOf = $derived(new Map(columns.flat().map((d) => [d.day, dayLines(shown, d.entries, d.day)])))
  const breakdown = (d: ActivityDay) => linesOf.get(d.day)!

  // How wide a split day's done share is, leaving the slipped share after a 1px gap. Each share is
  // sized by its number of tasks, and neither gets thinner than 2px.
  function doneWidth(done: number, tasks: number): number {
    const room = CELL - GAP
    return Math.min(Math.max(Math.round((room * done) / tasks), 2), room - 2)
  }

  function dateLabel(day: number): string {
    return day === today ? 'Today' : formatDay(day, { weekday: 'short', month: 'short', day: 'numeric' })
  }
</script>

{#if cards.length > 1}
  <fieldset class="filter">
    <legend>Show</legend>
    {#each cards as { tracker } (tracker.id)}
      <label class="chip">
        <input type="checkbox" checked={!hidden.includes(tracker.id)} onchange={() => toggle(tracker.id)} />
        {tracker.name}
      </label>
    {/each}
  </fieldset>
{/if}

<div class="grid-wrap" bind:this={wrap}>
  <!-- Opens scrolled to the newest week, which matters on narrow screens. -->
  <div
    class="scroll"
    onscroll={() => (tip = undefined)}
    {@attach (node) => {
      node.scrollLeft = node.scrollWidth
    }}
  >
    <svg
      width={LEFT + WEEKS * PITCH}
      height={TOP + 7 * PITCH}
      role="img"
      aria-label="Activity over the past year, one square per day"
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
          {@const lines = breakdown(d)}
          {@const slips = lines.filter((line) => line.slipped).length}
          {@const allSlipped = slips > 0 && slips === lines.length}
          {@const split = slips > 0 && !allSlipped}
          {#if split}
            <!-- Some of the day's tasks slipped: the share done keeps the day's shade, and the
                 share that slipped is ink, so a slip no longer hides what else was done. -->
            {@const done = doneWidth(lines.length - slips, lines.length)}
            <rect class="part level-{d.level}" {x} {y} width={done} height={CELL} rx="2" />
            <rect class="part slipped" x={x + done + GAP} {y} width={CELL - done - GAP} height={CELL} rx="2" />
          {/if}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <rect
            class="cell level-{d.level}"
            class:slipped={allSlipped}
            class:split
            class:today={d.day === today}
            class:selected={d.day === tip?.day.day}
            {x}
            {y}
            width={CELL}
            height={CELL}
            rx="2"
            onpointerenter={(event) => showTip(d, event.currentTarget)}
            onpointerleave={(event) => {
              // A touch "leaves" as soon as the finger lifts, so a tapped day stays open.
              if (event.pointerType === 'mouse') tip = undefined
            }}
          />
          {#if allSlipped}
            <path class="cross" d="M{x + 4} {y + 4}l5 5m0-5l-5 5" />
          {/if}
        {/each}
      {/each}
    </svg>
  </div>

  {#if tip}
    <div class="tip" class:align-right={tip.alignRight} style:left="{tip.left}px" style:top="{tip.top}px">
      <p class="tip-date">{dateLabel(tip.day.day)}</p>
      {#each breakdown(tip.day) as line (line.id)}
        <p><strong>{line.summary}{#if line.goalMet}{' '}✓{/if}</strong> <span>{line.name}</span></p>
      {:else}
        <p>Nothing logged</p>
      {/each}
    </div>
  {/if}
</div>

{#if shown.length === 0}
  <p class="hint">Turn on a tracker above to see its activity.</p>
{/if}

<div class="legend">
  <span>Less</span>
  <svg width={4 * PITCH - 2} height={CELL} aria-hidden="true">
    {#each [0, 1, 2, 3] as level (level)}
      <rect class="cell level-{level}" x={level * PITCH} width={CELL} height={CELL} rx="2" />
    {/each}
  </svg>
  <span>More</span>
  {#if shown.some((card) => card.tracker.kind === 'quit')}
    <svg width={CELL} height={CELL} aria-hidden="true">
      <rect class="cell slipped" width={CELL} height={CELL} rx="2" />
      <path class="cross" d="M4 4l5 5m0-5l-5 5" />
    </svg>
    <span>Slipped</span>
    {#if shown.length > 1}
      {@const done = doneWidth(1, 2)}
      <svg width={CELL} height={CELL} aria-hidden="true">
        <rect class="level-2" width={done} height={CELL} rx="2" />
        <rect class="slipped" x={done + GAP} width={CELL - done - GAP} height={CELL} rx="2" />
      </svg>
      <span>Some slipped</span>
    {/if}
  {/if}
</div>

<details>
  <summary>Days with activity</summary>
  <ul>
    {#each activeDays as d (d.day)}
      <li>
        <strong>{dateLabel(d.day)}:</strong>
        {breakdown(d)
          .map((line) => `${line.name}: ${line.summary}${line.goalMet ? ' (goal met)' : ''}`)
          .join(' · ')}
      </li>
    {:else}
      <li>Nothing logged in the past year.</li>
    {/each}
  </ul>
</details>

<style>
  .filter {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0 0 0.5rem;
    padding: 0;
    border: 0;
  }

  .filter legend {
    margin-bottom: 0.35rem;
    padding: 0;
    font-size: 0.85rem;
    color: var(--ink-secondary);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.85rem;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    cursor: pointer;
  }

  .chip:has(input:checked) {
    border-color: var(--accent);
    background: var(--tint);
  }

  .chip:has(input:not(:checked)) {
    color: var(--ink-muted);
  }

  .chip input {
    margin: 0;
  }

  .grid-wrap {
    position: relative;
  }

  .scroll {
    overflow-x: auto;
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

  /* Ink, not red: red sits too close to the orange shades to tell apart at a glance. */
  .slipped {
    fill: var(--ink);
  }

  /* A split day draws its two parts underneath; the day's own square stays on top, see-through,
     to take the pointer and carry the today and selected outlines. */
  .split {
    fill: transparent;
  }

  .part {
    pointer-events: none;
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

  /* Sits above the day and opens away from the nearer edge, so it never runs off the card. */
  .tip {
    position: absolute;
    z-index: 1;
    transform: translate(-0.6rem, calc(-100% - 0.4rem));
    padding: 0.4rem 0.6rem;
    border-radius: 0.375rem;
    background: var(--ink);
    color: var(--surface);
    font-size: 0.85rem;
    white-space: nowrap;
    pointer-events: none;
  }

  .tip.align-right {
    transform: translate(calc(-100% + 0.6rem), calc(-100% - 0.4rem));
  }

  .tip p {
    margin: 0;
  }

  .tip-date,
  .tip span {
    opacity: 0.75;
  }

  .hint {
    margin: 0.5rem 0 0;
    color: var(--ink-secondary);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
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
