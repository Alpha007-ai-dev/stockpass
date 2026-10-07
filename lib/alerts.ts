// Cost alerts live in the StockPass Worker, keyed by the wallet's public address.
// The app asks for their state when it is opened; there is no push notification.
const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type CostAlert = {
  symbol: string
  ticker: string
  threshold_bps: number
  current_bps: number | null
  measured_at: number | null
  triggered: boolean
}

export async function getAlerts(owner: string): Promise<CostAlert[]> {
  const res = await fetch(`${BASE}/alerts?owner=${encodeURIComponent(owner)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = await res.json()
  return (j?.alerts ?? []) as CostAlert[]
}

export async function setAlert(owner: string, symbol: string, thresholdBps: number): Promise<void> {
  const res = await fetch(`${BASE}/alerts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, symbol, threshold_bps: thresholdBps }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export async function removeAlert(owner: string, symbol: string): Promise<void> {
  const res = await fetch(`${BASE}/alerts?owner=${encodeURIComponent(owner)}&symbol=${encodeURIComponent(symbol)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}
