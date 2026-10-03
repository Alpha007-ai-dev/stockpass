import { useCallback, useEffect, useMemo, useState } from 'react'
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native'
import { useRouter } from 'expo-router'
import Svg, { Path } from 'react-native-svg'
import { CostMap, MapFilter } from '@/components/cost-map'
import { ReliabilityMap } from '@/components/reliability-map'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { ErrorState } from '@/components/error-state'
import { isUsable, NO_MARKET_BPS } from '@/lib/cost'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups, Group } from '@/lib/pairs'
import { getSeries, getStats, History, Latest, SeriesPoint, TokenRow } from '@/lib/stats'
import { EarningsIcon } from '@/components/event-icons'

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
  const [hist, setHist] = useState<Record<string, History>>({})
  const [events, setEvents] = useState<Record<string, { date: string; detail: string | null }>>({})
  const [sparks, setSparks] = useState<Record<string, number[]>>({})
  const [filter, setFilter] = useState<string>('all')
  const [mapFilter, setMapFilter] = useState<MapFilter>('all')
  const [query, setQuery] = useState('')
  const [view, setView] = useState<'list' | 'map' | 'issuers'>('list')
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
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setHist(h)
      setGroups(allGroups)
    } catch (e) {
      setError((e as Error).message)
    }
    setLoading(false)
  }, [state])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch('https://stockpass-collector.stockpass-dev.workers.dev/underlying')
      .then((r) => r.json())
      .then((j: any) => {
        const m: Record<string, { date: string; detail: string | null }> = {}
        for (const e of j?.upcoming ?? []) {
          if (e.kind !== 'earnings') continue
          if (!m[e.ticker]) m[e.ticker] = { date: e.event_date, detail: e.detail ?? null }
        }
        setEvents(m)
      })
      .catch(() => {})
  }, [])

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
    const visible = rows.slice(0, 30).map((r) => r.token)
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
            {(['list', 'map', 'issuers'] as const).map((v) => (
              <Pressable key={v} onPress={() => setView(v)} style={[s.toggleBtn, view === v && s.toggleOn]}>
                <Text style={[s.toggleText, view === v && s.toggleTextOn]}>{v === 'list' ? 'Assets' : v === 'map' ? 'Cost map' : 'Issuers'}</Text>
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
          ) : view === 'map' ? (
            <CostMap groups={groups} latest={latest} filter={mapFilter} onFilter={setMapFilter} />
          ) : (
            <ReliabilityMap />
          )}

          {error && <ErrorState message={error} onRetry={load} />}
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
              <View style={{ alignItems: 'flex-end', gap: 3 }}>
                <Text style={[s.price, num]}>{l?.buy_px ? `$${l.buy_px.toFixed(2)}` : '—'}</Text>
                <Text style={[s.status, { color: st.color }]}>{st.dot ? '● ' : '○ '}{st.label}</Text>
              </View>
            </View>

            {(() => {
              const ev = events[token.ticker]
              if (!ev) return null
              const days = Math.round((new Date(ev.date + 'T12:00:00Z').getTime() - Date.now()) / 86400000)
              if (days < 0 || days > 30) return null
              return (
                <View style={s.eventBadge}>
                  <EarningsIcon size={15} color="#A78BFA" />
                  <Text style={s.eventText}>
                    Earnings {new Date(ev.date + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    {days <= 7 ? ` · in ${days}d` : ''}
                  </Text>
                </View>
              )
            })()}

            <View style={s.cardBottom}>
              <View style={s.metric}>
                <Text style={s.metricLabel}>entry/exit</Text>
                <Text style={[s.metricValue, num, !ok && { color: T.faint }]}>
                  {!ok ? '—' : l!.entry_bps < 0 ? '~0 bps' : l!.entry_bps === l!.exit_bps ? `${l!.entry_bps} bps` : `${l!.entry_bps} / ${l!.exit_bps} bps`}
                </Text>
              </View>
              {(() => {
                const h = hist[token.symbol]
                if (!h || h.samples < 3 || h.avg_entry === null) return null
                return (
                  <View style={s.metric}>
                    <Text style={s.metricLabel}>usual</Text>
                    <Text style={[s.metricValue, num, { color: T.dim }]}>{h.avg_entry.toFixed(0)} bps</Text>
                  </View>
                )
              })()}
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                {spark ? (
                  <Spark values={spark} color={issuerColor(token.issuer)} />
                ) : ok ? (
                  <Text style={s.collecting}>collecting</Text>
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
  price: { color: T.text, fontSize: 17, fontWeight: '700' },
  status: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  eventBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: '#1E1A2E', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  eventText: { color: '#A78BFA', fontSize: 13, fontWeight: '600' },
  cardBottom: { flexDirection: 'row', alignItems: 'flex-end', gap: 22 },
  metric: { gap: 1 },
  metricLabel: { color: T.faint, fontSize: 12 },
  metricValue: { color: T.text, fontSize: 19, fontWeight: '700' },
  noQuote: { color: T.faint, fontSize: 12 },
  collecting: { color: T.faint, fontSize: 11, fontStyle: 'italic' },

  warn: { color: T.warn, fontSize: 13 },
})










