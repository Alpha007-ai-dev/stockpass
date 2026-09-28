import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { num, T } from '@/constants/theme'
import { Latest } from '@/lib/stats'

export function NormalizationHero({
  symbol, mine, peer, reference,
}: {
  symbol: string
  mine: Latest
  peer: Latest
  reference: any | null
}) {
  const rawMine = (mine.buy_px ?? 0) * mine.multiplier
  const rawPeer = (peer.buy_px ?? 0) * peer.multiplier
  const rawGap = Math.abs(Math.round((rawPeer / rawMine - 1) * 10000))
  const normGap = Math.abs(Math.round(((peer.buy_px ?? 0) / (mine.buy_px ?? 1) - 1) * 10000))
  const premium = reference && mine.buy_px ? Math.round((mine.buy_px / Number(reference.mid) - 1) * 10000) : null

  return (
    <View style={s.card}>
      <Svg width={210} height={110} style={s.glow} pointerEvents="none">
        <Defs>
          <LinearGradient id="gw" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor={T.accent} stopOpacity="0.30" />
            <Stop offset="1" stopColor={T.accent} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d="M0,110 C60,104 110,72 150,46 C176,30 196,20 210,14 L210,110 Z" fill="url(#gw)" />
        <Path d="M0,110 C60,104 110,72 150,46 C176,30 196,20 210,14" stroke={T.accent} strokeWidth={2} strokeOpacity={0.45} fill="none" />
        <Path d="M0,110 C55,106 105,84 150,64 C176,52 196,44 210,40" stroke={T.accent} strokeWidth={1.5} strokeOpacity={0.18} fill="none" />
      </Svg>

      <Text style={s.kicker}>PRICE NORMALIZATION</Text>

      <View style={s.row}>
        <View style={s.left}>
          <Text style={s.label}>Raw token price</Text>
          <Text style={[s.raw, num]}>${rawMine.toFixed(2)}</Text>

          <Text style={[s.label, { marginTop: 14 }]}>Per-share price</Text>
          <Text style={[s.real, num]}>${(mine.buy_px ?? 0).toFixed(2)}</Text>
        </View>

        <View style={s.right}>
          <Text style={[s.gapBad, num]}>{rawGap} bps</Text>
          <Text style={s.gapLabel}>raw gap</Text>
          <Text style={s.arrow}>&#8595;</Text>
          <Text style={[s.gapGood, num]}>{normGap} bps</Text>
          <Text style={[s.gapLabel, { color: T.accent }]}>normalized gap</Text>
        </View>
      </View>

      {reference && (
        <View style={s.refRow}>
          <View style={s.refBox}>
            <Text style={s.label}>Traditional reference</Text>
            <Text style={[s.refValue, num]}>${Number(reference.mid).toFixed(2)}</Text>
            <Text style={s.tiny}>{reference.stale ? '(last close)' : '(live quote)'}</Text>
          </View>
          <View style={s.refBox}>
            <Text style={s.label}>On-chain premium</Text>
            <Text style={[s.refValue, num, !reference.stale && { color: T.accent }]}>
              {reference.stale ? '—' : `${premium! >= 0 ? '+' : ''}${premium} bps`}
            </Text>
            <Text style={s.tiny}>{reference.stale ? '(market closed)' : '(vs traditional mid)'}</Text>
          </View>
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: '#10160C', borderRadius: 22, borderWidth: 1.5, borderColor: '#2F4718', padding: 18, gap: 12, overflow: 'hidden' },
  glow: { position: 'absolute', right: -6, bottom: -6 },
  kicker: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  left: { flexShrink: 1 },
  right: { alignItems: 'flex-end', minWidth: 120 },
  label: { color: T.faint, fontSize: 12 },
  raw: { color: T.faint, fontSize: 18, fontWeight: '600', textDecorationLine: 'line-through', marginTop: 2 },
  real: { color: T.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  gapBad: { color: '#F87171', fontSize: 22, fontWeight: '800' },
  gapGood: { color: T.accent, fontSize: 38, fontWeight: '800', letterSpacing: -1.2 },
  gapLabel: { color: T.faint, fontSize: 12 },
  arrow: { color: T.dim, fontSize: 18, marginVertical: 6 },
  refRow: { flexDirection: 'row', gap: 12, borderTopWidth: 1, borderTopColor: '#26331A', paddingTop: 12, backgroundColor: '#10160C', marginHorizontal: -18, marginBottom: -18, paddingHorizontal: 18, paddingBottom: 18, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  refBox: { flex: 1 },
  refValue: { color: T.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
  tiny: { color: T.faint, fontSize: 11, marginTop: 1 },
})

