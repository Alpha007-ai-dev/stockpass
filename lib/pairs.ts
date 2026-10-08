import { getTokens, TokenRow } from './stats'

export type Group = { ticker: string; tokens: TokenRow[] }

const ORDER = ['xStocks', 'Ondo', 'Backpack']

export async function getGroups(): Promise<Group[]> {
  const rows = (await getTokens()) ?? []
  const map = new Map<string, TokenRow[]>()
  for (const r of rows) {
    const list = map.get(r.ticker) ?? []
    list.push(r)
    map.set(r.ticker, list)
  }
  return [...map.entries()]
    .map(([ticker, tokens]) => ({
      ticker,
      tokens: tokens.sort((a, b) => ORDER.indexOf(a.issuer) - ORDER.indexOf(b.issuer)),
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

// Régi API, amíg a képernyők átállnak
export type Pair = { ticker: string; x?: TokenRow; on?: TokenRow }

export async function getPairs(): Promise<Pair[]> {
  const groups = await getGroups()
  return groups.map((g) => ({
    ticker: g.ticker,
    x: g.tokens.find((t) => t.issuer === 'xStocks'),
    on: g.tokens.find((t) => t.issuer === 'Ondo'),
  }))
}
