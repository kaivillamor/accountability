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

// An amount with the unit the user typed for the tracker, like "2.5 cups" or "1 cup".
export function formatQuantity(amount: number, unit: string): string {
  return `${formatAmount(amount)} ${unitFor(amount, unit)}`
}

// Units are typed in plural ("cups", "minutes"), which reads right for every amount but 1.
export function unitFor(amount: number, unit: string): string {
  return amount === 1 ? singular(unit) : unit
}

// Drops a regular English plural ending. Abbreviations and symbols ("km", "$") have none, so
// they stay as typed. Words like "cherries" come out as "cherrie"; that's the accepted miss.
function singular(unit: string): string {
  if (/[^e]aches$/i.test(unit)) return unit.slice(0, -1) // headaches → headache (beaches is below)
  if (/(ss|x|ch|sh)es$/i.test(unit)) return unit.slice(0, -2) // glasses, boxes, inches, dishes
  if (/[a-z][^\Wsiua]s$/i.test(unit)) return unit.slice(0, -1) // cups, minutes, lbs, calories
  return unit
}
