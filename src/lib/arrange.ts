import type { Change, Group, Tracker } from './model.ts'

// A tracker as the page shows it, with its stages when it's a staged habit.
export type Card = { tracker: Tracker; stages: Tracker[] }

// The page's list from top to bottom: groups with their cards, and cards on their own.
export type Item = { type: 'group'; group: Group; cards: Card[] } | { type: 'card'; card: Card }

// Where a tracker or group moves to. Groups only move within the top level.
export type Destination =
  // Next to a tracker: in its group, or among its staged habit's stages. Next to a tracker on
  // its own, the two form a new group.
  | { type: 'beside'; id: string; after: boolean }
  // Into a staged habit as its last stage. Into a habit on its own, the habit becomes a staged
  // habit in the same place, with the old habit as its first stage.
  | { type: 'into'; id: string }
  // A position at the top level, or in a group when `groupId` is set. Without an index, the end.
  | { type: 'list'; groupId?: string; index?: number }

export type Moved = {
  change: Change
  // The group or staged habit the move created, which the page asks the user to name.
  created?: string
}

type Ordered = { order: number; createdAt: number }

// By position. Two records only share a position after merging two devices' data, and then the
// older one comes first.
const byOrder = (a: Ordered, b: Ordered) => a.order - b.order || a.createdAt - b.createdAt

export function arrange(trackers: Tracker[], groups: Group[]): Item[] {
  const cardOf = (tracker: Tracker): Card => ({
    tracker,
    stages: trackers.filter((t) => t.parent?.id === tracker.id).toSorted(byOrder),
  })
  const cardsIn = (groupId: string | undefined) =>
    trackers
      .filter((t) => !t.parent && t.groupId === groupId)
      .toSorted(byOrder)
      .map(cardOf)
  const items: Item[] = [
    ...groups.map((group) => ({ type: 'group' as const, group, cards: cardsIn(group.id) })),
    ...cardsIn(undefined).map((card) => ({ type: 'card' as const, card })),
  ]
  return items.toSorted((a, b) => byOrder(lead(a), lead(b)))
}

// The group or tracker an item stands for.
export function lead(item: Item): Group | Tracker {
  return item.type === 'group' ? item.group : item.card.tracker
}

// The ids of a card's tracker and its stages, which are what entries are logged against.
export function idsOf(card: Card): string[] {
  return [card.tracker.id, ...card.stages.map((stage) => stage.id)]
}

// The records after a change: puts replace or add, deletes remove.
export function withChange<T extends { id: string }>(records: T[], puts: T[], deletes: string[]): T[] {
  return [...records.filter((r) => !deletes.includes(r.id) && !puts.some((p) => p.id === r.id)), ...puts]
}

// The arrangement as ids in order, one list per place: the top level, each group and each
// staged habit's stages. Every action edits these lists, then `changes` writes them back.
type Lists = Map<string, string[]>

// The top level's key. Groups and staged habits are keyed by their own ids.
const TOP = 'top'

function listsOf(trackers: Tracker[], groups: Group[]): Lists {
  const lists: Lists = new Map([[TOP, []]])
  for (const group of groups) lists.set(group.id, [])
  for (const tracker of trackers) if (tracker.kind === 'staged') lists.set(tracker.id, [])
  const placed = [
    ...groups.map((g) => ({ id: g.id, order: g.order, createdAt: g.createdAt, list: TOP })),
    ...trackers.map((t) => ({ id: t.id, order: t.order, createdAt: t.createdAt, list: t.parent?.id ?? t.groupId ?? TOP })),
  ]
  for (const { id, list } of placed.toSorted(byOrder)) lists.get(list)!.push(id)
  return lists
}

// The key of the list holding an id.
function holderOf(lists: Lists, id: string): string {
  return [...lists].find(([, ids]) => ids.includes(id))![0]
}

function take(lists: Lists, id: string): void {
  const list = lists.get(holderOf(lists, id))!
  list.splice(list.indexOf(id), 1)
}

// Puts `ids` where `id` is now, in the list that holds it.
function replace(lists: Lists, id: string, ...ids: string[]): void {
  const list = lists.get(holderOf(lists, id))!
  list.splice(list.indexOf(id), 1, ...ids)
}

type Added = { trackers: Tracker[]; groups: Group[] }

export function move(trackers: Tracker[], groups: Group[], id: string, to: Destination, now: number): Moved {
  const lists = listsOf(trackers, groups)
  const added: Added = { trackers: [], groups: [] }
  take(lists, id)

  if (to.type === 'list') {
    const list = lists.get(to.groupId ?? TOP)!
    list.splice(to.index ?? list.length, 0, id)
  } else if (to.type === 'beside') {
    const holder = holderOf(lists, to.id)
    if (holder === TOP) {
      const group: Group = { id: crypto.randomUUID(), name: 'New group', createdAt: now, updatedAt: now, order: 0, collapsed: false }
      replace(lists, to.id, group.id)
      lists.set(group.id, to.after ? [to.id, id] : [id, to.id])
      added.groups.push(group)
    } else {
      const list = lists.get(holder)!
      list.splice(list.indexOf(to.id) + (to.after ? 1 : 0), 0, id)
    }
  } else {
    const target = trackers.find((t) => t.id === to.id)!
    if (target.kind === 'staged') {
      lists.get(target.id)!.push(id)
    } else {
      const moving = trackers.find((t) => t.id === id)!
      const staged: Tracker = {
        id: crypto.randomUUID(),
        name: `${target.name} + ${moving.name}`,
        createdAt: now,
        updatedAt: now,
        order: 0,
        kind: 'staged',
      }
      replace(lists, target.id, staged.id)
      lists.set(staged.id, [target.id, id])
      added.trackers.push(staged)
    }
  }
  return { change: changes(trackers, groups, lists, added, [], now), created: added.groups[0]?.id ?? added.trackers[0]?.id }
}

// Deletes a tracker, and a staged habit's stages with it.
export function remove(trackers: Tracker[], groups: Group[], id: string, now: number): Change {
  const lists = listsOf(trackers, groups)
  const stages = lists.get(id) ?? []
  lists.delete(id)
  take(lists, id)
  return changes(trackers, groups, lists, { trackers: [], groups: [] }, [id, ...stages], now)
}

// Breaks up a group or a staged habit: what was inside takes its place, in the same order.
export function dissolve(trackers: Tracker[], groups: Group[], id: string, now: number): Change {
  const lists = listsOf(trackers, groups)
  replace(lists, id, ...lists.get(id)!)
  lists.delete(id)
  return changes(trackers, groups, lists, { trackers: [], groups: [] }, [id], now)
}

// The spot right after a group, or after a tracker outside any staged habit, in the list that
// holds it. Taking something out of a group or staged habit puts it there.
export function after(trackers: Tracker[], groups: Group[], id: string): Destination {
  const lists = listsOf(trackers, groups)
  const holder = holderOf(lists, id)
  const index = lists.get(holder)!.indexOf(id) + 1
  return holder === TOP ? { type: 'list', index } : { type: 'list', groupId: holder, index }
}

// Makes an arrangement consistent after combining two devices' data, where each record is the
// newer of its two versions: a card whose group is gone goes to the top level, a stage whose
// multi-stage habit is gone becomes a habit of its own, empty groups and multi-stage habits are
// deleted, and every list is numbered again.
export function tidy(trackers: Tracker[], groups: Group[], now: number): { trackers: Tracker[]; groups: Group[] } {
  const groupIds = new Set(groups.map((g) => g.id))
  const stagedIds = new Set(trackers.filter((t) => t.kind === 'staged').map((t) => t.id))
  const fixed = trackers.map((tracker) => {
    const stage = tracker.kind === 'habit' && tracker.parent !== undefined && stagedIds.has(tracker.parent.id)
    const grouped = !stage && tracker.groupId !== undefined && groupIds.has(tracker.groupId)
    if (stage === (tracker.parent !== undefined) && grouped === (tracker.groupId !== undefined)) return tracker
    const next: Tracker = { ...tracker, updatedAt: now }
    if (!stage) delete next.parent
    if (!grouped) delete next.groupId
    return next
  })
  const change = changes(fixed, groups, listsOf(fixed, groups), { trackers: [], groups: [] }, [], now)
  return {
    trackers: withChange(fixed, change.putTrackers, change.deleteTrackerIds),
    groups: withChange(groups, change.putGroups, change.deleteGroupIds),
  }
}

// A new tracker goes last at the top level.
export function nextOrder(trackers: Tracker[], groups: Group[]): number {
  return listsOf(trackers, groups).get(TOP)!.length
}

// Turns the edited lists back into records, keeping only what changed. A group or staged habit
// left empty is deleted, since there's nothing in it to show.
function changes(trackers: Tracker[], groups: Group[], lists: Lists, added: Added, removed: string[], now: number): Change {
  const deleted = new Set(removed)
  // Deleting an empty staged habit can leave its group empty in turn.
  const empty = () => [...lists.keys()].find((key) => key !== TOP && lists.get(key)!.length === 0)
  for (let key = empty(); key !== undefined; key = empty()) {
    lists.delete(key)
    take(lists, key)
    deleted.add(key)
  }

  const allGroups = [...groups, ...added.groups]
  const change: Change = { putTrackers: [], deleteTrackerIds: [], putGroups: [], deleteGroupIds: [] }
  for (const group of allGroups) {
    if (deleted.has(group.id)) {
      change.deleteGroupIds.push(group.id)
      continue
    }
    const order = lists.get(TOP)!.indexOf(group.id)
    if (order !== group.order || added.groups.includes(group)) change.putGroups.push({ ...group, order, updatedAt: now })
  }
  for (const tracker of [...trackers, ...added.trackers]) {
    if (deleted.has(tracker.id)) {
      change.deleteTrackerIds.push(tracker.id)
      continue
    }
    const holder = holderOf(lists, tracker.id)
    const placed: Tracker = { ...tracker, order: lists.get(holder)!.indexOf(tracker.id) }
    delete placed.groupId
    delete placed.parent
    if (allGroups.some((g) => g.id === holder)) placed.groupId = holder
    // A stage keeps the time it joined while it stays in the same staged habit.
    else if (holder !== TOP) placed.parent = { id: holder, since: tracker.parent?.id === holder ? tracker.parent.since : now }
    const moved = placed.order !== tracker.order || placed.groupId !== tracker.groupId || placed.parent?.id !== tracker.parent?.id
    if (moved || added.trackers.includes(tracker)) change.putTrackers.push({ ...placed, updatedAt: now })
  }
  return change
}
