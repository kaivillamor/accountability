/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatQuantity, unitFor } from './text.ts'

test('units stay as typed for any amount but exactly 1', () => {
  assert.equal(formatQuantity(2.5, 'cups'), '2.5 cups')
  assert.equal(formatQuantity(0.5, 'cups'), '0.5 cups')
  assert.equal(formatQuantity(0, 'cups'), '0 cups')
})

test('exactly 1 drops a regular plural ending', () => {
  const cases: Record<string, string> = {
    cups: 'cup',
    minutes: 'minute',
    glasses: 'glass',
    boxes: 'box',
    inches: 'inch',
    dishes: 'dish',
    headaches: 'headache',
    beaches: 'beach',
    lbs: 'lb',
    hrs: 'hr',
    calories: 'calorie',
    euros: 'euro',
    doses: 'dose',
  }
  for (const [typed, one] of Object.entries(cases)) assert.equal(unitFor(1, typed), one, typed)
})

test('exactly 1 leaves abbreviations, symbols and singular words alone', () => {
  for (const unit of ['km', 'ml', 'g', 'oz', 'fl oz', 'kWh', '$', 'gas', 'status', 'glass']) {
    assert.equal(unitFor(1, unit), unit, unit)
  }
})

test('large amounts are grouped, then compacted', () => {
  assert.equal(formatQuantity(1284, 'steps'), '1,284 steps')
  assert.equal(formatQuantity(12_900, 'steps'), '12.9K steps')
})
