<script lang="ts">
  import ActivityGrid from '#lib/ActivityGrid.svelte'
  import ConfirmDialog from '#lib/ConfirmDialog.svelte'
  import { deleteTracker, listEntries, listTrackers, saveEntry, saveTracker } from '#lib/db.ts'
  import type { Entry, Tracker, TrackerKind } from '#lib/model.ts'
  import {
    bestStreak,
    dailyAverage,
    daysWithout,
    doneCount,
    goalStreak,
    habitStreak,
    longestStretch,
    resistedCount,
    slipCount,
    usedToday,
    usedTotal,
  } from '#lib/stats.ts'
  import { count, formatAmount, formatQuantity, plural, unitFor } from '#lib/text.ts'

  const KINDS: { kind: TrackerKind; label: string; hint: string }[] = [
    { kind: 'habit', label: 'Habit', hint: 'Build a routine' },
    { kind: 'usage', label: 'Usage', hint: 'Measure amounts' },
    { kind: 'quit', label: 'Quit', hint: 'Stay away from it' },
  ]

  let trackers = $state<Tracker[]>([])
  let entries = $state<Entry[]>([])
  let now = $state(Date.now())
  let confirmDialog: ReturnType<typeof ConfirmDialog>
  // The new-tracker form: open while there are no trackers, so the first step is obvious, and
  // closed after adding one, so the new card is in view.
  let formOpen = $state(false)

  const loading = Promise.all([listTrackers(), listEntries()]).then(([savedTrackers, savedEntries]) => {
    trackers = savedTrackers.toSorted((a, b) => a.createdAt - b.createdAt)
    entries = savedEntries
    formOpen = trackers.length === 0
  })

  // Keeps "today" and day counts current while the page stays open.
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  let name = $state('')
  let kind = $state<TrackerKind>('habit')
  let unit = $state('')
  let goal = $state<number | null>(null)
  // "64 ounces" in the unit field means the amount belongs in the daily goal.
  const unitHasNumber = $derived(kind === 'usage' && /\d/.test(unit))

  async function addTracker(event: SubmitEvent) {
    event.preventDefault()
    const base = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now() }
    const tracker: Tracker =
      kind === 'usage'
        ? { ...base, kind, unit: unit.trim(), ...(goal ? { dailyGoal: goal } : {}) }
        : { ...base, kind }
    await saveTracker(tracker)
    trackers.push(tracker)
    // Without this, `now` (refreshed every minute) can be older than the new tracker, and a
    // quit tracker would start at -1 days without.
    now = Date.now()
    name = ''
    unit = ''
    goal = null
    formOpen = false
  }

  function moment(tracker: Tracker) {
    return { id: crypto.randomUUID(), trackerId: tracker.id, at: Date.now() }
  }

  async function log(entry: Entry) {
    await saveEntry(entry)
    entries.push(entry)
    now = Date.now()
  }

  function logAmount(event: SubmitEvent & { currentTarget: HTMLFormElement }, tracker: Tracker) {
    event.preventDefault()
    const amount = Number(new FormData(event.currentTarget).get('amount'))
    event.currentTarget.reset()
    return log({ ...moment(tracker), kind: 'used', amount })
  }

  async function logSlip(tracker: Tracker) {
    const confirmed = await confirmDialog.ask({
      title: `Log a slip for ${tracker.name}?`,
      message: 'This resets your days without.',
      confirmLabel: 'Log slip',
      danger: false,
    })
    if (!confirmed) return
    await log({ ...moment(tracker), kind: 'slipped' })
  }

  async function removeTracker(tracker: Tracker) {
    const confirmed = await confirmDialog.ask({
      title: `Delete ${tracker.name}?`,
      message: "This removes the tracker and everything logged for it. It can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) return
    await deleteTracker(tracker.id)
    trackers = trackers.filter((t) => t.id !== tracker.id)
    entries = entries.filter((e) => e.trackerId !== tracker.id)
    if (trackers.length === 0) formOpen = true
  }

  function kindLabel(tracker: Tracker): string {
    return KINDS.find((k) => k.kind === tracker.kind)!.label
  }
</script>

<svelte:head>
  <title>Accountability</title>
</svelte:head>

<main>
  <h1>Accountability</h1>

  {#await loading then}
    {#if trackers.length > 0}
      <section class="card">
        <h2>Activity</h2>
        <ActivityGrid {trackers} {entries} {now} />
      </section>
    {/if}

    {#each trackers as tracker (tracker.id)}
      {@const trackerEntries = entries.filter((e) => e.trackerId === tracker.id)}
      <section class="card">
        <header>
          <div class="title">
            <h2>{tracker.name}</h2>
            <span class="badge">{kindLabel(tracker)}</span>
          </div>
          <button class="icon" aria-label="Delete {tracker.name}" title="Delete" onclick={() => removeTracker(tracker)}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"
              />
            </svg>
          </button>
        </header>

        {#if tracker.kind === 'habit'}
          {@const streak = habitStreak(trackerEntries, now)}
          <p class="stat"><strong>{streak}</strong> {plural(streak, 'day')} in a row</p>
          <dl class="stats">
            <div><dt>Total</dt><dd>{count(doneCount(trackerEntries), 'time')}</dd></div>
            <div><dt>Best streak</dt><dd>{count(bestStreak(trackerEntries), 'day')}</dd></div>
          </dl>
          <div class="actions">
            <button class="primary" onclick={() => log({ ...moment(tracker), kind: 'done' })}>Done</button>
          </div>
        {:else if tracker.kind === 'usage'}
          {@const today = usedToday(trackerEntries, now)}
          {#if tracker.dailyGoal}
            {@const goal = tracker.dailyGoal}
            <p class="stat">
              <strong>{formatAmount(today)}</strong> / {formatQuantity(goal, tracker.unit)} today
              {#if today >= goal}<span class="goal-met">✓ Goal met</span>{/if}
            </p>
            <div
              class="meter"
              role="progressbar"
              aria-label="Today toward the daily goal"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={today}
            >
              <div class:reached={today >= goal} style:--progress="{Math.min(today / goal, 1) * 100}%"></div>
            </div>
          {:else}
            <p class="stat"><strong>{formatAmount(today)}</strong> {unitFor(today, tracker.unit)} today</p>
          {/if}
          <dl class="stats">
            {#if tracker.dailyGoal}
              <div><dt>Goal streak</dt><dd>{count(goalStreak(tracker.dailyGoal, trackerEntries, now), 'day')}</dd></div>
            {/if}
            <div><dt>Total</dt><dd>{formatQuantity(usedTotal(trackerEntries), tracker.unit)}</dd></div>
            <div>
              <dt>Daily average</dt>
              <dd>{formatQuantity(dailyAverage(tracker, trackerEntries, now), tracker.unit)}</dd>
            </div>
          </dl>
          <form class="actions" onsubmit={(event) => logAmount(event, tracker)}>
            <label class="amount">
              <input
                name="amount"
                type="number"
                inputmode="decimal"
                step="any"
                min="0"
                required
                placeholder="Amount"
                aria-label="Amount in {tracker.unit}"
              />
              <span aria-hidden="true">{tracker.unit}</span>
            </label>
            <button class="primary">Log</button>
          </form>
        {:else}
          {@const days = daysWithout(tracker, trackerEntries, now)}
          <p class="stat"><strong>{days}</strong> {plural(days, 'day')} without</p>
          <dl class="stats">
            <div><dt>Resisted</dt><dd>{count(resistedCount(trackerEntries), 'time')}</dd></div>
            <div><dt>Slipped</dt><dd>{count(slipCount(trackerEntries), 'time')}</dd></div>
            <div><dt>Longest stretch</dt><dd>{count(longestStretch(tracker, trackerEntries, now), 'day')}</dd></div>
          </dl>
          <div class="actions">
            <button class="primary" onclick={() => log({ ...moment(tracker), kind: 'resisted' })}>Resisted</button>
            <button onclick={() => logSlip(tracker)}>Slipped</button>
          </div>
        {/if}
      </section>
    {/each}

    <details class="card new-tracker" bind:open={formOpen}>
      <summary>New tracker</summary>
      <form onsubmit={addTracker}>
        <label class="field">
          <span>Name</span>
          <input bind:value={name} required placeholder="e.g. Morning run" />
        </label>
        <fieldset class="type">
          <legend>Type</legend>
          <div class="kinds">
            {#each KINDS as option (option.kind)}
              <label class="kind">
                <input type="radio" name="kind" value={option.kind} bind:group={kind} />
                <strong>{option.label}</strong>
                <span>{option.hint}</span>
              </label>
            {/each}
          </div>
        </fieldset>
        {#if kind === 'usage'}
          <div class="pair">
            <label class="field">
              <span>Unit</span>
              <input
                bind:value={unit}
                required
                placeholder="ounces, cups, minutes"
                aria-invalid={unitHasNumber}
                aria-describedby={unitHasNumber ? 'unit-error' : undefined}
              />
              {#if unitHasNumber}
                <small id="unit-error" class="error">Just the word, like ounces. Amounts go in Daily goal.</small>
              {/if}
            </label>
            <label class="field">
              <span>Daily goal <small>optional</small></span>
              <input bind:value={goal} type="number" inputmode="decimal" min="0" step="any" placeholder="e.g. 64" />
            </label>
          </div>
        {/if}
        <button class="primary" disabled={unitHasNumber}>Add tracker</button>
      </form>
    </details>
  {:catch error}
    <p role="alert">Couldn't open your saved data: {error.message}</p>
  {/await}
</main>

<ConfirmDialog bind:this={confirmDialog} />

<style>
  main {
    max-width: 56rem;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
  }

  h1 {
    margin: 0.5rem 0 1rem;
    font-size: 1.9rem;
    letter-spacing: -0.01em;
  }

  .card {
    margin-block: 0.875rem;
    padding: 1rem 1.15rem;
    border: 1px solid var(--border);
    border-radius: 0.875rem;
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .title {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .badge {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--tint);
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .icon {
    display: inline-grid;
    place-items: center;
    min-width: 2.75rem;
    padding: 0;
    border-color: transparent;
    background: none;
    color: var(--ink-muted);
  }

  .icon path {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (hover: hover) {
    .icon:hover {
      color: var(--critical);
    }
  }

  .stat {
    margin: 0.6rem 0 0;
    color: var(--ink-secondary);
  }

  .stat strong {
    margin-right: 0.1rem;
    color: var(--ink);
    font-size: 1.75rem;
    line-height: 1;
  }

  /* Label above value, as in the dataviz stat-tile pattern. */
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem 1.75rem;
    margin: 0.75rem 0 0;
  }

  .stats dt {
    color: var(--ink-secondary);
    font-size: 0.8rem;
  }

  .stats dd {
    margin: 0;
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.85rem;
  }

  .goal-met {
    margin-left: 0.5rem;
    color: var(--good-ink);
    font-size: 0.85rem;
    font-weight: 600;
    transition: opacity 0.3s ease 0.8s;
  }

  /* A meter: the accent fill on a lighter track of the same blue. The fill slides to today's
     progress, and once the goal is reached it turns green as it arrives at the end. */
  .meter {
    max-width: 20rem;
    height: 0.5rem;
    margin-top: 0.6rem;
    overflow: hidden;
    border-radius: 999px;
    background: var(--tint);
  }

  .meter > div {
    width: var(--progress);
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition:
      width 0.8s ease-out,
      background-color 0.3s ease 0.8s;
  }

  .meter > .reached {
    background: var(--good);
  }

  /* Where a new bar and "Goal met" label start, so they fill up and fade in on arrival. */
  @starting-style {
    .meter > div,
    .meter > .reached {
      width: 0;
      background-color: var(--accent);
    }

    .goal-met {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .meter > div,
    .goal-met {
      transition: none;
    }
  }

  .amount {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--ink-secondary);
  }

  .amount input {
    width: 7rem;
    color: var(--ink);
  }

  /* Closed, it's a dashed "+ New tracker" row inviting the next step. */
  .new-tracker:not([open]) {
    border-style: dashed;
    background: none;
    box-shadow: none;
  }

  .new-tracker summary {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 2.75rem;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
  }

  .new-tracker summary::-webkit-details-marker {
    display: none;
  }

  .new-tracker summary::before {
    content: '+';
    display: grid;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: var(--tint);
    color: var(--accent);
    font-size: 1.25rem;
    line-height: 1;
  }

  .new-tracker[open] summary::before {
    content: '−';
  }

  .new-tracker form {
    display: grid;
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .field {
    display: grid;
    gap: 0.35rem;
  }

  .field > span,
  .type legend {
    padding: 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .field > span small {
    font-weight: normal;
    color: var(--ink-muted);
  }

  /* The text stays in the ink color for contrast; the red icon marks it as a problem. */
  .field .error::before {
    content: '⚠ ';
    color: var(--critical);
  }

  /* Top-aligned, so a message under one field doesn't stretch the other. */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: start;
    gap: 0.75rem;
  }

  .type {
    margin: 0;
    padding: 0;
    border: 0;
  }

  .type legend {
    margin-bottom: 0.35rem;
  }

  .kinds {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .kind {
    position: relative;
    display: grid;
    gap: 0.1rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    cursor: pointer;
  }

  .kind span {
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  /* The radio stays focusable for keyboards while the card shows the choice. */
  .kind input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .kind:has(input:checked) {
    border-color: var(--accent);
    background: var(--tint);
  }

  .kind:has(input:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .new-tracker button {
    justify-self: start;
  }

  @media (max-width: 30rem) {
    .kinds,
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
