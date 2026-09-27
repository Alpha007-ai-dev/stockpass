import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { num, T } from '../constants/theme'
import { isUsable } from '../lib/cost'
import { Latest } from '../lib/stats'
import { Pair } from '../lib/pairs'

export type MapFilter = 'all' | 'x' | 'on' | 'none'

type Tile = { ticker: string; cost: number | null; issuer: string | null; age: number }

function tint(cost: number | null): { bg: string; fg: string } {
  if (cost === null) return { bg: '#1A1A18', fg: T.faint }
  if (cost <= 15) return { bg: '#26331A', fg: '#C8EE62' }
  if (cost <= 30) return { bg: '#2E2A14', fg: '#E4C75A' }
  return { bg: '#33210F', fg: '#F08C5A' }
}

export function CostMap({
  pairs, latest, filter, onFilter,
}: {
  pairs: Pair[]
  latest: Record<string, Latest>
  filter: MapFilter
  onFilter: (f: MapFilter) => void
}) {
  const router = useRouter()
  const now = Date.now() / 1000

  const all: Tile[] = pairs.map((p) => {
    const lx = p.x ? latest[p.x.symbol] : undefined
    const lon = p.on ? latest[p.on.symbol] : undefined
    const xOk = isUsable(lx?.entry_bps, lx?.quotable)
    const onOk = isUsable(lon?.entry_bps, lon?.quotable)
    const best = xOk && onOk ? (lx!.entry_bps! <= lon!.entry_bps! ? lx! : lon!) : xOk ? lx! : onOk ? lon! : null
    return { ticker: p.ticker, cost: best ? best.entry_bps : null, issuer: best ? best.issuer : null, age: best ? now - best.ts : 0 }
  })

  const viaX = all.filter((t) => t.issuer === 'xStocks').length
  const viaOn = all.filter((t) => t.issuer === 'Ondo').length
  const noQuote = all.filter((t) => t.cost === null).length

  const tiles = all.filter((t) =>
    filter === 'all' ? true : filter === 'x' ? t.issuer === 'xStocks' : filter === 'on' ? t.issuer === 'Ondo' : t.cost === null,
  )

  const chips: [MapFilter, string][] = [['all', 'All'], ['x', 'xStocks cheaper'], ['on', 'Ondo cheaper'], ['none', 'No quote']]

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={s.title}>{all.length} tokenized stocks</Text>
        <Text style={s.sub}>What does it cost to enter right now?</Text>
      </View>

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={[s.statNum, num, { color: T.accent }]}>{viaX}</Text>
          <Text style={s.statLabel}>cheaper via xStocks</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statNum, num]}>{noQuote}</Text>
          <Text style={s.statLabel}>no quote</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statNum, num, { color: '#F08C5A' }]}>{viaOn}</Text>
          <Text style={s.statLabel}>cheaper via Ondo</Text>
        </View>
      </View>

      <View style={s.chips}>
        {chips.map(([key, label]) => (
          <Pressable key={key} onPress={() => onFilter(key)} style={[s.chip, filter === key && s.chipOn]}>
            <Text style={[s.chipText, filter === key && s.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={s.grid}>
        {tiles.map((t) => {
          const c = tint(t.cost)
          return (
            <Pressable key={t.ticker} style={[s.tile, { backgroundColor: c.bg }, t.age > 2400 && s.stale]}
              onPress={() => router.push(`/compare?ticker=${t.ticker}`)}>
              <Text style={[s.tileTicker, { color: c.fg }]} numberOfLines={1}>{t.ticker}</Text>
              <Text style={[s.tileCost, num, { color: c.fg }]}>{t.cost === null ? '—' : t.cost}</Text>
              <Text style={[s.tileUnit, { color: c.fg }]}>{t.cost === null ? 'no quote' : 'bps'}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#C8EE62' }]} /><Text style={s.legendText}>≤15 bps</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#E4C75A' }]} /><Text style={s.legendText}>16–30</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#F08C5A' }]} /><Text style={s.legendText}>&gt;30</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#3A3A36' }]} /><Text style={s.legendText}>No quote</Text></View>
      </View>

      <Text style={s.foot}>Entry cost at $1,000 through the cheaper issuer. Measured over the last 35 minutes.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  title: { color: T.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  sub: { color: T.dim, fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statNum: { color: T.text, fontSize: 24, fontWeight: '700' },
  statLabel: { color: T.faint, fontSize: 10, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.dim, fontSize: 12 },
  chipTextOn: { color: T.bg, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 62, height: 62, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stale: { opacity: 0.5 },
  tileTicker: { fontSize: 10, fontWeight: '700' },
  tileCost: { fontSize: 18, fontWeight: '700' },
  tileUnit: { fontSize: 9 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: T.faint, fontSize: 11 },
  foot: { color: T.faint, fontSize: 11 },
})
