import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { costTint, ISSUER_COLOR, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { Group } from '@/lib/pairs'
import { Latest } from '@/lib/stats'

export type MapFilter = 'all' | 'xStocks' | 'Ondo' | 'Backpack' | 'none'

type Tile = { ticker: string; cost: number | null; issuer: string | null; age: number; count: number }

const tint = costTint

export function CostMap({
  groups, latest, filter, onFilter,
}: {
  groups: Group[]
  latest: Record<string, Latest>
  filter: MapFilter
  onFilter: (f: MapFilter) => void
}) {
  const router = useRouter()
  const now = Date.now() / 1000

  const all: Tile[] = groups.map((g) => {
    const usable = g.tokens
      .map((t) => latest[t.symbol])
      .filter((l) => l && isUsable(l.entry_bps, l.quotable)) as Latest[]
    const best = usable.length ? usable.reduce((a, b) => (a.entry_bps! <= b.entry_bps! ? a : b)) : null
    return {
      ticker: g.ticker,
      cost: best ? best.entry_bps : null,
      issuer: best ? best.issuer : null,
      age: best ? now - best.ts : 0,
      count: g.tokens.length,
    }
  })

  const counts: Record<string, number> = { xStocks: 0, Ondo: 0, Backpack: 0 }
  all.forEach((t) => { if (t.issuer) counts[t.issuer] = (counts[t.issuer] ?? 0) + 1 })
  const noQuote = all.filter((t) => t.cost === null).length

  const tiles = all.filter((t) => (filter === 'all' ? true : filter === 'none' ? t.cost === null : t.issuer === filter))

  const chips: [MapFilter, string][] = [
    ['all', 'All'],
    ['xStocks', `xStocks ${counts.xStocks}`],
    ['Ondo', `Ondo ${counts.Ondo}`],
    ['Backpack', `Backpack ${counts.Backpack}`],
    ['none', `No quote ${noQuote}`],
  ]

  return (
    <View style={{ gap: 12 }}>
      <View>
        <Text style={s.title}>{all.length} tokenized stocks</Text>
        <Text style={s.sub}>What does it cost to enter right now?</Text>
      </View>

      <View style={s.stats}>
        <View style={s.stat}>
          <Text style={[s.statNum, num, { color: ISSUER_COLOR.xStocks }]}>{counts.xStocks}</Text>
          <Text style={s.statLabel}>xStocks{'\n'}cheapest</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statNum, num, { color: ISSUER_COLOR.Ondo }]}>{counts.Ondo}</Text>
          <Text style={s.statLabel}>Ondo{'\n'}cheapest</Text>
        </View>
        <View style={s.stat}>
          <Text style={[s.statNum, num, { color: ISSUER_COLOR.Backpack }]}>{counts.Backpack}</Text>
          <Text style={s.statLabel}>Backpack{'\n'}cheapest</Text>
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
              <Text style={[s.tileUnit, { color: c.fg }]}>{t.cost === null ? 'no quote' : `bps · ${t.count}`}</Text>
            </Pressable>
          )
        })}
      </View>

      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#5BE585' }]} /><Text style={s.legendText}>≤15 bps</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#F5C451' }]} /><Text style={s.legendText}>16–30</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#FB8A5C' }]} /><Text style={s.legendText}>&gt;30</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: '#3A3A36' }]} /><Text style={s.legendText}>No quote</Text></View>
      </View>

      <Text style={s.foot}>Cheapest entry cost at $1,000 across all issuers. The small number is how many issuers exist for that stock.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  title: { color: T.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  sub: { color: T.dim, fontSize: 13, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, paddingVertical: 12, alignItems: 'center', gap: 2 },
  statNum: { color: T.text, fontSize: 26, fontWeight: '700' },
  statLabel: { color: T.faint, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 16, borderWidth: 1, borderColor: T.border, paddingHorizontal: 12, paddingVertical: 7 },
  chipOn: { backgroundColor: T.accent, borderColor: T.accent },
  chipText: { color: T.dim, fontSize: 12 },
  chipTextOn: { color: T.bg, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: 62, height: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stale: { opacity: 0.5 },
  tileTicker: { fontSize: 11, fontWeight: '700' },
  tileCost: { fontSize: 18, fontWeight: '700' },
  tileUnit: { fontSize: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: T.faint, fontSize: 12 },
  foot: { color: T.faint, fontSize: 13, lineHeight: 19 },
})



