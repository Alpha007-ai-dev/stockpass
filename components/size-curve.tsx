import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { num, T } from '@/constants/theme'
import { getSizeCurve, SizeCurve as Curve } from '@/lib/insights'

const usd = (n: number) => `$${n.toLocaleString()}`

/** Average measured entry cost at each trade size, for the current market state. */
export function SizeCurve({ symbol, state }: { symbol: string; state: string }) {
  const [curve, setCurve] = useState<Curve | null>(null)
  useEffect(() => {
    setCurve(null)
    getSizeCurve(symbol, state).then(setCurve)
  }, [symbol, state])

  if (!curve || curve.points.length < 2) return null
  const pts = curve.points
  const max = Math.max(1, ...pts.map((p) => p.entry_bps))
  const first = pts[0]
  const last = pts[pts.length - 1]
  const gap = Math.round((last.entry_bps - first.entry_bps) * 10) / 10

  return (
    <View style={s.card}>
      <Text style={s.kicker}>COST BY TRADE SIZE</Text>
      {pts.map((p) => (
        <View key={p.size_usd} style={s.row}>
          <Text style={s.label}>{usd(p.size_usd)}</Text>
          <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, Math.round((p.entry_bps / max) * 100))}%` }]} /></View>
          <Text style={[s.value, num]}>{p.entry_bps < 0.5 ? '~0' : p.entry_bps.toFixed(1)}</Text>
        </View>
      ))}
      <Text style={s.tiny}>
        {Math.abs(gap) >= 1
          ? `${usd(last.size_usd)} costs ${Math.abs(gap)} bps ${gap > 0 ? 'more' : 'less'} than ${usd(first.size_usd)}. `
          : `Cost barely changes between ${usd(first.size_usd)} and ${usd(last.size_usd)}. `}
        Average of the last {curve.window_days} days, same market state as now. Bps of the trade value.
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, gap: 10 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: T.dim, fontSize: 13, width: 64 },
  track: { flex: 1, height: 8, backgroundColor: T.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: T.accent, borderRadius: 4 },
  value: { color: T.text, fontSize: 13, fontWeight: '700', width: 40, textAlign: 'right' },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
})
