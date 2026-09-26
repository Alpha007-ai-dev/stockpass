import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { STOCKS } from '../constants/stocks'
import { getMarketState, MARKET_LABEL } from '../lib/market-hours'
import { compact, getStats, History, Latest } from '../lib/stats'

export default function MarketScreen() {
  const router = useRouter()
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [hist, setHist] = useState<Record<string, History>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const stats = await getStats()
      const l: Record<string, Latest> = {}
      stats.latest.forEach((r) => { l[r.symbol] = r })
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setLatest(l)
      setHist(h)
      setUpdatedAt(new Date())
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [state])

  useEffect(() => { load() }, [load])

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <View style={s.banner}>
        <Text style={s.bannerTitle}>{market.title}</Text>
        <Text style={s.bannerSub}>{market.subtitle}</Text>
      </View>

      <Text style={s.muted}>
        Cost to enter at $1,000, per share.{' '}
        {error ? `Error: ${error}` : updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Loading...'}
      </Text>

      {STOCKS.map((stock) => {
        const [x, on] = stock.tokens
        const lx = latest[x.symbol]
        const lon = latest[on.symbol]
        const cheaper = lx && lon ? (lx.entry_bps <= lon.entry_bps ? x : on) : null
        const diff = lx && lon ? Math.abs(lx.entry_bps - lon.entry_bps) : 0

        return (
          <View key={stock.ticker} style={s.card}>
            <View style={s.head}>
              <Text style={s.ticker}>{stock.ticker}</Text>
              <Text style={s.muted}>{stock.name}</Text>
            </View>

            {[x, on].map((t) => {
              const l = latest[t.symbol]
              const h = hist[t.symbol]
              const unusual = l && h && h.samples >= 5 && l.entry_bps > h.avg_entry * 1.3
              return (
                <Pressable key={t.symbol} style={s.row} onPress={() => router.push(`/passport?symbol=`)}>
                  <View>
                    <Text style={s.label}>{t.symbol}</Text>
                    <Text style={s.tiny}>
                      {t.issuer}{l ? ` - supply ${compact(l.supply)}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.value, unusual && s.warn]}>
                      {l ? (l.quotable ? `${l.entry_bps} bps` : 'no quote') : '-'}
                    </Text>
                    <Text style={s.tiny}>
                      {h ? `usual ${h.avg_entry.toFixed(0)} (${h.samples})` : 'no history yet'}
                    </Text>
                  </View>
                </Pressable>
              )
            })}

            {cheaper && diff > 0 && (
              <View style={s.footer}>
                <Text style={s.good}>Cheaper to enter: {cheaper.symbol} by {diff} bps</Text>
              </View>
            )}
            <Pressable style={s.buy} onPress={() => router.push(`/buy?ticker=${stock.ticker}`)}>
              <Text style={s.buyText}>Buy {stock.ticker}</Text>
            </Pressable>
          </View>
        )
      })}

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
  value: { color: '#F5F5F1', fontSize: 15 },
  warn: { color: '#E9B45A' },
  footer: { borderTopWidth: 1, borderTopColor: '#262624', paddingTop: 8 },
  good: { color: '#D4F25A', fontSize: 13 },
  buy: { borderWidth: 1, borderColor: '#D4F25A', borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  buyText: { color: '#D4F25A', fontSize: 14, fontWeight: '600' },
  muted: { color: '#A7A7A0', fontSize: 12 },
  tiny: { color: '#8A8A84', fontSize: 12 },
  button: { borderWidth: 1, borderColor: '#34342F', borderRadius: 16, padding: 14, alignItems: 'center' },
  buttonText: { color: '#F5F5F1' },
})


