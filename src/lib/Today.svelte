<script lang="ts">
  import { idsOf, type Card, type Item } from '#lib/arrange.ts'
  import type { Entry, Tracker } from '#lib/model.ts'
  import { daysWithout, doneToday, habitStreak, usedToday } from '#lib/stats.ts'
  import { formatAmount, formatQuantity, plural } from '#lib/text.ts'

  type Props = {
    // The cards as the page arranges them, groups included.
    items: Item[]
    // The hidden cards, while they're unlocked.
    hidden: Card[]
    // Everything logged for all of them.
    entries: Entry[]
    now: number
    log: (entry: Entry) => void
    slip: (tracker: Tracker) => void
  }
  let { items, hidden, entries, now, log, slip }: Props = $props()

  // A run of rows under one heading: a group's cards, the hidden ones, or cards on their own,
  // which have no heading.
  type Section = { id: string; title?: string; cards: Card[] }

  // In page order, so each row sits where its card does. Rows never move when they're tapped.
  const sections = $derived.by(() => {
    const sections: Section[] = []
    for (const item of items) {
      const last = sections.at(-1)
      if (item.type === 'group') sections.push({ id: item.group.id, title: item.group.name, cards: item.cards })
      else if (last && last.title === undefined) last.cards.push(item.card)
      else sections.push({ id: item.card.tracker.id, cards: [item.card] })
    }
    if (hidden.length > 0) sections.push({ id: 'hidden', title: 'Hidden', cards: hidden })
    return sections
  })

  function moment(t: Tracker) {
    return { id: crypto.randomUUID(), trackerId: t.id, at: Date.now() }
  }

  function loggedFor(ids: string[]): Entry[] {
    return entries.filter((e) => ids.includes(e.trackerId))
  }

  function logAmount(event: SubmitEvent & { currentTarget: HTMLFormElement }, tracker: Tracker) {
    event.preventDefault()
    const amount = Number(new FormData(event.currentTarget).get('amount'))
    event.currentTarget.reset()
    log({ ...moment(tracker), kind: 'used', amount })
  }
</script>

{#snippet row(card: Card)}
  {@const tracker = card.tracker}
  {@const logged = loggedFor(idsOf(card))}
  {@const done = doneToday(tracker, card.stages, logged, now)}
  <li class="row">
    <div class="line">
      <div class="what">
        <span class="name">{tracker.name}</span>
        {#if tracker.kind === 'habit'}
          {@const streak = habitStreak(logged, now)}
          <span class="status">{streak} {plural(streak, 'day')} in a row</span>
        {:else if tracker.kind === 'staged'}
          {@const stagesDone = card.stages.filter((stage) => doneToday(stage, [], loggedFor([stage.id]), now)).length}
          <span class="status">{stagesDone} of {card.stages.length} {plural(card.stages.length, 'stage')}</span>
        {:else if tracker.kind === 'usage'}
          {@const today = usedToday(logged, now)}
          <span class="status">
            {#if tracker.dailyGoal}
              {formatAmount(today)} / {formatQuantity(tracker.dailyGoal, tracker.unit)} today
              {#if done}<span class="met">✓</span>{/if}
            {:else}
              {formatQuantity(today, tracker.unit)} today
            {/if}
          </span>
        {:else}
          {@const days = daysWithout(tracker, logged, now)}
          <span class="status">{days} {plural(days, 'day')} without</span>
        {/if}
      </div>

      {#if tracker.kind === 'habit'}
        <div class="actions">
          {#if done}
            <span class="met">✓ Done</span>
          {:else}
            <button class="primary" aria-label="Mark {tracker.name} done" onclick={() => log({ ...moment(tracker), kind: 'done' })}>Done</button>
          {/if}
        </div>
      {:else if tracker.kind === 'staged'}
        {#if done}
          <div class="actions"><span class="met">✓ Done</span></div>
        {/if}
      {:else if tracker.kind === 'usage'}
        {#if tracker.quickAmounts?.length}
          <div class="actions">
            {#each tracker.quickAmounts as amount (amount)}
              <button
                class="primary"
                aria-label="Log +{formatQuantity(amount, tracker.unit)} of {tracker.name}"
                onclick={() => log({ ...moment(tracker), kind: 'used', amount })}
              >
                +{formatAmount(amount)}
              </button>
            {/each}
          </div>
        {:else}
          <!-- No quick amounts yet: a box for any amount, as on the card. -->
          <form class="actions" onsubmit={(event) => logAmount(event, tracker)}>
            <input
              name="amount"
              type="number"
              inputmode="decimal"
              step="any"
              min="0"
              required
              placeholder={tracker.unit}
              aria-label="Amount of {tracker.name} in {tracker.unit}"
            />
            <button class="primary">Log</button>
          </form>
        {/if}
      {:else}
        <div class="actions">
          <button class="primary" aria-label="Resisted {tracker.name}" onclick={() => log({ ...moment(tracker), kind: 'resisted' })}>Resisted</button>
          <button aria-label="Slipped {tracker.name}" onclick={() => slip(tracker)}>Slipped</button>
        </div>
      {/if}
    </div>

    {#if tracker.kind === 'staged'}
      <ol class="stages" aria-label="Stages of {tracker.name}">
        {#each card.stages as stage (stage.id)}
          <li>
            {#if doneToday(stage, [], loggedFor([stage.id]), now)}
              <span class="check done" role="img" aria-label="Done today"></span>
            {:else}
              <button class="check" aria-label="Mark {stage.name} done" onclick={() => log({ ...moment(stage), kind: 'done' })}></button>
            {/if}
            <span>{stage.name}</span>
          </li>
        {/each}
      </ol>
    {/if}
  </li>
{/snippet}

<!-- One tap per tracker, without scrolling past the grid and the cards. -->
<section class="card today" aria-labelledby="today-title">
  <h2 id="today-title">Today</h2>
  {#each sections as section (section.id)}
    {#if section.title}
      <h3>{section.title}</h3>
    {/if}
    <ul class:under={section.title !== undefined}>
      {#each section.cards as card (card.tracker.id)}
        {@render row(card)}
      {/each}
    </ul>
  {/each}
</section>

<style>
  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }

  /* A group's name, or "Hidden", over its rows. */
  h3 {
    margin: 0.75rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
    font-weight: 600;
  }

  ul,
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* A group's rows sit in from the edge, so the rows after it read as outside it. */
  .under {
    padding-left: 0.85rem;
    border-left: 2px solid var(--border);
  }

  .row {
    padding-block: 0.4rem;
  }

  .row + .row {
    border-top: 1px solid var(--border);
  }

  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem 0.75rem;
  }

  .what {
    display: grid;
    flex: 1 1 8rem;
    min-width: 0;
  }

  .name {
    overflow-wrap: anywhere;
    font-weight: 600;
  }

  .status {
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  .actions input {
    width: 6.5rem;
  }

  .stages li {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-left: -0.6rem;
  }
</style>
