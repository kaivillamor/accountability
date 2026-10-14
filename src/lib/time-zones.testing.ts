/// <reference types="node" />
import assert from 'node:assert/strict'
import { before, describe } from 'node:test'

// This machine's own zone, plus zones that stress day boundaries: UTC, daylight saving in
// both hemispheres, a half-hour offset, and the extremes on either side of the date line.
const MACHINE_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone
const ZONES = new Set([
  MACHINE_ZONE,
  'UTC',
  'America/New_York',
  'Australia/Sydney',
  'Asia/Kolkata',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
])

// Registers the tests once per zone. Tests must create their dates inside the test body,
// because the zone only changes when that zone's tests start.
export function inEachTimeZone(defineTests: () => void): void {
  for (const zone of ZONES) {
    describe(zone === MACHINE_ZONE ? `${zone} (this machine)` : zone, () => {
      before(() => {
        process.env.TZ = zone
        // Compared by Intl's own name for the zone, which can differ (Asia/Kolkata reports as Asia/Calcutta).
        const expected = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone
        assert.equal(Intl.DateTimeFormat().resolvedOptions().timeZone, expected, 'the time zone switched')
      })
      defineTests()
    })
  }
}
