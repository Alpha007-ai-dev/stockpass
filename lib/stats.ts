const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type Latest = {
  symbol: string
  entry_bps: number
  exit_bps: number
  quotable: number
  multiplier: number
  supply: number
  ts: number
  market_state: string
}

export type History = {
  symbol: string
  issuer: string
  ticker: string
  market_state: string
  samples: number
  avg_entry: number
  min_entry: number
  max_entry: number
  availability: number
}

export type Stats = { latest: Latest[]; history: History[] }

export async function getStats(): Promise<Stats> {
  const res = await fetch(`${BASE}/stats`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`
  return n.toFixed(0)
}
