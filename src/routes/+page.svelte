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
  import {
    apply,
    applyHiding,
    clearAttempts,
    deleteVault,
    listEntries,
    listGroups,
    listTrackers,
    loadAttempts,
    loadVault,
    replaceAll,
    saveAttempts,
    saveEntry,
    saveGroup,
    saveTracker,
    saveVault,
    type Vault,
  } from '#lib/db.ts'
  import { Drag } from '#lib/drag.svelte.ts'
  import GroupBox from '#lib/GroupBox.svelte'
  import { hide, unhide, waitAfter, waitText, type Moved } from '#lib/hidden.ts'
  import type { MenuItem } from '#lib/Menu.svelte'
  import { EMPTY, type Change, type DeviceData, type Entry, type Group, type Snapshot, type Tracker } from '#lib/model.ts'
  import PinDialog from '#lib/PinDialog.svelte'
  import { keyFor, newSalt, seal, unseal, type Bytes } from '#lib/seal.ts'
  import ThemePicker from '#lib/ThemePicker.svelte'
  import TrackerCard, { type Mark } from '#lib/TrackerCard.svelte'
  import Transfer from '#lib/Transfer.svelte'
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
  let pinDialog: ReturnType<typeof PinDialog>
  // The hidden trackers while they're unlocked: their data, and the key that seals each change.
  // Raw state, replaced whole on every change, since its records go straight into encryption.
  let vault = $state.raw<{ key: CryptoKey; salt: Bytes; data: Snapshot }>()
  // Whether this device keeps hidden trackers at all, locked or not.
  let hasVault = $state(false)
  // The new-tracker form: open while there are no trackers, so the first step is obvious, and
  // closed after adding one, so the new card is in view.
  let formOpen = $state(false)

  const items = $derived(arrange(trackers, groups))
  // Every card in page order, grouped or not.
  const cards = $derived(items.flatMap((item) => (item.type === 'group' ? item.cards : [item.card])))
  // The hidden cards, while unlocked. They never belong to a group.
  const hiddenCards = $derived(vault ? arrange(vault.data.trackers, []).flatMap((item) => (item.type === 'card' ? [item.card] : [])) : [])
  // The activity grid shows hidden trackers too, but only while they're unlocked.
  const gridCards = $derived([...cards, ...hiddenCards])
  const gridEntries = $derived(vault ? [...entries, ...vault.data.entries] : entries)

  const loading = Promise.all([listTrackers(), listGroups(), listEntries(), loadVault()]).then(
    ([savedTrackers, savedGroups, savedEntries, savedVault]) => {
      trackers = savedTrackers
      groups = savedGroups
      entries = savedEntries
      hasVault = savedVault !== undefined
      formOpen = trackers.length === 0
    },
  )

  // Hidden trackers lock again whenever the page is out of sight: another tab, another app, or a
  // closed laptop.
  $effect(() => {
    const lockWhenHidden = () => {
      if (document.hidden) vault = undefined
    }
    document.addEventListener('visibilitychange', lockWhenHidden)
    return () => document.removeEventListener('visibilitychange', lockWhenHidden)
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
    const at = Date.now()
    const base = { id: crypto.randomUUID(), name: name.trim(), createdAt: at, updatedAt: at, order: nextOrder(trackers, groups) }
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
    if (isHidden(entry.trackerId)) {
      await sealHidden({ ...vault!.data, entries: [...vault!.data.entries, entry] }, saveVault)
    } else {
      await saveEntry(entry)
      entries.push(entry)
    }
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

  // Whether a tracker is one of the hidden ones, which only the unlocked vault knows about.
  function isHidden(id: string): boolean {
    return vault?.data.trackers.some((t) => t.id === id) ?? false
  }

  // Hidden trackers' saves run one after another, each sealing the data as it was when the change
  // was made, so quick changes in a row all land. The state changes first, at once.
  let sealing = Promise.resolve()

  function sealHidden(data: Snapshot, write: (sealed: Vault) => Promise<void>): Promise<void> {
    const { key, salt } = vault!
    vault = { key, salt, data }
    const saved = sealing.then(async () => write({ salt, ...(await seal(key, data)) }))
    // A failed save still reaches its caller, but doesn't stop the saves after it.
    sealing = saved.catch(() => undefined)
    return saved
  }

  // Saves a change to the hidden trackers, as the arrangement functions describe one.
  function changeHidden(change: Change): Promise<void> {
    const { trackers: hidden, entries: logged } = vault!.data
    return sealHidden(
      {
        trackers: withChange(hidden, change.putTrackers, change.deleteTrackerIds),
        groups: [],
        entries: logged.filter((e) => !change.deleteTrackerIds.includes(e.trackerId)),
      },
      saveVault,
    )
  }

  // Opens the hidden trackers, asking for the PIN, or for a new one when nothing has been hidden on
  // this device yet. `why` is a sentence saying what it's for. Resolves to whether they're open.
  async function openHidden(title: string, confirmLabel: string, why = ''): Promise<boolean> {
    if (vault) return true
    const saved = await loadVault()
    if (!saved) {
      const answer = await pinDialog.ask({
        mode: 'new',
        title,
        confirmLabel,
        message: `${why}Pick a 4-digit PIN you'll remember. Hidden trackers are encrypted on this device with it, and only show once it's typed. It can't be recovered: if it's forgotten, they're lost.`,
        submit: async (pin) => {
          const salt = newSalt()
          const key = await keyFor(pin, salt)
          await saveVault({ salt, ...(await seal(key, EMPTY)) })
          vault = { key, salt, data: EMPTY }
          hasVault = true
          return undefined
        },
      })
      return answer === 'done'
    }
    const answer = await pinDialog.ask({
      mode: 'existing',
      title,
      confirmLabel,
      message: `${why}Type your PIN.`,
      submit: async (pin) => {
        // After a few wrong PINs, each try has to wait, even across reloads.
        const attempts = await loadAttempts()
        const wait = attempts.waitUntil - Date.now()
        if (wait > 0) return `Too many wrong PINs. Try again in ${waitText(wait)}.`
        const key = await keyFor(pin, saved.salt)
        try {
          vault = { key, salt: saved.salt, data: await unseal<Snapshot>(key, saved) }
        } catch {
          const failures = attempts.failures + 1
          const next = waitAfter(failures)
          await saveAttempts({ failures, waitUntil: Date.now() + next })
          return next > 0 ? `Too many wrong PINs. Try again in ${waitText(next)}.` : "That PIN isn't right."
        }
        await clearAttempts()
        return undefined
      },
    })
    if (answer === 'forgot') await forgetHidden()
    return answer === 'done'
  }

  async function forgetHidden() {
    const confirmed = await confirmDialog.ask({
      title: 'Delete your hidden trackers?',
      message: "Without the PIN they can't be opened. This deletes them and everything logged for them, so you can set a new PIN. It can't be undone.",
      confirmLabel: 'Delete hidden trackers',
      danger: true,
    })
    if (!confirmed) return
    await deleteVault()
    vault = undefined
    hasVault = false
  }

  function toggleHidden() {
    if (vault) vault = undefined
    else openHidden('Hidden trackers', hasVault ? 'Unlock' : 'Set PIN')
  }

  // Moves a card between what's shown and the hidden trackers: both change on the page at once,
  // and they're saved together.
  function moveSides(moved: Moved): Promise<void> {
    trackers = moved.shown.trackers
    groups = moved.shown.groups
    entries = moved.shown.entries
    return sealHidden(moved.hidden, (sealed) => applyHiding(moved.change, moved.entries, sealed))
  }

  async function hideTracker(tracker: Tracker) {
    const wasLocked = vault === undefined
    if (!(await openHidden(`Hide ${tracker.name}`, 'Hide', hasVault ? `${tracker.name} joins your hidden trackers. ` : ''))) return
    await moveSides(hide($state.snapshot({ trackers, groups, entries }), vault!.data, tracker.id, Date.now()))
    // Opened just to take this one in, the hidden trackers close again, so it's out of sight.
    if (wasLocked) vault = undefined
  }

  function unhideTracker(tracker: Tracker) {
    return moveSides(unhide($state.snapshot({ trackers, groups, entries }), vault!.data, tracker.id, Date.now()))
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
    const tracker = [...trackers, ...(vault?.data.trackers ?? [])].find((t) => t.id === id)
    if (newName === undefined || newName === (group ?? tracker)?.name) return
    if (isHidden(id)) {
      const data = vault!.data
      await sealHidden(
        { ...data, trackers: data.trackers.map((t) => (t.id === id ? { ...t, name: newName, updatedAt: Date.now() } : t)) },
        saveVault,
      )
    } else if (group) {
      await updateGroup({ ...$state.snapshot(group), name: newName, updatedAt: Date.now() })
    } else if (tracker) {
      const renamed = { ...$state.snapshot(tracker), name: newName, updatedAt: Date.now() }
      await saveTracker(renamed)
      trackers = trackers.map((t) => (t.id === id ? renamed : t))
    }
  }

  async function updateGroup(next: Group) {
    await saveGroup(next)
    groups = groups.map((g) => (g.id === next.id ? next : g))
  }

  function toggle(group: Group) {
    return updateGroup({ ...$state.snapshot(group), collapsed: !group.collapsed, updatedAt: Date.now() })
  }

  // Exports and imports include the hidden trackers, so they need unlocking first, or a PIN set when
  // an import brings hidden trackers to a device that has none. Resolves to whether to go on.
  function readyHidden(incoming: boolean): Promise<boolean> {
    if (vault || (!hasVault && !incoming)) return Promise.resolve(true)
    return openHidden('Hidden trackers', hasVault ? 'Unlock' : 'Set PIN', hasVault ? 'Moving data includes your hidden trackers. ' : 'The file has hidden trackers. ')
  }

  // Everything on this device, for exporting, once `readyHidden` has said yes.
  function current(): DeviceData {
    return { shown: $state.snapshot({ trackers, groups, entries }), hidden: vault?.data ?? EMPTY }
  }

  // An import replaces what's here with the merged result the user reviewed.
  async function importData(next: DeviceData) {
    trackers = next.shown.trackers
    groups = next.shown.groups
    entries = next.shown.entries
    if (vault) await sealHidden(next.hidden, (sealed) => replaceAll(next.shown, sealed))
    else await replaceAll(next.shown, undefined)
    now = Date.now()
    formOpen = trackers.length === 0
  }

  async function removeTracker(tracker: Tracker) {
    const hidden = isHidden(tracker.id)
    const stages = (hidden ? vault!.data.trackers : trackers).filter((t) => t.parent?.id === tracker.id).length
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
    if (hidden) {
      await changeHidden(remove(vault!.data.trackers, [], tracker.id, Date.now()))
      return
    }
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
    if (!confirmed) return
    if (isHidden(tracker.id)) await changeHidden(dissolve(vault!.data.trackers, [], tracker.id, Date.now()))
    else await save(dissolve(trackers, groups, tracker.id, Date.now()))
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
    if (isHidden(tracker.id)) return hiddenMenu(tracker)
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
      menu.push({ label: 'Hide', run: () => hideTracker(tracker) })
    }
    menu.push({ label: 'Delete', critical: true, run: () => removeTracker(tracker) })
    return menu
  }

  // A hidden card can't join groups or other cards; it can be renamed, rearranged among its
  // stages, brought back, or deleted.
  function hiddenMenu(tracker: Tracker): MenuItem[] {
    const hidden = vault!.data.trackers
    const menu: MenuItem[] = [{ label: 'Rename', run: () => (renaming = tracker.id) }]
    const parent = hidden.find((t) => t.id === tracker.parent?.id)
    if (parent) {
      const out = () => changeHidden(move(hidden, [], tracker.id, after(hidden, [], parent.id), Date.now()).change)
      menu.push({ label: `Take out of ${parent.name}`, run: out })
    } else {
      if (tracker.kind === 'staged') menu.push({ label: 'Separate stages', run: () => separate(tracker) })
      menu.push({ label: 'Unhide', run: () => unhideTracker(tracker) })
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

{#snippet trackerCard(card: Card, logged: Entry[], movable: boolean)}
  {@const ids = idsOf(card)}
  <TrackerCard
    {card}
    entries={logged.filter((e) => ids.includes(e.trackerId))}
    {now}
    menu={trackerMenu}
    {renaming}
    {rename}
    {log}
    slip={logSlip}
    {mark}
    dragging={drag.subject}
    {movable}
  />
{/snippet}

<main>
  <div class="top">
    <h1>Accountability</h1>
    <div class="controls">
      <!-- Always here, so it gives nothing away about whether anything is hidden. -->
      <button
        class="icon"
        onclick={toggleHidden}
        aria-label={vault ? 'Lock hidden trackers' : 'Show hidden trackers'}
        title={vault ? 'Lock hidden trackers' : 'Hidden trackers'}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d={vault ? 'M8 11V7a4 4 0 0 1 7.75-1.4' : 'M8 11V7a4 4 0 0 1 8 0v4'} />
        </svg>
      </button>
      <ThemePicker />
    </div>
  </div>

  {#await loading then}
    {#if gridCards.length > 0}
      <section class="card">
        <h2>Activity</h2>
        <ActivityGrid cards={gridCards} entries={gridEntries} {now} />
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
              {@render trackerCard(card, entries, true)}
            {/each}
          </GroupBox>
        {:else}
          {@render trackerCard(item.card, entries, true)}
        {/if}
      {/each}
    </div>

    {#if trackers.length > 1}
      <p class="hint">Hold and drag a card against another to group them, or onto the middle of a habit to make stages.</p>
    {/if}

    {#if vault}
      {@const logged = vault.data.entries}
      <section class="hidden-trackers" aria-labelledby="hidden-title">
        <header>
          <h2 id="hidden-title">Hidden</h2>
          <button onclick={() => (vault = undefined)}>Lock</button>
        </header>
        <p>Only you can see these. They're encrypted on this device and lock again when you leave the app.</p>
        {#each hiddenCards as card (card.tracker.id)}
          {@render trackerCard(card, logged, false)}
        {:else}
          <p>Nothing is hidden yet. Choose Hide in a tracker's ⋯ menu.</p>
        {/each}
      </section>
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

    <Transfer {current} ready={readyHidden} onimport={importData} empty={trackers.length === 0 && !hasVault} />
  {:catch error}
    <p role="alert">Couldn't open your saved data: {error.message}</p>
  {/await}
</main>

{#if dropLabel}
  <div class="drop-label" style:left="{drag.pointer.x}px" style:top="{drag.pointer.y}px">{dropLabel}</div>
{/if}

<ConfirmDialog bind:this={confirmDialog} />
<ChoiceDialog bind:this={choiceDialog} />
<PinDialog bind:this={pinDialog} />

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

  .controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .controls svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* A tray like a group's, set apart by a dashed edge as the one that locks. */
  .hidden-trackers {
    margin-block: 0.875rem;
    padding: 0.6rem 0.75rem 0.1rem;
    border: 1px dashed var(--border-strong);
    border-radius: 1.1rem;
    background: color-mix(in srgb, var(--ink) 3%, var(--page));
  }

  .hidden-trackers header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .hidden-trackers > p {
    margin: 0.25rem 0 0.75rem;
    color: var(--ink-secondary);
    font-size: 0.85rem;
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

  .type legend {
    padding: 0;
    color: var(--ink-secondary);
    font-size: 0.85rem;
    font-weight: 600;
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
