import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { STOCKS, Stock } from '../constants/stocks'
import { getMarketState, MARKET_LABEL } from '../lib/market-hours'
import { compare, Quote, quoteToken } from '../lib/quotes'

type Result = Quote | { error: string }
type Rows = Record<string, Record<string, Result>>

const isQuote = (r?: Result): r is Quote => !!r && 'buy' in r
const bps = (v: number) => `${v > 0 ? '+' : ''}${v} bps`
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0))

function StockCard({ stock, results }: { stock: Stock; results?: Record<string, Result> }) {
  const [x, on] = stock.tokens
  const qx = results?.[x.symbol]
  const qon = results?.[on.symbol]
  const both = isQuote(qx) && isQuote(qon)
  const cmp = both ? compare(qx as Quote, qon as Quote) : null
  const cheaper = both ? ((qx as Quote).entryBps <= (qon as Quote).entryBps ? x : on) : null

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.ticker}>{stock.ticker}</Text>
        <Text style={s.muted}>{stock.name}</Text>
      </View>

      {[x, on].map((t) => {
        const r = results?.[t.symbol]
        return (
          <View key={t.symbol} style={s.row}>
            <View>
              <Text style={s.label}>{t.symbol}</Text>
              <Text style={s.tiny}>{t.issuer}{isQuote(r) ? ` - supply ${compact(r.supply)}` : ''}</Text>
            </View>
            <Text style={s.value}>
              {!r ? 'loading...' : isQuote(r) ? `in ${r.entryBps} / out ${r.exitBps} bps` : `- ${r.error}`}
            </Text>
          </View>
        )
      })}

      {cmp && cheaper && (
        <View style={s.footer}>
          <Text style={s.good}>Cheaper to enter: {cheaper.symbol} by {Math.abs(cmp.entryDiffBps)} bps</Text>
          <Text style={s.tiny}>Price per share differs by {bps(cmp.midDiffBps)}</Text>
        </View>
      )}
    </View>
  )
}

export default function MarketScreen() {
  const router = useRouter()
  const [rows, setRows] = useState<Rows>({})
  const [loading, setLoading] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const busy = useRef(false)
  const market = MARKET_LABEL[getMarketState()]

  const load = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setLoading(true)
    for (const stock of STOCKS) {
      const results: Record<string, Result> = {}
      for (const token of stock.tokens) {
        try {
          results[token.symbol] = await quoteToken(token)
        } catch (e) {
          results[token.symbol] = { error: (e as Error).message }
        }
      }
      setRows((prev) => ({ ...prev, [stock.ticker]: results }))
    }
    setUpdatedAt(new Date())
    setLoading(false)
    busy.current = false
  }, [])

  useEffect(() => { load() }, [load])

  const events = STOCKS.flatMap((stock) =>
    stock.tokens.map((t) => {
      const r = rows[stock.ticker]?.[t.symbol]
      if (!isQuote(r) || !r.next || !r.nextAt) return null
      const pct = ((r.next / (r.buy > 0 ? 1 : 1)) * 0 + 0)
      return { symbol: t.symbol, next: r.next, at: new Date(r.nextAt * 1000) }
    }),
  ).filter(Boolean) as { symbol: string; next: number; at: Date }[]

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{market.title}</Text>
        <Text style={s.bannerSub}>{market.subtitle}</Text>
      </View>

      <Text style={s.muted}>
        Entry and exit cost at $1,000, per share. {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}
      </Text>

      {events.length > 0 && (
        <View style={s.card}>
          <Text style={s.label}>Corporate action radar</Text>
          {events.map((e) => (
            <Text key={e.symbol} style={s.tiny}>{e.symbol}: multiplier -> {e.next.toFixed(5)} on {e.at.toLocaleString()}</Text>
          ))}
        </View>
      )}

      {STOCKS.map((stock) => <StockCard key={stock.ticker} stock={stock} results={rows[stock.ticker]} />)}

      <Pressable style={s.button} onPress={() => router.push('/wallet')}>
        <Text style={s.buttonText}>Wallet</Text>
      </Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0E0D' },
  content: { padding: 16, gap: 12 },
  banner: { borderWidth: 1, borderColor: '#3B6D11', borderRadius: 16, padding: 14 },
  bannerTitle: { color: '#D4F25A', fontSize: 15, fontWeight: '600' },
  bannerSub: { color: '#B8B8B0', marginTop: 4, fontSize: 13 },
  card: { borderWidth: 1, borderColor: '#262624', borderRadius: 16, padding: 14, gap: 8, backgroundColor: '#181817' },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  ticker: { color: '#F5F5F1', fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#F5F5F1', fontSize: 14, fontWeight: '500' },
  value: { color: '#F5F5F1', fontSize: 14 },
  footer: { borderTopWidth: 1, borderTopColor: '#262624', paddingTop: 8, gap: 2 },
  good: { color: '#D4F25A', fontSize: 13 },
  muted: { color: '#A7A7A0', fontSize: 12 },
  tiny: { color: '#8A8A84', fontSize: 12 },
  button: { borderWidth: 1, borderColor: '#34342F', borderRadius: 16, padding: 14, alignItems: 'center' },
  buttonText: { color: '#F5F5F1' },
})
