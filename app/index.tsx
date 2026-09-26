import { useCallback, useEffect, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { getPairs, Pair } from '../lib/pairs'
import { num, T } from '../constants/theme'
import { getMarketState, MARKET_LABEL } from '../lib/market-hours'
import { compact, getStats, History, Latest } from '../lib/stats'

export default function MarketScreen() {
  const router = useRouter()
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [hist, setHist] = useState<Record<string, History>>({})
  const [pairs, setPairs] = useState<Pair[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stats, allPairs] = await Promise.all([getStats(), getPairs()])
      setPairs(allPairs)
      const l: Record<string, Latest> = {}
      stats.latest.forEach((r) => { l[r.symbol] = r })
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setLatest(l)
      setHist(h)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [state])

  useEffect(() => { load() }, [load])

  const closed = state !== 'open'

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={T.dim} />}>

      <View style={s.header}>
        <View>
          <Text style={s.brand}>StockPass</Text>
          <Text style={s.sub}>What you really pay to own a stock on-chain</Text>
        </View>
      </View>

      <View style={[s.pill, closed && s.pillWarn]}>
        <Text style={[s.pillText, closed && s.pillTextWarn]}>{market.title}</Text>
      </View>
      <Text style={s.sub}>{market.subtitle}</Text>

      {error && <Text style={s.error}>{error}</Text>}

      {pairs.map((stock) => {
        const x = stock.x!
        const on = stock.on!
        if (!x || !on) return null
        const lx = latest[x.symbol]
        const lon = latest[on.symbol]
        const ready = lx && lon
        const cheaper = ready ? (lx.entry_bps <= lon.entry_bps ? x : on) : null
        const diff = ready ? Math.abs(lx.entry_bps - lon.entry_bps) : 0

        return (
          <View key={stock.ticker} style={s.card}>
            <View style={s.cardHead}>
              <Text style={s.ticker}>{stock.ticker}</Text>

            </View>

            {[x, on].map((t) => {
              const l = latest[t.symbol]
              const h = hist[t.symbol]
              const usual = h && h.samples >= 5 ? h.avg_entry : null
              const unusual = l && usual ? l.entry_bps > usual * 1.3 : false
              const isBest = cheaper?.symbol === t.symbol && diff > 0
              return (
                <Pressable key={t.symbol} style={s.tokenRow}
                  onPress={() => router.push(`/passport?symbol=${t.symbol}`)}>
                  <View style={s.tokenLeft}>
                    <Text style={s.tokenSymbol}>{t.symbol}</Text>
                    <Text style={s.faint}>
                      {t.issuer}{l ? ` · supply ${compact(l.supply)}` : ''}
                    </Text>
                  </View>
                  <View style={s.tokenRight}>
                    <Text style={[s.big, num, unusual && s.warnText, isBest && s.accentText]}>
                      {l ? (l.quotable ? `${l.entry_bps}` : '—') : '··'}
                      {l?.quotable ? <Text style={s.unit}> bps</Text> : null}
                    </Text>
                    <Text style={s.faint}>{usual ? `usual ${usual.toFixed(0)}` : 'collecting'}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </Pressable>
              )
            })}

            <View style={s.cardFoot}>
              <Text style={s.footText}>
                {diff > 0 ? (
                  <>
                    <Text style={s.accentText}>{cheaper?.symbol}</Text> is {diff} bps cheaper to enter
                  </>
                ) : ready ? 'Both issuers cost about the same' : 'Loading measurements'}
              </Text>
              <Pressable style={s.buy} onPress={() => router.push(`/buy?ticker=${stock.ticker}`)}>
                <Text style={s.buyText}>Buy</Text>
              </Pressable>
            </View>
          </View>
        )
      })}

      <Text style={s.faint}>Entry cost at $1,000, measured by StockPass. Tap a token for its passport.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  header: { marginTop: 8 },
  brand: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  sub: { color: T.dim, fontSize: 13, marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1F2A12' },
  pillWarn: { backgroundColor: '#2A2110' },
  pillText: { color: T.accent, fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  pillTextWarn: { color: T.warn },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 4 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 6 },
  ticker: { color: T.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  tokenLeft: { flex: 1, gap: 2 },
  tokenRight: { alignItems: 'flex-end', gap: 2 },
  tokenSymbol: { color: T.text, fontSize: 15, fontWeight: '600' },
  big: { color: T.text, fontSize: 22, fontWeight: '600' },
  unit: { fontSize: 13, color: T.dim, fontWeight: '400' },
  accentText: { color: T.accent },
  warnText: { color: T.warn },
  faint: { color: T.faint, fontSize: 12 },
  chevron: { color: T.faint, fontSize: 22, marginLeft: 2 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12, marginTop: 6 },
  footText: { color: T.dim, fontSize: 13, flexShrink: 1 },
  buy: { backgroundColor: T.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  buyText: { color: T.bg, fontSize: 14, fontWeight: '700' },
  error: { color: T.warn, fontSize: 13 },
})

