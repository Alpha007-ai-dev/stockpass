import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { STOCKS, Stock } from '../constants/stocks'
import { getMarketState, MARKET_LABEL } from '../lib/market-hours'
import { compare, Quote, quoteToken } from '../lib/quotes'

type Result = Quote | { error: string }
type Rows = Record<string, Record<string, Result>>

const isQuote = (r?: Result): r is Quote => !!r && 'buy' in r
const bpsText = (v: number) => `${v > 0 ? '+' : ''}${v} bps`

function StockCard({ stock, results }: { stock: Stock; results?: Record<string, Result> }) {
  const [x, on] = stock.tokens
  const qx = results?.[x.symbol]
  const qon = results?.[on.symbol]
  const cmp = isQuote(qx) && isQuote(qon) ? compare(qx, qon) : null
  return (
    <View style={s.card}>
      <View style={s.cardHead}>
        <Text style={s.ticker}>{stock.ticker}</Text>
        <Text style={s.muted}>{stock.name}</Text>
      </View>
      {[x, on].map((t) => {
        const r = results?.[t.symbol]
        return (
          <View key={t.symbol} style={s.line}>
            <Text style={s.label}>{t.symbol}</Text>
            <Text style={s.value}>
              {!r ? 'loading...' : isQuote(r) ? `$${r.buy.toFixed(2)} / $${r.sell.toFixed(2)}` : `- ${r.error}`}
            </Text>
          </View>
        )
      })}
      {cmp && (
        <View style={s.cmp}>
          <Text style={s.muted}>Ondo vs xStocks (mid): {bpsText(cmp.midDiffBps)}</Text>
          <Text style={[s.muted, cmp.switchAtoB > 0 && s.good]}>Switch {x.symbol} to {on.symbol}: {bpsText(cmp.switchAtoB)}</Text>
          <Text style={[s.muted, cmp.switchBtoA > 0 && s.good]}>Switch {on.symbol} to {x.symbol}: {bpsText(cmp.switchBtoA)}</Text>
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

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{market.title}</Text>
        <Text style={s.bannerSub}>{market.subtitle}</Text>
      </View>
      <Text style={s.muted}>
        Executable prices at $1,000 (buy / sell) via Jupiter. {updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}
      </Text>
      {STOCKS.map((stock) => <StockCard key={stock.ticker} stock={stock} results={rows[stock.ticker]} />)}
      <Pressable style={s.button} onPress={() => router.push('/wallet')}>
        <Text style={s.buttonText}>Wallet</Text>
      </Pressable>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0b0b' },
  content: { padding: 16, gap: 12 },
  banner: { borderWidth: 1, borderColor: '#3B6D11', borderRadius: 8, padding: 12 },
  bannerTitle: { color: '#97C459', fontSize: 16, fontWeight: '600' },
  bannerSub: { color: '#B4B2A9', marginTop: 4 },
  card: { borderWidth: 1, borderColor: '#2C2C2A', borderRadius: 8, padding: 12, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  ticker: { color: '#F1EFE8', fontSize: 18, fontWeight: '600' },
  line: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#D3D1C7' },
  value: { color: '#F1EFE8' },
  cmp: { borderTopWidth: 1, borderTopColor: '#2C2C2A', paddingTop: 6, marginTop: 4, gap: 2 },
  muted: { color: '#888780', fontSize: 12 },
  good: { color: '#97C459' },
  button: { borderWidth: 1, borderColor: '#444441', borderRadius: 8, padding: 12, alignItems: 'center' },
  buttonText: { color: '#D3D1C7' },
})
