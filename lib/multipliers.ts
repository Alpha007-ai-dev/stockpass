import { STOCKS } from '../constants/stocks'

const RPC = 'https://solana-rpc.publicnode.com'
const CACHE_MS = 10 * 60 * 1000

export type MintInfo = {
  multiplier: number
  next: number | null
  nextAt: number | null
  supply: number
}

let cache: Record<string, MintInfo> | null = null
let loadedAt = 0

export async function getMintInfo(): Promise<Record<string, MintInfo>> {
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
  const out: Record<string, MintInfo> = {}
  mints.forEach((mint, i) => {
    const info = json.result?.value?.[i]?.data?.parsed?.info
    const s = (info?.extensions ?? []).find((e: any) => e.extension === 'scaledUiAmountConfig')?.state
    const active = s ? Number(now >= s.newMultiplierEffectiveTimestamp ? s.newMultiplier : s.multiplier) : 1
    const pending = s && now < s.newMultiplierEffectiveTimestamp
    out[mint] = {
      multiplier: active,
      next: pending ? Number(s.newMultiplier) : null,
      nextAt: pending ? Number(s.newMultiplierEffectiveTimestamp) : null,
      supply: Number(info?.supply ?? 0) / 10 ** Number(info?.decimals ?? 0),
    }
  })
  cache = out
  loadedAt = Date.now()
  return out
}
