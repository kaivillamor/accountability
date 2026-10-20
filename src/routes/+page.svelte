<script lang="ts">
  import ActivityGrid from '#lib/ActivityGrid.svelte'
  import {
    after,
    arrange,
    dissolve,
    idsOf,
    lead,
    move,
    nextOrder,
    remove,
    withChange,
    type Card,
    type Destination,
  } from '#lib/arrange.ts'
  import ChoiceDialog from '#lib/ChoiceDialog.svelte'
  import ConfirmDialog from '#lib/ConfirmDialog.svelte'
  import { apply, listEntries, listGroups, listTrackers, saveEntry, saveGroup, saveTracker } from '#lib/db.ts'
  import { Drag } from '#lib/drag.svelte.ts'
  import GroupBox from '#lib/GroupBox.svelte'
  import type { MenuItem } from '#lib/Menu.svelte'
  import type { Change, Entry, Group, Tracker } from '#lib/model.ts'
  import ThemePicker from '#lib/ThemePicker.svelte'
  import TrackerCard, { type Mark } from '#lib/TrackerCard.svelte'
  import { count } from '#lib/text.ts'

  // The kinds the form creates. A staged habit comes from dragging habits together.
  type NewKind = 'habit' | 'usage' | 'quit'
  const KINDS: { kind: NewKind; label: string; hint: string }[] = [
    { kind: 'habit', label: 'Habit', hint: 'Build a routine' },
    { kind: 'usage', label: 'Usage', hint: 'Measure amounts' },
    { kind: 'quit', label: 'Quit', hint: 'Stay away from it' },
  ]

  let trackers = $state<Tracker[]>([])
  let groups = $state<Group[]>([])
  let entries = $state<Entry[]>([])
  let now = $state(Date.now())
  // The tracker or group whose name is being edited.
  let renaming = $state<string>()
  let confirmDialog: ReturnType<typeof ConfirmDialog>
  let choiceDialog: ReturnType<typeof ChoiceDialog>
  // The new-tracker form: open while there are no trackers, so the first step is obvious, and
  // closed after adding one, so the new card is in view.
  let formOpen = $state(false)

  const items = $derived(arrange(trackers, groups))
  // Every card in page order, grouped or not.
  const cards = $derived(items.flatMap((item) => (item.type === 'group' ? item.cards : [item.card])))

  const loading = Promise.all([listTrackers(), listGroups(), listEntries()]).then(([savedTrackers, savedGroups, savedEntries]) => {
    trackers = savedTrackers
    groups = savedGroups
    entries = savedEntries
    formOpen = trackers.length === 0
  })

  // Keeps "today" and day counts current while the page stays open.
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 60_000)
    return () => clearInterval(timer)
  })

  let name = $state('')
  let kind = $state<NewKind>('habit')
  let unit = $state('')
  let goal = $state<number | null>(null)
  // "64 ounces" in the unit field means the amount belongs in the daily goal.
  const unitHasNumber = $derived(kind === 'usage' && /\d/.test(unit))

  async function addTracker(event: SubmitEvent) {
    event.preventDefault()
    const base = { id: crypto.randomUUID(), name: name.trim(), createdAt: Date.now(), order: nextOrder(trackers, groups) }
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

  async function log(entry: Entry) {
    await saveEntry(entry)
    entries.push(entry)
    now = Date.now()
  }

  async function logSlip(tracker: Tracker) {
    const confirmed = await confirmDialog.ask({
      title: `Log a slip for ${tracker.name}?`,
      message: 'This resets your days without.',
      confirmLabel: 'Log slip',
      danger: false,
    })
    if (!confirmed) return
    await log({ id: crypto.randomUUID(), trackerId: tracker.id, at: Date.now(), kind: 'slipped' })
  }

  // Saves a rearrangement or deletion, then shows it.
  async function save(change: Change) {
    await apply(change)
    trackers = withChange(trackers, change.putTrackers, change.deleteTrackerIds)
    groups = withChange(groups, change.putGroups, change.deleteGroupIds)
    entries = entries.filter((e) => !change.deleteTrackerIds.includes(e.trackerId))
  }

  async function moveTo(id: string, to: Destination) {
    const { change, created } = move(trackers, groups, id, to, Date.now())
    await save(change)
    // A new group or staged habit opens with its name ready to type over.
    if (created) renaming = created
  }

  async function rename(id: string, newName: string | undefined) {
    renaming = undefined
    const group = groups.find((g) => g.id === id)
    const tracker = trackers.find((t) => t.id === id)
    if (newName === undefined || newName === (group ?? tracker)?.name) return
    if (group) {
      await updateGroup({ ...$state.snapshot(group), name: newName })
    } else if (tracker) {
      const renamed = { ...$state.snapshot(tracker), name: newName }
      await saveTracker(renamed)
      trackers = trackers.map((t) => (t.id === id ? renamed : t))
    }
  }

  async function updateGroup(next: Group) {
    await saveGroup(next)
    groups = groups.map((g) => (g.id === next.id ? next : g))
  }

  function toggle(group: Group) {
    return updateGroup({ ...$state.snapshot(group), collapsed: !group.collapsed })
  }

  async function removeTracker(tracker: Tracker) {
    const stages = trackers.filter((t) => t.parent?.id === tracker.id).length
    const confirmed = await confirmDialog.ask({
      title: `Delete ${tracker.name}?`,
      message:
        stages > 0
          ? `This removes it, its ${count(stages, 'stage')} and everything logged for them. It can't be undone.`
          : "This removes the tracker and everything logged for it. It can't be undone.",
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!confirmed) return
    await save(remove(trackers, groups, tracker.id, Date.now()))
    if (trackers.length === 0) formOpen = true
  }

  async function separate(tracker: Tracker) {
    const confirmed = await confirmDialog.ask({
      title: `Separate ${tracker.name}?`,
      message: 'Its stages become habits of their own, and everything logged stays. Its streak starts over if you put them back together.',
      confirmLabel: 'Separate',
      danger: false,
    })
    if (confirmed) await save(dissolve(trackers, groups, tracker.id, Date.now()))
  }

  type Choice = { id: string; label: string; detail: string; to: Destination }

  // Groups to join, and cards on their own to start a group with.
  function groupChoices(tracker: Tracker): Choice[] {
    return items.flatMap((item): Choice[] => {
      if (item.type === 'group') {
        if (item.group.id === tracker.groupId) return []
        return [{ id: item.group.id, label: item.group.name, detail: count(item.cards.length, 'tracker'), to: { type: 'list', groupId: item.group.id } }]
      }
      const other = item.card.tracker
      if (other.id === tracker.id) return []
      return [{ id: other.id, label: other.name, detail: 'New group', to: { type: 'beside', id: other.id, after: true } }]
    })
  }

  // Staged habits to join, and habits to make a staged habit with.
  function stageChoices(tracker: Tracker): Choice[] {
    return cards.flatMap(({ tracker: other, stages }): Choice[] => {
      if (other.id === tracker.id) return []
      if (other.kind === 'staged') return [{ id: other.id, label: other.name, detail: count(stages.length, 'stage'), to: { type: 'into', id: other.id } }]
      if (other.kind === 'habit') return [{ id: other.id, label: other.name, detail: 'New multi-stage habit', to: { type: 'into', id: other.id } }]
      return []
    })
  }

  // The menu's way to do what dragging does, for keyboards and screen readers.
  async function choose(tracker: Tracker, title: string, choices: Choice[]) {
    const id = await choiceDialog.choose({ title, choices })
    const choice = choices.find((c) => c.id === id)
    if (choice) await moveTo(tracker.id, choice.to)
  }

  function trackerMenu(tracker: Tracker): MenuItem[] {
    const menu: MenuItem[] = [{ label: 'Rename', run: () => (renaming = tracker.id) }]
    const parent = trackers.find((t) => t.id === tracker.parent?.id)
    const group = groups.find((g) => g.id === tracker.groupId)
    if (parent) {
      menu.push({ label: `Take out of ${parent.name}`, run: () => moveTo(tracker.id, after(trackers, groups, parent.id)) })
    } else {
      const groupWith = groupChoices(tracker)
      if (groupWith.length > 0) menu.push({ label: 'Group with…', run: () => choose(tracker, `Group ${tracker.name} with…`, groupWith) })
      const stageWith = tracker.kind === 'habit' ? stageChoices(tracker) : []
      if (stageWith.length > 0) {
        menu.push({ label: 'Make a stage of…', run: () => choose(tracker, `Make ${tracker.name} a stage of…`, stageWith) })
      }
      if (tracker.kind === 'staged') menu.push({ label: 'Separate stages', run: () => separate(tracker) })
      if (group) menu.push({ label: `Take out of ${group.name}`, run: () => moveTo(tracker.id, after(trackers, groups, group.id)) })
    }
    menu.push({ label: 'Delete', critical: true, run: () => removeTracker(tracker) })
    return menu
  }

  function groupMenu(group: Group): MenuItem[] {
    return [
      { label: 'Rename', run: () => (renaming = group.id) },
      { label: 'Ungroup', run: () => save(dissolve(trackers, groups, group.id, Date.now())) },
    ]
  }

  const drag = new Drag(moveTo)

  // Where the dragged card would land: a line where it would go, a ring around the card or group
  // it would join, and a ring and tint around the habit it would go into.
  const marks = $derived.by(() => {
    const marks = new Map<string, Mark>()
    const add = (id: string, mark: Mark) => marks.set(id, { ...marks.get(id), ...mark })
    const drop = drag.drop
    if (!drop || drop.type === 'stay') return marks
    if (drop.type === 'into') return add(drop.id, { ring: 'into' })
    if (drop.type === 'beside') {
      const target = trackers.find((t) => t.id === drop.id)!
      const holder = target.parent?.id ?? target.groupId
      add(drop.id, { line: drop.after ? 'after' : 'before' })
      return holder === undefined ? add(drop.id, { ring: 'join' }) : add(holder, { ring: 'into' })
    }
    const group = items.find((item) => item.type === 'group' && item.group.id === drop.groupId)
    if (group?.type === 'group') add(group.group.id, { ring: 'into' })
    const list = (group?.type === 'group' ? group.cards.map((c) => c.tracker) : items.map(lead))
      .map((x) => x.id)
      .filter((id) => id !== drag.subject)
    const index = drop.index ?? list.length
    if (index < list.length) add(list[index], { line: 'before' })
    else if (list.length > 0) add(list[list.length - 1], { line: 'after' })
    return marks
  })
  const mark = (id: string) => marks.get(id)

  // What dropping now would do, in words, shown above the pointer.
  const dropLabel = $derived.by(() => {
    const drop = drag.drop
    const subject = drag.subject
    if (!drop || !subject || drop.type === 'stay') return undefined
    const nameOf = (id: string) => (trackers.find((t) => t.id === id) ?? groups.find((g) => g.id === id))!.name
    const moving = trackers.find((t) => t.id === subject)
    const from = moving?.parent?.id ?? moving?.groupId
    if (drop.type === 'into') {
      const target = trackers.find((t) => t.id === drop.id)!
      if (target.kind === 'habit') return `Make stages with ${target.name}`
      return from === target.id ? 'Move to the end' : `Add as a stage of ${target.name}`
    }
    if (drop.type === 'beside') {
      const target = trackers.find((t) => t.id === drop.id)!
      const holder = target.parent?.id ?? target.groupId
      if (holder === undefined) return `Group with ${target.name}`
      if (holder === from) return 'Move here'
      return target.parent ? `Add as a stage of ${nameOf(holder)}` : `Add to ${nameOf(holder)}`
    }
    if (drop.groupId) return drop.groupId === from ? 'Move here' : `Add to ${nameOf(drop.groupId)}`
    return from ? `Take out of ${nameOf(from)}` : 'Move here'
  })
</script>

<svelte:head>
  <title>Accountability</title>
</svelte:head>

{#snippet trackerCard(card: Card)}
  {@const ids = idsOf(card)}
  <TrackerCard
    {card}
    entries={entries.filter((e) => ids.includes(e.trackerId))}
    {now}
    menu={trackerMenu}
    {renaming}
    {rename}
    {log}
    slip={logSlip}
    {mark}
    dragging={drag.subject}
  />
{/snippet}

<main>
  <div class="top">
    <h1>Accountability</h1>
    <ThemePicker />
  </div>

  {#await loading then}
    {#if trackers.length > 0}
      <section class="card">
        <h2>Activity</h2>
        <ActivityGrid {cards} {entries} {now} />
      </section>
    {/if}

    <!-- data-dropping says what letting go now would do, for the card in hand (see .lifted in app.css). -->
    <div class="board" data-dropping={drag.drop?.type === 'stay' ? undefined : drag.drop?.type} {@attach drag.attach}>
      {#each items as item (lead(item).id)}
        {#if item.type === 'group'}
          <GroupBox
            group={item.group}
            cards={item.cards}
            {entries}
            {now}
            menu={groupMenu(item.group)}
            {renaming}
            {rename}
            toggle={() => toggle(item.group)}
            {mark}
            dragging={drag.subject}
          >
            {#each item.cards as card (card.tracker.id)}
              {@render trackerCard(card)}
            {/each}
          </GroupBox>
        {:else}
          {@render trackerCard(item.card)}
        {/if}
      {/each}
    </div>

    {#if trackers.length > 1}
      <p class="hint">Hold and drag a card against another to group them, or onto the middle of a habit to make stages.</p>
    {/if}

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

{#if dropLabel}
  <div class="drop-label" style:left="{drag.pointer.x}px" style:top="{drag.pointer.y}px">{dropLabel}</div>
{/if}

<ConfirmDialog bind:this={confirmDialog} />
<ChoiceDialog bind:this={choiceDialog} />

<style>
  main {
    max-width: 56rem;
    margin: 0 auto;
    padding: 1.25rem 1rem 3rem;
  }

  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin: 0.5rem 0 1rem;
  }

  h1 {
    margin: 0;
    font-size: 1.9rem;
    letter-spacing: -0.01em;
  }

  h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .hint {
    margin: 0.5rem 0 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
  }

  /* Follows the pointer, above the finger on a phone. */
  .drop-label {
    position: fixed;
    z-index: 3;
    translate: -50% calc(-100% - 2.25rem);
    padding: 0.35rem 0.65rem;
    border-radius: 0.375rem;
    background: var(--ink);
    color: var(--surface);
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
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
