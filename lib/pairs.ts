import { getTokens, TokenRow } from './stats'

export type Pair = { ticker: string; x?: TokenRow; on?: TokenRow }

export async function getPairs(): Promise<Pair[]> {
  const rows = await getTokens()
  const map = new Map<string, Pair>()
  for (const r of rows) {
    const p = map.get(r.ticker) ?? { ticker: r.ticker }
    if (r.issuer === 'Ondo') p.on = r
    else p.x = r
    map.set(r.ticker, p)
  }
  return [...map.values()].sort((a, b) => a.ticker.localeCompare(b.ticker))
}
