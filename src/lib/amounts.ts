// Quick amounts: the buttons that log a usage tracker's usual amounts with one tap, set from its
// ⋯ menu. A few fit beside the typed box on a phone.
export const QUICK_AMOUNTS = 3

// The amounts typed into the boxes, ready to save: empty boxes are skipped, an amount typed twice
// counts once, and they're sorted small to large, the order the buttons show. Anything that isn't
// a positive number comes back as a message saying what to fix.
export function quickAmounts(typed: string[]): number[] | string {
  const amounts = typed.map((text) => text.trim()).filter((text) => text !== '').map(Number)
  if (amounts.some((amount) => !Number.isFinite(amount) || amount <= 0)) return 'Each amount has to be more than 0.'
  return [...new Set(amounts)].toSorted((a, b) => a - b)
}
