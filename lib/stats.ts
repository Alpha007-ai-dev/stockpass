import { fetchT } from './http'

const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev'

// A Cloudflare error page is HTML: say the server is unavailable instead of a JSON parse error.
async function readJson(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    throw new Error(res.ok ? 'Server returned unreadable data' : 'Server unavailable, try again shortly')
  }
}

export type Latest = {
  symbol: string
  ticker: string
  issuer: string
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
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${BASE}/stats`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return (await res.json()) as Stats
    } catch (e) {
      lastError = e
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Network request failed')
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
  icon?: string | null
  name?: string | null
}

export async function getHoldings(owner: string): Promise<HoldingRow[]> {
  const res = await fetchT(`${BASE}/holdings?owner=${owner}`)
  const json: any = await readJson(res)
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  return Array.isArray(json) ? (json as HoldingRow[]) : ((json?.holdings ?? []) as HoldingRow[])
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
  /** Cheapest stablecoin borrow rate in this market, which is what a holder of this collateral pays. */
  borrowApy: number
  debtSymbol?: string
  debt?: { symbol: string; borrowApy: number }[]
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

export async function getBalances(owner: string): Promise<{ usdc: number; skr: number }> {
  const res = await fetchT(`${BASE}/holdings?owner=${owner}`)
  const json: any = await readJson(res)
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
  if (!json || Array.isArray(json) || typeof json.usdc !== 'number') throw new Error('Balance data unavailable')
  return { usdc: json.usdc, skr: Number(json.skr ?? 0) }
}

export async function getUsdcBalance(owner: string): Promise<number> {
  return (await getBalances(owner)).usdc
}

export type UnderlyingProfile = {
  ticker: string
  name: string | null
  industry: string | null
  exchange: string | null
  country: string | null
  market_cap: number | null
  employees: number | null
  ipo: string | null
  weburl: string | null
}

export type UnderlyingEvent = {
  kind: string
  event_date: string
  detail: string | null
  amount: number | null
}

export async function getUnderlying(ticker: string): Promise<{
  profile: UnderlyingProfile | null
  events: UnderlyingEvent[]
}> {
  const res = await fetch(`${BASE}/underlying?ticker=${ticker}`)
  if (!res.ok) return { profile: null, events: [] }
  const json: any = await res.json()
  return { profile: json?.profile ?? null, events: json?.events ?? [] }
}
export type TokenReliability = {
  open: {
    samples: number
    availability: number | null
    min_entry: number | null
    max_entry: number | null
    avg_entry: number | null
    min_exit: number | null
    max_exit: number | null
    avg_exit: number | null
    since: number | null
  } | null
  overall: {
    samples: number
    availability: number | null
    min_entry: number | null
    max_entry: number | null
    min_exit: number | null
    max_exit: number | null
  } | null
}

export async function getReliability(symbol: string): Promise<TokenReliability | null> {
  const res = await fetch(`${BASE}/reliability?symbol=${symbol}`)
  if (!res.ok) return null
  const json: any = await res.json()
  return { open: json?.open ?? null, overall: json?.overall ?? null }
}
export async function getPricesAgo(symbols: string[], hours = 24): Promise<Record<string, { px: number; ts: number }>> {
  if (!symbols.length) return {}
  const res = await fetch(`${BASE}/prices?symbols=${symbols.join(',')}&hours=${hours}`)
  if (!res.ok) return {}
  const json: any = await res.json()
  return json?.then ?? {}
}
export type IssuerReliability = {
  issuer: string
  samples: number
  tokens: number
  availability: number
  avg_entry: number | null
  reliable_tokens: number
  never_quotable: number
}

export type WeakToken = {
  symbol: string
  issuer: string
  samples: number
  quotable_count: number
  availability: number
}

export async function getIssuerReliability(): Promise<{
  issuers: IssuerReliability[]
  weakest: WeakToken[]
  meta: { total: number; tokens: number; updated_at: number | null } | null
}> {
  const res = await fetch(`${BASE}/reliability`)
  if (!res.ok) return { issuers: [], weakest: [], meta: null }
  const json: any = await res.json()
  return { issuers: json?.issuers ?? [], weakest: json?.weakest ?? [], meta: json?.meta ?? null }
}
export type TokenRel = {
  symbol: string
  ticker: string | null
  issuer: string
  samples: number
  quotable_count: number
  availability: number
  avg_entry: number | null
}

export async function getTokenReliability(): Promise<TokenRel[]> {
  const res = await fetch(`${BASE}/reliability?all=1`)
  if (!res.ok) return []
  const json: any = await res.json()
  return json?.tokens ?? []
}
