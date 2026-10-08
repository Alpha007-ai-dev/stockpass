import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { num, T } from '@/constants/theme'
import { Anomaly, getAnomaly } from '@/lib/anomaly'

const bps = (v: number) => (v < 0.5 ? '~0 bps' : `${Math.round(v)} bps`)

/** Shown on a token's Passport only while its latest measured cost is outside its own usual range. */
export function AnomalyCard({ symbol }: { symbol: string }) {
  const [a, setA] = useState<Anomaly | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let live = true
    setA(null); setOpen(false)
    getAnomaly(symbol).then((r) => { if (live) setA(r) }).catch(() => {})
    return () => { live = false }
  }, [symbol])

  if (!a) return null
  const e = a.evidence
  const cheaper = a.direction === 'below'
  const color = cheaper ? T.accent : T.warn
  const text =
    a.explanation ??
    `The latest measured cost is ${cheaper ? 'below' : 'above'} the recent range of ${bps(e.typical_low_bps)} to ${bps(e.typical_high_bps)} (${e.observations} observations). StockPass has not identified a cause. This is a data observation, not a price forecast.`

  return (
    <View style={[s.card, { borderColor: color }]}>
      <Text style={[s.kicker, { color }]}>{cheaper ? 'CHEAPER THAN USUAL' : 'COSTLIER THAN USUAL'}</Text>
      <View style={s.row}>
        <View>
          <Text style={s.label}>LATEST MEASURED COST</Text>
          <Text style={[s.value, num, { color }]}>{bps(e.current_entry_bps)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.label}>USUAL</Text>
          <Text style={[s.usual, num]}>{bps(e.typical_low_bps)} – {bps(e.typical_high_bps)}</Text>
        </View>
      </View>
      <Pressable onPress={() => setOpen((v) => !v)}>
        <Text style={s.toggle}>{open ? 'Hide' : 'Why is this unusual?'}</Text>
      </Pressable>
      {open && (
        <>
          <Text style={s.body}>{text}</Text>
          {e.next_earnings && <Text style={s.tiny}>Next earnings: {e.next_earnings}</Text>}
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  label: { color: T.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  usual: { color: T.dim, fontSize: 16, fontWeight: '600', marginTop: 2 },
  toggle: { color: T.dim, fontSize: 14, fontWeight: '600' },
  body: { color: T.dim, fontSize: 14, lineHeight: 20 },
  tiny: { color: T.faint, fontSize: 12 },
})
