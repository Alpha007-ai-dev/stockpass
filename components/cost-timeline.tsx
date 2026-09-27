import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { issuerColor, num, T } from '@/constants/theme'
import { getSeries, SeriesPoint } from '@/lib/stats'

const W = 320
const H = 150
const PAD_L = 34
const PAD_B = 22

export function CostTimeline({ ticker }: { ticker: string }) {
  const [hours, setHours] = useState(24)
  const [points, setPoints] = useState<SeriesPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getSeries(ticker, hours).then(setPoints).catch((e) => setError((e as Error).message))
  }, [ticker, hours])

  const valid = points.filter((p) => p.quotable && p.entry_bps !== null && p.entry_bps < 200)

  if (valid.length < 2) {
    return (
      <View style={s.card}>
        <Text style={s.title}>Entry cost over time</Text>
        <Text style={s.faint}>{error ?? 'Collecting measurements…'}</Text>
      </View>
    )
  }

  const t0 = valid[0].ts
  const t1 = valid[valid.length - 1].ts
  const maxY = Math.max(40, ...valid.map((p) => p.entry_bps as number))
  const px = (ts: number) => PAD_L + ((ts - t0) / Math.max(1, t1 - t0)) * (W - PAD_L - 8)
  const py = (v: number) => H - PAD_B - (v / maxY) * (H - PAD_B - 10)

  const issuers = [...new Set(valid.map((p) => p.issuer))]
  const series = issuers.map((issuer) => {
    const pts = valid.filter((p) => p.issuer === issuer)
    const d = pts.length > 1
      ? pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.ts).toFixed(1)},${py(p.entry_bps as number).toFixed(1)}`).join(' ')
      : ''
    const avg = pts.length ? Math.round(pts.reduce((n, p) => n + (p.entry_bps as number), 0) / pts.length) : null
    return { issuer, pts, d, avg, color: issuerColor(issuer) }
  })

  const closed: { from: number; to: number }[] = []
  let start: number | null = null
  points.forEach((p) => {
    const isClosed = p.market_state !== 'open'
    if (isClosed && start === null) start = p.ts
    if (!isClosed && start !== null) { closed.push({ from: start, to: p.ts }); start = null }
  })
  if (start !== null) closed.push({ from: start, to: t1 })

  const updatedMin = Math.round((Date.now() / 1000 - t1) / 60)

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.title}>Entry cost over time ($1,000 test size)</Text>
        <View style={s.toggle}>
          {[24, 168].map((h) => (
            <Pressable key={h} onPress={() => setHours(h)} style={[s.tab, hours === h && s.tabOn]}>
              <Text style={[s.tabText, hours === h && s.tabTextOn]}>{h === 24 ? '24H' : '7D'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Svg width={W} height={H}>
        {closed.map((c, i) => (
          <Rect key={i} x={px(c.from)} y={8} width={Math.max(1, px(c.to) - px(c.from))} height={H - PAD_B - 8} fill={T.surfaceAlt} />
        ))}
        {[0, maxY / 2, maxY].map((v, i) => (
          <Line key={i} x1={PAD_L} y1={py(v)} x2={W - 8} y2={py(v)} stroke={T.border} strokeWidth={1} />
        ))}
        {series.map((se) => (
          <Path key={se.issuer} d={se.d} stroke={se.color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ))}
        {series.map((se) =>
          se.pts.slice(-1).map((p) => (
            <Circle key={se.issuer} cx={px(p.ts)} cy={py(p.entry_bps as number)} r={4.5} fill={se.color} />
          )),
        )}
      </Svg>

      <View style={s.legend}>
        {series.map((se) => (
          <View key={se.issuer} style={s.legendItem}>
            <View style={[s.dot, { backgroundColor: se.color }]} />
            <Text style={s.legendText}>{se.issuer}{se.avg !== null ? ` ${se.avg} bps` : ''}</Text>
          </View>
        ))}
      </View>

      <Text style={s.faint}>{valid.length} measurements · updated {updatedMin} min ago · shaded = market closed</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  title: { color: T.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  toggle: { flexDirection: 'row', backgroundColor: T.border, borderRadius: 10, padding: 2 },
  tab: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tabOn: { backgroundColor: T.accent },
  tabText: { color: T.dim, fontSize: 12, fontWeight: '600' },
  tabTextOn: { color: T.bg },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: T.dim, fontSize: 12 },
  faint: { color: T.faint, fontSize: 12 },
})


