<script lang="ts">
  import type { Card } from '#lib/arrange.ts'
  import Menu, { type MenuItem } from '#lib/Menu.svelte'
  import type { Entry, Tracker } from '#lib/model.ts'
  import Name from '#lib/Name.svelte'
  import {
    bestStreak,
    completeDays,
    dailyAverage,
    daysWithout,
    doneCount,
    doneToday,
    goalStreak,
    habitStreak,
    longestStretch,
    resistedCount,
    slipCount,
    stagedBest,
    stagedStreak,
    usedToday,
    usedTotal,
  } from '#lib/stats.ts'
  import { count, formatAmount, formatQuantity, plural, unitFor } from '#lib/text.ts'

  // Drop feedback: a line where the dragged card would go, and a ring around the card or group
  // it would join (`into` also tints it, for going inside).
  export type Mark = { line?: 'before' | 'after'; ring?: 'join' | 'into' }

  type Props = {
    card: Card
    // Everything logged for the tracker and its stages.
    entries: Entry[]
    now: number
    menu: (tracker: Tracker) => MenuItem[]
    // The id whose name is being edited, if any.
    renaming: string | undefined
    rename: (id: string, name: string | undefined) => void
    log: (entry: Entry) => void
    slip: (tracker: Tracker) => void
    // While something is dragged: where it would land, and what's being dragged.
    mark: (id: string) => Mark | undefined
    dragging: string | undefined
    // Hidden cards sit outside the board and can't be dragged, so they show no grips.
    movable: boolean
  }
  let { card, entries, now, menu, renaming, rename, log, slip, mark, dragging, movable }: Props = $props()
  const tracker = $derived(card.tracker)
  const marked = $derived(mark(tracker.id))

  const BADGES = { habit: 'Habit', staged: 'Multi-stage', usage: 'Usage', quit: 'Quit' }

  function moment(t: Tracker) {
    return { id: crypto.randomUUID(), trackerId: t.id, at: Date.now() }
  }

  function logAmount(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const amount = Number(new FormData(event.currentTarget).get('amount'))
    event.currentTarget.reset()
    log({ ...moment(tracker), kind: 'used', amount })
  }
</script>

<!-- The data attributes are for drag and drop (see drag.svelte.ts). -->
<section
  class="card"
  class:lifted={dragging === tracker.id}
  class:drop-before={marked?.line === 'before'}
  class:drop-after={marked?.line === 'after'}
  class:drop-join={marked?.ring === 'join'}
  class:drop-into={marked?.ring === 'into'}
  data-id={tracker.id}
  data-kind={tracker.kind}
  data-group={tracker.groupId}
  data-top={tracker.groupId === undefined ? '' : undefined}
  data-drag
  data-drop="card"
>
  <header>
    {#if movable}
      <span class="grip" data-grip aria-hidden="true"></span>
    {/if}
    <div class="title">
      <Name name={tracker.name} editing={renaming === tracker.id} onsave={(name) => rename(tracker.id, name)} />
      <span class="badge">{BADGES[tracker.kind]}</span>
    </div>
    <Menu label="More for {tracker.name}" items={menu(tracker)} />
  </header>

  {#if tracker.kind === 'habit'}
    {@const streak = habitStreak(entries, now)}
    <p class="stat">
      <strong>{streak}</strong> {plural(streak, 'day')} in a row
      {#if doneToday(tracker, [], entries, now)}<span class="met">✓ Done today</span>{/if}
    </p>
    <dl class="stats">
      <div><dt>Total</dt><dd>{count(doneCount(entries), 'time')}</dd></div>
      <div><dt>Best streak</dt><dd>{count(bestStreak(entries), 'day')}</dd></div>
    </dl>
    <div class="actions">
      <button class="primary" onclick={() => log({ ...moment(tracker), kind: 'done' })}>Done</button>
    </div>
  {:else if tracker.kind === 'staged'}
    {@const streak = stagedStreak(card.stages, entries, now)}
    <p class="stat">
      <strong>{streak}</strong> {plural(streak, 'day')} in a row
      {#if doneToday(tracker, card.stages, entries, now)}<span class="met">✓ Done today</span>{/if}
    </p>
    <dl class="stats">
      <div><dt>Days complete</dt><dd>{count(completeDays(card.stages, entries).length, 'day')}</dd></div>
      <div><dt>Best streak</dt><dd>{count(stagedBest(card.stages, entries), 'day')}</dd></div>
    </dl>
    <ol class="stages" aria-label="Stages">
      {#each card.stages as stage (stage.id)}
        {@const done = doneToday(stage, [], entries.filter((e) => e.trackerId === stage.id), now)}
        {@const stageMark = mark(stage.id)}
        <li
          class="stage"
          class:lifted={dragging === stage.id}
          class:drop-before={stageMark?.line === 'before'}
          class:drop-after={stageMark?.line === 'after'}
          data-id={stage.id}
          data-kind={stage.kind}
          data-drag
          data-drop="stage"
        >
          {#if movable}
            <span class="grip" data-grip aria-hidden="true"></span>
          {/if}
          {#if done}
            <span class="check done" role="img" aria-label="Done today"></span>
          {:else}
            <button class="check" aria-label="Mark {stage.name} done" onclick={() => log({ ...moment(stage), kind: 'done' })}></button>
          {/if}
          <Name tag="span" name={stage.name} editing={renaming === stage.id} onsave={(name) => rename(stage.id, name)} />
          <Menu label="More for {stage.name}" items={menu(stage)} />
        </li>
      {/each}
    </ol>
  {:else if tracker.kind === 'usage'}
    {@const today = usedToday(entries, now)}
    {@const quick = tracker.quickAmounts ?? []}
    {#if tracker.dailyGoal}
      {@const goal = tracker.dailyGoal}
      <p class="stat">
        <strong>{formatAmount(today)}</strong> / {formatQuantity(goal, tracker.unit)} today
        {#if today >= goal}<span class="met goal-met">✓ Goal met</span>{/if}
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
        <div><dt>Goal streak</dt><dd>{count(goalStreak(tracker.dailyGoal, entries, now), 'day')}</dd></div>
      {/if}
      <div><dt>Total</dt><dd>{formatQuantity(usedTotal(entries), tracker.unit)}</dd></div>
      <div>
        <dt>Daily average</dt>
        <dd>{formatQuantity(dailyAverage(tracker, entries, now), tracker.unit)}</dd>
      </div>
    </dl>
    <!-- The quick amounts log with one tap, so they're the main action when there are any. -->
    {#if quick.length > 0}
      <div class="actions">
        {#each quick as amount (amount)}
          <button
            class="primary"
            aria-label="Log +{formatQuantity(amount, tracker.unit)} of {tracker.name}"
            onclick={() => log({ ...moment(tracker), kind: 'used', amount })}
          >
            +{formatAmount(amount)}
          </button>
        {/each}
      </div>
    {/if}
    <form class="actions" onsubmit={logAmount}>
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
      <button class:primary={quick.length === 0}>Log</button>
    </form>
  {:else}
    {@const days = daysWithout(tracker, entries, now)}
    <p class="stat"><strong>{days}</strong> {plural(days, 'day')} without</p>
    <dl class="stats">
      <div><dt>Resisted</dt><dd>{count(resistedCount(entries), 'time')}</dd></div>
      <div><dt>Slipped</dt><dd>{count(slipCount(entries), 'time')}</dd></div>
      <div><dt>Longest stretch</dt><dd>{count(longestStretch(tracker, entries, now), 'day')}</dd></div>
    </dl>
    <div class="actions">
      <button class="primary" onclick={() => log({ ...moment(tracker), kind: 'resisted' })}>Resisted</button>
      <button onclick={() => slip(tracker)}>Slipped</button>
    </div>
  {/if}
</section>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .title {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .badge {
    padding: 0.1rem 0.55rem;
    border-radius: 999px;
    background: var(--tint);
    color: var(--ink-secondary);
    font-size: 0.75rem;
    font-weight: 600;
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

  .met {
    margin-left: 0.5rem;
  }

  /* "Goal met" arrives as the bar reaches the end (see .meter in app.css). */
  .goal-met {
    transition: opacity 0.3s ease 0.8s;
  }

  @starting-style {
    .goal-met {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .goal-met {
      transition: none;
    }
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

  /* The typed box under the quick amounts. */
  .actions + .actions {
    margin-top: 0.5rem;
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

  /* A checklist of stages, each with its own handle, check and menu. */
  .stages {
    margin: 0.85rem 0 0;
    padding: 0;
    border-top: 1px solid var(--border);
    list-style: none;
  }

  .stage {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .stage :global(.name) {
    flex: 1;
    min-width: 0;
  }
</style>
