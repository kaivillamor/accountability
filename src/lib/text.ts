export function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

const amountFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// Keeps sums like 0.1 + 0.2 from showing as 0.30000000000000004.
export function formatAmount(amount: number): string {
  return amountFormat.format(amount)
}
