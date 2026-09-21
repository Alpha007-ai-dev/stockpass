import { STOCKS } from '../constants/stocks'

const RPC = 'https://solana-rpc.publicnode.com'
const CACHE_MS = 10 * 60 * 1000

let cache: Record<string, number> | null = null
let loadedAt = 0

// Dividend multiplier (Token-2022 Scaled UI Amount): shares = raw tokens x multiplier
export async function getMultipliers(): Promise<Record<string, number>> {
  if (cache && Date.now() - loadedAt < CACHE_MS) return cache
  const mints = STOCKS.flatMap((s) => s.tokens.map((t) => t.mint))
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [mints, { encoding: 'jsonParsed' }] }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? 'RPC error')
  const now = Date.now() / 1000
  const out: Record<string, number> = {}
  mints.forEach((mint, i) => {
    const exts = json.result?.value?.[i]?.data?.parsed?.info?.extensions ?? []
    const s = exts.find((e: any) => e.extension === 'scaledUiAmountConfig')?.state
    out[mint] = s ? Number(now >= s.newMultiplierEffectiveTimestamp ? s.newMultiplier : s.multiplier) : 1
  })
  cache = out
  loadedAt = Date.now()
  return out
}
