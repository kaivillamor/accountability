export function plural(n: number, word: string): string {
  return n === 1 ? word : `${word}s`
}

export function count(n: number, word: string): string {
  return `${formatAmount(n)} ${plural(n, word)}`
}

const fullFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

// Full figures with grouping below 10,000 (1,284), compact from there (12.9K). Rounding also
// keeps sums like 0.1 + 0.2 from showing as 0.30000000000000004.
export function formatAmount(amount: number): string {
  return amount < 10_000 ? fullFormat.format(amount) : compactFormat.format(amount)
}
