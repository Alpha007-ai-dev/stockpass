import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CostMap, MapFilter } from '@/components/cost-map'
import { num, T } from '@/constants/theme'
import { costLabel, isUsable } from '@/lib/cost'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups, Group } from '@/lib/pairs'
import { getStats, History, Latest } from '@/lib/stats'

type Sort = 'diff' | 'cheap' | 'name'

export default function MarketScreen() {
  const router = useRouter()
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [hist, setHist] = useState<Record<string, History>>({})
  const [groups, setGroups] = useState<Group[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('diff')
  const [view, setView] = useState<'map' | 'list'>('map')
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stats, allGroups] = await Promise.all([getStats(), getGroups()])
      const l: Record<string, Latest> = {}
      stats.latest.forEach((r) => { l[r.symbol] = r })
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setLatest(l)
      setHist(h)
      setGroups(allGroups)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [state])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase()
    const withData = groups.map((g) => {
      const usable = g.tokens
        .map((t) => latest[t.symbol])
        .filter((l) => l && isUsable(l.entry_bps, l.quotable)) as Latest[]
      const costs = usable.map((l) => l.entry_bps as number)
      const diff = costs.length > 1 ? Math.max(...costs) - Math.min(...costs) : -1
      const cheapest = costs.length ? Math.min(...costs) : 9999
      const best = usable.length ? usable.reduce((a, b) => ((a.entry_bps as number) <= (b.entry_bps as number) ? a : b)) : null
      return { group: g, usable, best, diff, cheapest }
    })
    const filtered = q ? withData.filter((r) => r.group.ticker.includes(q)) : withData
    const sorted = [...filtered]
    if (sort === 'diff') sorted.sort((a, b) => b.diff - a.diff)
    if (sort === 'cheap') sorted.sort((a, b) => a.cheapest - b.cheapest)
    if (sort === 'name') sorted.sort((a, b) => a.group.ticker.localeCompare(b.group.ticker))
    return sorted
  }, [groups, latest, query, sort])

  const closed = state !== 'open'

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={view === 'map' ? [] : rows}
      keyExtractor={(r) => r.group.ticker}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={T.dim} />}
      ListHeaderComponent={
        <View style={{ gap: T.gap }}>
          <View style={s.headRow}>
            <Text style={s.brand}>Markets</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[s.pill, closed && s.pillWarn]}>
                <Text style={[s.pillText, closed && s.pillTextWarn]}>{market.title}</Text>
              </View>
              <Pressable onPress={() => { setSearchOpen((v) => !v); setView('list') }} hitSlop={10}>
                <Text style={s.searchIcon}>&#9906;</Text>
              </Pressable>
            </View>
          </View>

          <View style={s.toggle}>
            {(['map', 'list'] as const).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} style={[s.tab, view === v && s.tabOn]}>
                <Text style={[s.tabText, view === v && s.tabTextOn]}>{v === 'map' ? 'Cost map' : 'List'}</Text>
              </Pressable>
            ))}
          </View>

          {error && <Text style={s.error}>{error}</Text>}

          {searchOpen && (
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search ticker"
              placeholderTextColor={T.faint}
              autoCapitalize="characters"
              autoFocus
              style={s.search}
            />
          )}

          {view === 'map' ? (
            <CostMap groups={groups} latest={latest} filter={mapFilter} onFilter={setMapFilter} />
          ) : (
            <View style={{ gap: T.gap }}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search ticker"
                placeholderTextColor={T.faint}
                autoCapitalize="characters"
                style={s.search}
              />
              <View style={s.sorts}>
                {([['diff', 'Biggest spread'], ['cheap', 'Cheapest'], ['name', 'A-Z']] as [Sort, string][]).map(([key, label]) => (
                  <Pressable key={key} onPress={() => setSort(key)} style={[s.sortBtn, sort === key && s.sortActive]}>
                    <Text style={[s.sortText, sort === key && s.sortTextActive]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={s.faint}>{rows.length} stocks · entry cost at $1,000</Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => {
        const { group, ready, diff } = item
        const best = item.usable.length ? item.usable.reduce((a, b) => (a.entry_bps! <= b.entry_bps! ? a : b)) : null
        return (
          <View style={s.card}>
            <View style={s.cardHead}>
              <Pressable onPress={() => router.push(`/compare?ticker=${group.ticker}`)}>
                <Text style={s.ticker}>{group.ticker} ›</Text>
              </Pressable>
              {diff > 0 && <Text style={s.accentSmall}>{diff} bps spread</Text>}
            </View>

            {group.tokens.map((t) => {
              const l = latest[t.symbol]
              const h = hist[t.symbol]
              const usual = h && h.samples >= 5 && h.avg_entry !== null ? h.avg_entry : null
              const isBest = best?.symbol === t.symbol && diff > 0
              return (
                <Pressable key={t.symbol} style={s.tokenRow} onPress={() => router.push(`/passport?symbol=${t.symbol}`)}>
                  <View style={s.tokenLeft}>
                    <Text style={s.tokenSymbol}>{t.symbol}</Text>
                    <Text style={s.faint}>{t.issuer}</Text>
                  </View>
                  <View style={s.tokenRight}>
                    <Text style={[s.big, num, isBest && s.accentText]}>{l ? costLabel(l.entry_bps, l.quotable) : 'collecting'}</Text>
                    <Text style={s.faint}>{usual ? `usual ${usual.toFixed(0)}` : ''}</Text>
                  </View>
                  <Text style={s.chevron}>›</Text>
                </Pressable>
              )
            })}

            <View style={s.cardFoot}>
              <Text style={s.footText}>
                {best && diff > 0 ? <><Text style={s.accentText}>{best.issuer}</Text> is cheapest to enter</> : ready ? 'All issuers cost about the same' : 'No usable quote'}
              </Text>
              <Pressable style={s.buy} onPress={() => router.push(`/buy?ticker=${group.ticker}`)}>
                <Text style={s.buyText}>Buy</Text>
              </Pressable>
            </View>
          </View>
        )
      }}    />
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  searchIcon: { color: T.dim, fontSize: 20 },
  brand: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  pill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#1F2A12' },
  pillWarn: { backgroundColor: '#2A2110' },
  pillText: { color: T.accent, fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  pillTextWarn: { color: T.warn },
  toggle: { flexDirection: 'row', backgroundColor: T.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: T.border },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  tabOn: { backgroundColor: T.accent },
  tabText: { color: T.dim, fontSize: 14, fontWeight: '600' },
  tabTextOn: { color: T.bg },
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
  big: { color: T.text, fontSize: 18, fontWeight: '600' },
  accentText: { color: T.accent },
  faint: { color: T.faint, fontSize: 12 },
  chevron: { color: T.faint, fontSize: 22 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12, marginTop: 6 },
  footText: { color: T.dim, fontSize: 13, flexShrink: 1 },
  buy: { backgroundColor: T.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  buyText: { color: T.bg, fontSize: 14, fontWeight: '700' },
  error: { color: T.warn, fontSize: 13 },
})




