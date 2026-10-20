import type { Destination } from './arrange.ts'

// A rectangle in page coordinates.
export type Box = { left: number; right: number; top: number; bottom: number }

// What a dragged card can land on.
export type Target =
  // A tracker card, in a group or on its own. `into` says whether the dragged card can
  // become one of its stages.
  | { type: 'card'; id: string; box: Box; groupId?: string; into: boolean }
  // One stage of a staged habit.
  | { type: 'stage'; id: string; box: Box }
  // A group's whole box.
  | { type: 'group'; id: string; box: Box }

// Where a drag would land: a destination, or right back where it started.
export type Drop = Destination | { type: 'stay' }

// The bands along a card's top and bottom edges, at most this deep. Landing there puts the
// dragged card beside it; the middle takes it in as a stage.
const EDGE = 48
// Cards this close together count as touching. It spans the gap between two cards.
const TOUCH = 16

// Where `dragged` lands, judged by its center:
// - back on its own spot: it stays;
// - on a stage: beside that stage;
// - on a card: its middle takes it in as a stage when that's allowed, its edges put it beside;
// - inside a group's box but between cards: into that group at that spot;
// - touching a lone card or a group's box from above or below: beside or into it;
// - anywhere else: out at the top level, at that height. `top` holds the top level's items,
//   without the dragged one.
export function findDrop(dragged: Box, home: Box, targets: Target[], top: Box[]): Drop {
  const x = (dragged.left + dragged.right) / 2
  const y = (dragged.top + dragged.bottom) / 2
  const holds = (box: Box) => box.left <= x && x <= box.right && box.top <= y && y <= box.bottom
  // Whether a box's middle is above the center, so the drop goes after it.
  const above = (box: Box) => (box.top + box.bottom) / 2 < y

  const stage = targets.filter((t) => t.type === 'stage').find((t) => holds(t.box))
  if (stage) return { type: 'beside', id: stage.id, after: above(stage.box) }
  if (holds(home)) return { type: 'stay' }

  const cards = targets.filter((t) => t.type === 'card')
  const card = cards.find((t) => holds(t.box))
  if (card) {
    const edge = Math.min(EDGE, (card.box.bottom - card.box.top) / 4)
    const middle = card.box.top + edge < y && y < card.box.bottom - edge
    return card.into && middle ? { type: 'into', id: card.id } : { type: 'beside', id: card.id, after: above(card.box) }
  }

  const groups = targets.filter((t) => t.type === 'group')
  const group = groups.find((t) => holds(t.box))
  if (group) {
    const members = cards.filter((t) => t.groupId === group.id)
    // A collapsed group shows no cards, so the drop goes last.
    return { type: 'list', groupId: group.id, index: members.length > 0 ? members.filter((t) => above(t.box)).length : undefined }
  }

  // Cards inside a group are only reached from inside its box.
  let touching: { gap: number; drop: Drop } | undefined
  for (const target of [...cards.filter((t) => t.groupId === undefined), ...groups]) {
    const { box } = target
    if (dragged.right <= box.left || box.right <= dragged.left) continue
    const below = above(box)
    const gap = below ? dragged.top - box.bottom : box.top - dragged.bottom
    if (gap > TOUCH || (touching && touching.gap <= gap)) continue
    const drop: Drop =
      target.type === 'card'
        ? { type: 'beside', id: target.id, after: below }
        : { type: 'list', groupId: target.id, index: below ? undefined : 0 }
    touching = { gap, drop }
  }
  return touching?.drop ?? { type: 'list', index: top.filter(above).length }
}
