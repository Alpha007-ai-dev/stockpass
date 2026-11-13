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

const round1 = (x: number) => Math.round(x * 10) / 10
const has = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v)

type CostRow = {
  entry_bps: number | null
  exit_bps: number | null
  quotable: number
  round_trip_bps?: number | null
  fee_bps?: number | null
  entry_ref_bps?: number | null
  ref_src?: string | null
}

/** Buy then sell back. Older collector versions only send entry/exit (half each), so fall back to their sum. */
export function roundTripBps(r: CostRow | null | undefined): number | null {
  if (!r || !r.quotable) return null
  if (has(r.round_trip_bps)) return round1(r.round_trip_bps)
  return has(r.entry_bps) && has(r.exit_bps) ? r.entry_bps + r.exit_bps : null
}

/**
 * The cost of buying now, measured the same way the server measures alerts: the buy price against a live
 * Wall Street quote when the collector had one (so a premium counts too), otherwise half the round trip.
 * A perp reference is not used here: it can lag the stock by minutes, which on volatile names is 1%+.
 */
export function entryCost(r: CostRow | null | undefined): { bps: number; basis: 'reference' | 'half_round_trip' } | null {
  const rt = roundTripBps(r)
  if (!r || rt === null || rt / 2 >= NO_MARKET_BPS) return null
  if (r.ref_src === 'alpaca' && has(r.entry_ref_bps)) return { bps: round1(Math.max(0, r.entry_ref_bps)), basis: 'reference' }
  return { bps: round1(Math.max(0, rt / 2)), basis: 'half_round_trip' }
}

export function bpsValue(bps: number | null | undefined): number {
  return bps === null || bps === undefined ? 0 : Math.max(0, bps)
}
