/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findDrop, type Box, type Target } from './drop.ts'

// A column 400 wide. Cards are 160 tall with 14 between them, like the page.
const box = (top: number, height = 160, left = 0): Box => ({ left, right: left + 400, top, bottom: top + height })
// A dragged card 160 tall, centered at `y`.
const at = (y: number, left = 0): Box => box(y - 80, 160, left)
const card = (id: string, b: Box, extra: { into?: boolean; groupId?: string } = {}): Target => ({ type: 'card', id, box: b, into: extra.into ?? false, groupId: extra.groupId })
const FAR = box(5000)

test('a card dropped on its own spot stays', () => {
  assert.deepEqual(findDrop(at(1050), box(1000), [card('run', box(800))], []), { type: 'stay' })
})

test('the middle of a habit takes the dragged habit in as a stage', () => {
  assert.deepEqual(findDrop(at(280), FAR, [card('run', box(200), { into: true })], []), { type: 'into', id: 'run' })
})

test('the edges of a card put the dragged card beside it, before or after', () => {
  const targets = [card('run', box(200), { into: true })]
  assert.deepEqual(findDrop(at(215), FAR, targets, []), { type: 'beside', id: 'run', after: false })
  assert.deepEqual(findDrop(at(345), FAR, targets, []), { type: 'beside', id: 'run', after: true })
})

test('where a card can’t take stages, each half puts the dragged card beside it', () => {
  const targets = [card('water', box(200))]
  assert.deepEqual(findDrop(at(270), FAR, targets, []), { type: 'beside', id: 'water', after: false })
  assert.deepEqual(findDrop(at(290), FAR, targets, []), { type: 'beside', id: 'water', after: true })
})

test('a stage takes the dragged habit before or after it, ahead of the card around it', () => {
  const targets = [card('workout', box(0, 300), { into: true }), { type: 'stage' as const, id: 'squats', box: box(200, 44) }]
  assert.deepEqual(findDrop(at(230), FAR, targets, []), { type: 'beside', id: 'squats', after: true })
  assert.deepEqual(findDrop(at(210), FAR, targets, []), { type: 'beside', id: 'squats', after: false })
})

test('between the cards of a group, the dragged card joins the group at that spot', () => {
  const targets: Target[] = [
    { type: 'group', id: 'morning', box: box(0, 420) },
    card('run', box(60), { groupId: 'morning' }),
    card('read', box(234), { groupId: 'morning' }),
  ]
  assert.deepEqual(findDrop(at(227), FAR, targets, []), { type: 'list', groupId: 'morning', index: 1 })
  assert.deepEqual(findDrop(at(30), FAR, targets, []), { type: 'list', groupId: 'morning', index: 0 })
})

test('a collapsed group takes the dragged card last', () => {
  assert.deepEqual(findDrop(at(30), FAR, [{ type: 'group', id: 'morning', box: box(0, 60) }], []), { type: 'list', groupId: 'morning', index: undefined })
})

test('touching a lone card from above or below puts the dragged card beside it', () => {
  const targets = [card('run', box(400), { into: true })]
  // The dragged card's bottom edge 4 short of the card's top edge.
  assert.deepEqual(findDrop(box(236), FAR, targets, []), { type: 'beside', id: 'run', after: false })
  // Its top edge 10 below the card's bottom edge.
  assert.deepEqual(findDrop(box(570), FAR, targets, []), { type: 'beside', id: 'run', after: true })
})

test('touching a group’s box joins the group, first from above and last from below', () => {
  const targets: Target[] = [{ type: 'group', id: 'morning', box: box(400, 300) }, card('run', box(450), { groupId: 'morning' })]
  assert.deepEqual(findDrop(box(230), FAR, targets, []), { type: 'list', groupId: 'morning', index: 0 })
  assert.deepEqual(findDrop(box(710), FAR, targets, []), { type: 'list', groupId: 'morning', index: undefined })
})

test('of two cards in reach, the one it overlaps more wins', () => {
  const targets = [card('run', box(0)), card('read', box(174))]
  // A short dragged stage centered in the gap, overlapping read a little more than run.
  assert.deepEqual(findDrop(box(158, 20), FAR, targets, []), { type: 'beside', id: 'read', after: false })
})

test('a card off to the side touches nothing', () => {
  assert.deepEqual(findDrop(at(280, 420), FAR, [card('run', box(374))], [box(374)]), { type: 'list', index: 0 })
})

test('in open space, the dragged card goes to the top level at that height', () => {
  const top = [box(0), box(174), box(348)]
  assert.deepEqual(findDrop(at(1000), FAR, [], top), { type: 'list', index: 3 })
  assert.deepEqual(findDrop(at(-200), FAR, [], top), { type: 'list', index: 0 })
  assert.deepEqual(findDrop(at(300), FAR, [], top), { type: 'list', index: 2 })
})
