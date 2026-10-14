<script lang="ts">
  import ActivityGrid from '#lib/ActivityGrid.svelte'
  import { listEntries, listTrackers, saveEntry, saveTracker } from '#lib/db.ts'
  import type { Entry, Tracker, TrackerKind } from '#lib/model.ts'
  import { daysWithout, habitStreak, resistedCount, usedToday } from '#lib/stats.ts'
  import { count, formatAmount } from '#lib/text.ts'

  let trackers = $state<Tracker[]>([])
  let entries = $state<Entry[]>([])
  let now = $state(Date.now())

  const loading = Promise.all([listTrackers(), listEntries()]).then(([savedTrackers, savedEntries]) => {
    trackers = savedTrackers.toSorted((a, b) => a.createdAt - b.createdAt)
    entries = savedEntries
  })

  // Keeps "today" and day counts current while the page stays open.
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  let name = $state('')
  let kind = $state<TrackerKind>('habit')
  let unit = $state('')

  async function addTracker(event: SubmitEvent) {
    event.preventDefault()
    const base = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now() }
    const tracker: Tracker = kind === 'usage' ? { ...base, kind, unit: unit.trim() } : { ...base, kind }
    await saveTracker(tracker)
    trackers.push(tracker)
    name = ''
    unit = ''
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
    if (!confirm(`Log a slip for ${tracker.name}? This resets your days without.`)) return
    await log({ ...moment(tracker), kind: 'slipped' })
  }
</script>

<svelte:head>
  <title>Accountability</title>
</svelte:head>

<main>
  <h1>Accountability</h1>

  {#await loading then}
    {#if trackers.length > 0}
      <section>
        <h2>Activity</h2>
        <ActivityGrid {trackers} {entries} {now} />
      </section>
    {/if}

    {#each trackers as tracker (tracker.id)}
      {@const trackerEntries = entries.filter((e) => e.trackerId === tracker.id)}
      <section>
        <!-- The unit sits in the title, so bare amounts read right for any unit. -->
        <h2>{tracker.name}{#if tracker.kind === 'usage'}{' '}<span class="unit">({tracker.unit})</span>{/if}</h2>
        {#if tracker.kind === 'habit'}
          <p>{habitStreak(trackerEntries, now)}-day streak</p>
          <button onclick={() => log({ ...moment(tracker), kind: 'done' })}>Done</button>
        {:else if tracker.kind === 'usage'}
          <p>Today: {formatAmount(usedToday(trackerEntries, now))}</p>
          <form onsubmit={(event) => logAmount(event, tracker)}>
            <input
              class="amount"
              name="amount"
              placeholder="Amount"
              type="number"
              inputmode="decimal"
              step="any"
              min="0"
              required
              aria-label="Amount in {tracker.unit}"
            />
            <button>Log</button>
          </form>
        {:else}
          <p>
            {count(daysWithout(tracker, trackerEntries, now), 'day')} without · resisted
            {count(resistedCount(trackerEntries), 'time')}
          </p>
          <button onclick={() => log({ ...moment(tracker), kind: 'resisted' })}>Resisted</button>
          <button onclick={() => logSlip(tracker)}>Slipped</button>
        {/if}
      </section>
    {:else}
      <p>No trackers yet. Add one below.</p>
    {/each}

    <form class="new-tracker" onsubmit={addTracker}>
      <h2>New tracker</h2>
      <label>Name <input bind:value={name} required /></label>
      <label>
        Type
        <select bind:value={kind}>
          <option value="habit">Habit: do it regularly</option>
          <option value="usage">Usage: measure amounts</option>
          <option value="quit">Quit: stay away from it</option>
        </select>
      </label>
      {#if kind === 'usage'}
        <label>Unit <input bind:value={unit} placeholder="cups, minutes, $" required /></label>
      {/if}
      <button>Add tracker</button>
    </form>
  {:catch error}
    <p role="alert">Couldn't open your saved data: {error.message}</p>
  {/await}
</main>

<style>
  main {
    max-width: 56rem;
    margin: 0 auto;
    padding: 1rem;
  }

  section,
  .new-tracker {
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    margin-block: 0.75rem;
  }

  h2 {
    font-size: 1.1rem;
    margin: 0 0 0.25rem;
  }

  .unit {
    font-weight: normal;
    color: var(--ink-secondary);
  }

  p {
    margin: 0 0 0.5rem;
  }

  label {
    display: block;
    margin-block: 0.5rem;
  }

  /* 44px tall: a comfortable tap target. */
  button,
  input,
  select {
    box-sizing: border-box;
    min-height: 2.75rem;
    font: inherit;
    padding: 0.4rem 0.75rem;
  }

  .amount {
    width: 8rem;
  }

  button + button {
    margin-left: 0.5rem;
  }
</style>
