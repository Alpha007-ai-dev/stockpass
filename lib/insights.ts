const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type CurvePoint = { size_usd: number; entry_bps: number; exit_bps: number | null; samples: number }
export type SizeCurve = { symbol: string; market_state: string; window_days: number; points: CurvePoint[] }

export async function getSizeCurve(symbol: string, state: string): Promise<SizeCurve | null> {
  try {
    const res = await fetch(
      `${BASE}/size-curve?symbol=${encodeURIComponent(symbol)}&state=${encodeURIComponent(state)}`,
    )
    if (!res.ok) return null
    return (await res.json()) as SizeCurve
  } catch {
    return null
  }
}

export type MultiplierChange = {
  symbol: string
  from: number
  to: number
  effective_ts: number
  status: 'upcoming' | 'recent'
}

let cache: { at: number; changes: MultiplierChange[] } | null = null

export async function getMultiplierChanges(): Promise<MultiplierChange[]> {
  if (cache && Date.now() - cache.at < 10 * 60 * 1000) return cache.changes
  try {
    const res = await fetch(`${BASE}/multiplier-changes`)
    if (!res.ok) return cache?.changes ?? []
    const json: any = await res.json()
    const changes = Array.isArray(json?.changes) ? (json.changes as MultiplierChange[]) : []
    cache = { at: Date.now(), changes }
    return changes
  } catch {
    return cache?.changes ?? []
  }
}

export function describeChange(c: MultiplierChange): string {
  const date = new Date(c.effective_ts * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const pct = (c.to / c.from - 1) * 100
  const p = `${pct >= 0 ? '+' : ''}${Math.abs(pct) >= 10 ? pct.toFixed(0) : pct.toFixed(2)}%`
  return `${c.status === 'upcoming' ? 'Share multiplier changes on' : 'Share multiplier changed on'} ${date}: 1 token = ${c.from.toFixed(4)} → ${c.to.toFixed(4)} shares (${p}).`
}
