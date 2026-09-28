import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { CostMap, MapFilter } from '@/components/cost-map'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable, NO_MARKET_BPS } from '@/lib/cost'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups, Group } from '@/lib/pairs'
import { getSeries, getStats, History, Latest, SeriesPoint, TokenRow } from '@/lib/stats'

type Row = { token: TokenRow; l: Latest | undefined; spark: number[] | null }

function Spark({ values, color }: { values: number[]; color: string }) {
  if (values.length < 3) return <View style={{ width: 64, height: 24 }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(0.5, max - min)
  const step = 64 / (values.length - 1)
  const d = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(22 - ((v - min) / span) * 18).toFixed(1)}`)
    .join(' ')
  return (
    <Svg width={64} height={24}>
      <Path d={d} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.85} />
    </Svg>
  )
}

export default function MarketScreen() {
  const router = useRouter()
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [groups, setGroups] = useState<Group[]>([])
  const [sparks, setSparks] = useState<Record<string, number[]>>({})
  const [filter, setFilter] = useState<string>('all')
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'map'>('list')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]
  const open = state === 'open'

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [stats, allGroups] = await Promise.all([getStats(), getGroups()])
      const l: Record<string, Latest> = {}
      stats.latest.forEach((r) => { l[r.symbol] = r })
      setLatest(l)
      setGroups(allGroups)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    const q = query.trim().toUpperCase()
    const all: Row[] = groups.flatMap((g) =>
      g.tokens.map((token) => ({ token, l: latest[token.symbol], spark: sparks[token.symbol] ?? null })),
    )
    const byFilter = filter === 'all' ? all : all.filter((r) => r.token.issuer === filter)
    const byQuery = q ? byFilter.filter((r) => r.token.ticker.includes(q)) : byFilter
    return byQuery.sort((a, b) => {
      const av = isUsable(a.l?.entry_bps, a.l?.quotable) ? (a.l!.entry_bps as number) : 9999
      const bv = isUsable(b.l?.entry_bps, b.l?.quotable) ? (b.l!.entry_bps as number) : 9999
      return av - bv
    })
  }, [groups, latest, sparks, filter, query])

  useEffect(() => {
    const visible = rows.slice(0, 12).map((r) => r.token)
    visible.forEach(async (t) => {
      if (sparks[t.symbol]) return
      try {
        const pts = (await getSeries(t.ticker, 24)) as SeriesPoint[]
        const vals = pts.filter((p) => p.symbol === t.symbol && p.quotable && p.entry_bps !== null).map((p) => p.entry_bps as number)
        if (vals.length >= 3) setSparks((prev) => ({ ...prev, [t.symbol]: vals.slice(-14) }))
      } catch {}
    })
  }, [rows.length, filter])

  const statusFor = (l: Latest | undefined) => {
    if (!l || !l.quotable) return { label: 'NO MARKET', color: T.faint, dot: false }
    if ((l.entry_bps as number) >= NO_MARKET_BPS) return { label: 'NO MARKET', color: T.faint, dot: false }
    if ((l.entry_bps as number) > 30) return { label: 'LIMITED', color: T.warn, dot: true }
    return { label: 'LIVE', color: T.accent, dot: true }
  }

  const filters: [string, string][] = [['all', 'All'], ['xStocks', 'xStocks'], ['Ondo', 'Ondo'], ['Backpack', 'Backpack']]

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={view === 'list' ? rows : []}
      keyExtractor={(r) => r.token.symbol}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={T.dim} />}
      ListHeaderComponent={
        <View style={{ gap: 11 }}>
          <View style={s.header}>
            <View>
              <Text style={s.title}>Markets</Text>
              <Text style={s.sub}>Tokenized equities · {rows.length} tokens</Text>
            </View>
            <View style={s.live}>
              <View style={[s.dot, { backgroundColor: open ? T.accent : T.warn }]} />
              <Text style={s.liveText}>{open ? 'LIVE' : 'CLOSED'}</Text>
            </View>
          </View>

          <View style={s.toggle}>
            {(['list', 'map'] as const).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} style={[s.toggleBtn, view === v && s.toggleOn]}>
                <Text style={[s.toggleText, view === v && s.toggleTextOn]}>{v === 'list' ? 'Assets' : 'Cost map'}</Text>
              </Pressable>
            ))}
          </View>

          {view === 'list' ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search ticker"
                placeholderTextColor={T.faint}
                autoCapitalize="characters"
                style={s.search}
              />
              <View style={s.filters}>
                {filters.map(([key, label]) => (
                  <Pressable key={key} onPress={() => setFilter(key)} style={[s.chip, filter === key && s.chipOn]}>
                    <Text style={[s.chipText, filter === key && s.chipTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <CostMap groups={groups} latest={latest} filter={mapFilter} onFilter={setMapFilter} />
          )}

          {error && <Text style={s.warn}>{error}</Text>}
        </View>
      }
      renderItem={({ item }) => {
        const { token, l, spark } = item
        const st = statusFor(l)
        const ok = isUsable(l?.entry_bps, l?.quotable)
        return (
          <Pressable style={s.card} onPress={() => router.push(`/passport?symbol=${token.symbol}`)}>
            <View style={s.cardTop}>
              <TokenIcon icon={token.icon} symbol={token.symbol} label={token.ticker} issuer={token.issuer} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={s.symbol}>{token.symbol}</Text>
                <Text style={[s.issuer, { color: issuerColor(token.issuer) }]}>{token.issuer}</Text>
              </View>
              <Text style={[s.status, { color: st.color }]}>{st.dot ? '● ' : '○ '}{st.label}</Text>
            </View>

            <View style={s.cardBottom}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>entry</Text>
                <Text style={[s.metricValue, num, !ok && { color: T.faint }]}>{ok ? `${l!.entry_bps} bps` : '—'}</Text>
              </View>
              <View style={s.metric}>
                <Text style={s.metricLabel}>exit</Text>
                <Text style={[s.metricValue, num, !ok && { color: T.faint }]}>{ok ? `${l!.exit_bps} bps` : '—'}</Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {spark ? (
                  <Spark values={spark} color={issuerColor(token.issuer)} />
                ) : ok ? (
                  <View style={{ width: 64, height: 24 }} />
                ) : (
                  <Text style={s.noQuote}>No executable quote</Text>
                )}
              </View>
            </View>
          </Pressable>
        )
      }}
    />
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8 },
  title: { color: T.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  sub: { color: T.faint, fontSize: 13, marginTop: 2 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  toggle: { flexDirection: 'row', backgroundColor: T.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: T.border },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  toggleOn: { backgroundColor: T.accent },
  toggleText: { color: T.dim, fontSize: 14, fontWeight: '600' },
  toggleTextOn: { color: T.bg, fontWeight: '700' },

  search: { backgroundColor: T.surface, borderRadius: 14, borderWidth: 1, borderColor: T.border, color: T.text, paddingHorizontal: 14, height: 46, fontSize: 15 },
  filters: { flexDirection: 'row', gap: 8 },
  chip: { borderRadius: 13, borderWidth: 1, borderColor: T.border, paddingHorizontal: 13, paddingVertical: 8 },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.dim, fontSize: 13, fontWeight: '600' },
  chipTextOn: { color: T.bg, fontWeight: '700' },

  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, gap: 12, marginBottom: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  status: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 22 },
  metric: { gap: 1 },
  metricLabel: { color: T.faint, fontSize: 12 },
  metricValue: { color: T.text, fontSize: 19, fontWeight: '700' },
  noQuote: { color: T.faint, fontSize: 12 },

  warn: { color: T.warn, fontSize: 13 },
})
