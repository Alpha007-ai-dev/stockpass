const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

export type Latest = {
  symbol: string
  buy_px: number | null
  sell_px: number | null
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

export type Reference = {
  ticker: string
  bid: number
  ask: number
  mid: number
  market_state: string
  stale: number
  ts: number
}

export type Stats = { latest: Latest[]; history: History[]; reference?: Reference[] }

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

export type TokenRow = {
  ticker: string
  symbol: string
  issuer: string
  mint: string
  decimals: number
  icon?: string | null
  name?: string | null
}

let tokenCache: TokenRow[] | null = null

export async function getTokens(): Promise<TokenRow[]> {
  if (tokenCache) return tokenCache
  const res = await fetch(`${BASE}/tokens?v=${Math.floor(Date.now() / 600000)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  tokenCache = Array.isArray(data) ? (data as TokenRow[]) : []
  return tokenCache
}

export type HoldingRow = {
  ticker: string
  symbol: string
  issuer: string
  mint: string
  decimals: number
  walletAmount: number
}

export async function getHoldings(owner: string): Promise<HoldingRow[]> {
  const res = await fetch(`${BASE}/holdings?owner=${owner}`)
  const json = await res.json()
  if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`)
  return json as HoldingRow[]
}


export type SeriesPoint = {
  ts: number
  symbol: string
  issuer: string
  entry_bps: number | null
  exit_bps: number | null
  buy_px: number | null
  quotable: number
  market_state: string
}

export async function getSeries(ticker: string, hours = 24): Promise<SeriesPoint[]> {
  const res = await fetch(`${BASE}/series?ticker=${ticker}&hours=${hours}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export type Collateral = {
  symbol: string
  mint: string
  market: string
  maxLtv: number
  borrowApy: number
  supplyApy: number
  marketUsd: number
}

let collCache: Collateral[] | null = null

export async function getCollateral(): Promise<Collateral[]> {
  if (collCache) return collCache
  const res = await fetch(`${BASE}/collateral`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  collCache = (await res.json()) as Collateral[]
  return collCache
}






