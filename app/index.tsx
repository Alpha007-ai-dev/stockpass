import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { num, T } from '../constants/theme'
import { getMarketState, MARKET_LABEL } from '../lib/market-hours'
import { compact, getStats, History, Latest } from '../lib/stats'
import { getPairs, Pair } from '../lib/pairs'
import { costLabel, isUsable } from '../lib/cost'

type Sort = 'diff' | 'cheap' | 'name'

export default function MarketScreen() {
  const router = useRouter()
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [hist, setHist] = useState<Record<string, History>>({})
  const [pairs, setPairs] = useState<Pair[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('diff')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stats, allPairs] = await Promise.all([getStats(), getPairs()])
      const l: Record<string, Latest> = {}
      stats.latest.forEach((r) => { l[r.symbol] = r })
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setLatest(l)
      setHist(h)
      setPairs(allPairs.filter((p) => p.x && p.on))
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [state])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase()
    const withData = pairs.map((p) => {
      const lx = latest[p.x!.symbol]
      const lon = latest[p.on!.symbol]
      const ready = isUsable(lx?.entry_bps, lx?.quotable) && isUsable(lon?.entry_bps, lon?.quotable)
      const diff = ready ? Math.abs(lx.entry_bps - lon.entry_bps) : -1
      const cheapest = ready ? Math.min(lx.entry_bps, lon.entry_bps) : 9999
      return { pair: p, lx, lon, ready, diff, cheapest }
    })
    const filtered = q ? withData.filter((r) => r.pair.ticker.includes(q)) : withData
    const sorted = [...filtered]
    if (sort === 'diff') sorted.sort((a, b) => b.diff - a.diff)
    if (sort === 'cheap') sorted.sort((a, b) => a.cheapest - b.cheapest)
    if (sort === 'name') sorted.sort((a, b) => a.pair.ticker.localeCompare(b.pair.ticker))
    return sorted
  }, [pairs, latest, query, sort])

  const closed = state !== 'open'

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={rows}
      keyExtractor={(r) => r.pair.ticker}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={T.dim} />}
      ListHeaderComponent={
        <View style={{ gap: T.gap }}>
          <View>
            <Text style={s.brand}>StockPass</Text>
            <Text style={s.sub}>What you really pay to own a stock on-chain</Text>
          </View>

          <View style={[s.pill, closed && s.pillWarn]}>
            <Text style={[s.pillText, closed && s.pillTextWarn]}>{market.title}</Text>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search ticker"
            placeholderTextColor={T.faint}
            autoCapitalize="characters"
            style={s.search}
          />

          <View style={s.sorts}>
            {([['diff', 'Biggest gap'], ['cheap', 'Cheapest'], ['name', 'A-Z']] as [Sort, string][]).map(([key, label]) => (
              <Pressable key={key} onPress={() => setSort(key)} style={[s.sortBtn, sort === key && s.sortActive]}>
                <Text style={[s.sortText, sort === key && s.sortTextActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}
          <Text style={s.faint}>{rows.length} stocks - entry cost at $1,000</Text>
        </View>
      }
      renderItem={({ item }) => {
        const { pair, lx, lon, ready, diff } = item
        const x = pair.x!
        const on = pair.on!
        const cheaper = ready ? (lx.entry_bps <= lon.entry_bps ? x : on) : null

        return (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Pressable onPress={() => router.push(`/compare?ticker=${pair.ticker}`)}><Text style={s.ticker}>{pair.ticker} ›</Text></Pressable>
              {diff > 0 && <Text style={s.accentSmall}>{diff} bps apart</Text>}
            </View>

            {[x, on].map((t) => {
              const l = latest[t.symbol]
              const h = hist[t.symbol]
              const usual = h && h.samples >= 5 ? h.avg_entry : null
              const unusual = l && usual ? l.entry_bps > usual * 1.3 : false
              const isBest = cheaper?.symbol === t.symbol && diff > 0
              return (
                <Pressable key={t.symbol} style={s.tokenRow} onPress={() => router.push(`/passport?symbol=${t.symbol}`)}>
                  <View style={s.tokenLeft}>
                    <Text style={s.tokenSymbol}>{t.symbol}</Text>
                    <Text style={s.faint}>{t.issuer}{l ? ` - supply ${compact(l.supply)}` : ''}</Text>
                  </View>
                  <View style={s.tokenRight}>
                    <Text style={[s.big, num, unusual && s.warnText, isBest && s.accentText]}>
                      {l ? (l.quotable ? `${l.entry_bps}` : '-') : '..'}
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
                {diff > 0 ? <><Text style={s.accentText}>{cheaper?.symbol}</Text> is cheaper to enter</> : ready ? 'Both cost about the same' : 'No quote right now'}
              </Text>
              <Pressable style={s.buy} onPress={() => router.push(`/buy?ticker=${pair.ticker}`)}>
                <Text style={s.buyText}>Buy</Text>
              </Pressable>
            </View>
          </View>
        )
      }}
    />
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  brand: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { color: T.dim, fontSize: 13, marginTop: 4 },
  pill: { alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#1F2A12' },
  pillWarn: { backgroundColor: '#2A2110' },
  pillText: { color: T.accent, fontSize: 12, fontWeight: '600', letterSpacing: 0.6 },
  pillTextWarn: { color: T.warn },
  search: { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, color: T.text, paddingHorizontal: 14, height: 48, fontSize: 15 },
  sorts: { flexDirection: 'row', gap: 8 },
  sortBtn: { borderRadius: 12, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 8 },
  sortActive: { backgroundColor: T.accent, borderColor: T.accent },
  sortText: { color: T.dim, fontSize: 13 },
  sortTextActive: { color: T.bg, fontWeight: '700' },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 4, marginBottom: T.gap },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  ticker: { color: T.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  accentSmall: { color: T.accent, fontSize: 12, fontWeight: '600' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: T.border },
  tokenLeft: { flex: 1, gap: 2 },
  tokenRight: { alignItems: 'flex-end', gap: 2 },
  tokenSymbol: { color: T.text, fontSize: 15, fontWeight: '600' },
  big: { color: T.text, fontSize: 22, fontWeight: '600' },
  unit: { fontSize: 13, color: T.dim, fontWeight: '400' },
  accentText: { color: T.accent },
  warnText: { color: T.warn },
  faint: { color: T.faint, fontSize: 12 },
  chevron: { color: T.faint, fontSize: 22 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12, marginTop: 6 },
  footText: { color: T.dim, fontSize: 13, flexShrink: 1 },
  buy: { backgroundColor: T.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  buyText: { color: T.bg, fontSize: 14, fontWeight: '700' },
  error: { color: T.warn, fontSize: 13 },
})


