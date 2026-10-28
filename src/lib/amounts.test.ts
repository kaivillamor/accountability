/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quickAmounts } from './amounts.ts'

test('quick amounts skip empty boxes and sort small to large', () => {
  assert.deepEqual(quickAmounts(['16', '', '8']), [8, 16])
  assert.deepEqual(quickAmounts([' 2.5 ', '', '']), [2.5])
})

test('an amount typed twice makes one button', () => {
  assert.deepEqual(quickAmounts(['8', '8', '16']), [8, 16])
})

test('all boxes empty means no buttons', () => {
  assert.deepEqual(quickAmounts(['', '', '']), [])
})

test('zero, negative and non-numbers are refused with a message', () => {
  for (const typed of [['0'], ['-4'], ['8', 'lots'], ['Infinity']]) {
    assert.equal(quickAmounts(typed), 'Each amount has to be more than 0.', typed.join())
  }
})
