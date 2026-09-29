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

