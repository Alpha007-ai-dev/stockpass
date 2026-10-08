// What the collector's /explain-anomaly returns. The evidence is computed by the Worker from its
// measurements; the optional explanation is written by Claude and validated there before it is sent.
const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type Anomaly = {
  anomaly: true
  symbol: string
  direction: 'above' | 'below'
  evidence: {
    current_entry_bps: number
    typical_low_bps: number
    typical_high_bps: number
    observations: number
    market_state: string
    availability_pct: number
    next_earnings: string | null
  }
  explanation: string | null
  explanation_status: 'ok' | 'unavailable'
}

/** The anomaly for a token, or null when it is inside its usual range or the data is not enough. */
export async function getAnomaly(symbol: string): Promise<Anomaly | null> {
  const res = await fetch(`${BASE}/explain-anomaly?symbol=${encodeURIComponent(symbol)}`)
  if (!res.ok) return null
  const j = await res.json()
  return j?.anomaly === true ? (j as Anomaly) : null
}
