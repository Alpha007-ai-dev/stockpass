export const NO_MARKET_BPS = 200

export function costLabel(entryBps: number | null | undefined, quotable: number | boolean | undefined): string {
  if (!quotable || entryBps === null || entryBps === undefined) return 'no quote'
  if (entryBps < 0) return '~0 bps'
  if (entryBps >= NO_MARKET_BPS) return 'no real market'
  return `${entryBps} bps`
}

export function isUsable(entryBps: number | null | undefined, quotable: number | boolean | undefined): boolean {
  return !!quotable && entryBps !== null && entryBps !== undefined && entryBps < NO_MARKET_BPS
}


export function bpsLabel(bps: number | null | undefined, quotable?: number | boolean): string {
  if (quotable !== undefined && !quotable) return '—'
  if (bps === null || bps === undefined) return '—'
  return bps < 0 ? '~0 bps' : `${bps} bps`
}

export function bpsValue(bps: number | null | undefined): number {
  return bps === null || bps === undefined ? 0 : Math.max(0, bps)
}