import { fetchT } from './http'

const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type FairVerdict = 'fair' | 'premium' | 'discount' | 'unknown'

export type FairToken = {
  symbol: string
  issuer: string
  verdict: FairVerdict
  measured_at?: number
  mid_px?: number
  /** Token mid per share against the stock's own price, trading cost excluded. */
  premium_bps?: number
  band?: { lo: number; hi: number }
  /** live: a reference existed at measurement time. estimated: compared with the last Wall Street quote. */
  basis?: 'live' | 'estimated'
  reference?: { px: number; src: 'alpaca' | 'perp' | 'last_close'; ts?: number; hours_since?: number }
  usual_premium_bps?: number | null
  /** "thin": one side of the market is thin, so there is no midpoint to judge; see the per-side fields. */
  reason?: string
  round_trip_bps?: number
  buy_vs_ref_bps?: number
  sell_vs_ref_bps?: number
}

/** The fair-price verdicts for every issuer token of one stock, or null if the collector cannot say. */
export async function getFair(ticker: string): Promise<FairToken[] | null> {
  const res = await fetchT(`${BASE}/fair?ticker=${encodeURIComponent(ticker)}`)
  if (!res.ok) return null
  const json: any = await res.json().catch(() => null)
  return Array.isArray(json?.tokens) ? (json.tokens as FairToken[]) : null
}
