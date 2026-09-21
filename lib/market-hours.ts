export type MarketState = 'open' | 'pre' | 'after' | 'closed'

function nthSunday(year: number, month: number, n: number): number {
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay()
  return 1 + ((7 - firstDow) % 7) + (n - 1) * 7
}

function nyOffsetHours(d: Date): number {
  const y = d.getUTCFullYear()
  const dstStart = Date.UTC(y, 2, nthSunday(y, 2, 2), 7)
  const dstEnd = Date.UTC(y, 10, nthSunday(y, 10, 1), 6)
  const t = d.getTime()
  return t >= dstStart && t < dstEnd ? -4 : -5
}

// US holidays not handled yet
export function getMarketState(now: Date = new Date()): MarketState {
  const ny = new Date(now.getTime() + nyOffsetHours(now) * 3600000)
  const dow = ny.getUTCDay()
  const mins = ny.getUTCHours() * 60 + ny.getUTCMinutes()
  if (dow === 0 || dow === 6) return 'closed'
  if (mins >= 570 && mins < 960) return 'open'
  if (mins >= 240 && mins < 570) return 'pre'
  if (mins >= 960 && mins < 1200) return 'after'
  return 'closed'
}

export const MARKET_LABEL: Record<MarketState, { title: string; subtitle: string }> = {
  open: { title: 'US MARKET OPEN', subtitle: 'Tokens and shares trading side by side' },
  pre: { title: 'PRE-MARKET', subtitle: 'Regular session closed - tokens still trading' },
  after: { title: 'AFTER-HOURS', subtitle: 'Regular session closed - tokens still trading' },
  closed: { title: 'US MARKET CLOSED', subtitle: 'Wall Street is closed - tokenized stocks are still moving' },
}
