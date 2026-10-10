// One place for dollar amounts, so tiny values never show as $0.00 or -$0.00.
export function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a > 0 && a < 0.005) return '<$0.01'
  return `${n < 0 ? '-' : ''}$${a.toFixed(2)}`
}
