import { StyleSheet, Text, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { num, T } from '@/constants/theme'
import { Latest } from '@/lib/stats'

function tokenLabel(row: Latest, fallback: string) {
  const r = row as Latest & { symbol?: string; issuer?: string }
  return r.symbol || r.issuer || fallback
}

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
  const rawGap = rawMine > 0 ? Math.abs(Math.round((rawPeer / rawMine - 1) * 10000)) : 0
  const minePx = mine.buy_px ?? 0
  const peerPx = peer.buy_px ?? 0
  const normGap = minePx > 0 ? Math.abs(Math.round((peerPx / minePx - 1) * 10000)) : 0
  const differentAmounts = Math.abs(mine.multiplier - peer.multiplier) > 0.0001
  const shrinks = differentAmounts && rawGap - normGap >= 3
  const closed = Boolean(reference?.stale)

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

      <View style={s.priceRow}>
        <View style={s.priceBox}>
          <Text style={s.label}>{symbol}</Text>
          <Text style={[s.price, num]}>${rawMine.toFixed(2)}</Text>
        </View>
        <View style={s.priceBox}>
          <Text style={s.label}>{tokenLabel(peer, 'Other')}</Text>
          <Text style={[s.price, num]}>${rawPeer.toFixed(2)}</Text>
        </View>
      </View>
      <Text style={s.gapLabel}>RAW TOKEN PRICE</Text>

      <View style={s.gapStack}>
        <Text style={[s.gapBad, num]}>{rawGap} bps</Text>
        <Text style={s.gapLabel}>RAW PRICE GAP</Text>
        <Text style={s.arrow}>&#8595;</Text>
        <Text style={[s.gapGood, num]}>{normGap} bps</Text>
        <Text style={[s.gapLabel, { color: T.accent }]}>NORMALIZED GAP</Text>
      </View>

      {shrinks && (
        <View style={s.why}>
          <Text style={s.whyTitle}>Why does the price difference disappear?</Text>
          <Text style={s.whyBody}>These tokens represent different amounts of the same stock. A lower token price doesn't necessarily mean a cheaper stock.</Text>
        </View>
      )}

      {closed && (
        <Text style={s.tiny}>Traditional market is closed. These are the last on-chain quotes.</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: 'transparent', paddingVertical: 20, gap: 10, overflow: 'hidden' },
  glow: { position: 'absolute', right: -6, top: -8 },
  kicker: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  priceRow: { flexDirection: 'row', gap: 12 },
  priceBox: { flex: 1 },
  label: { color: T.faint, fontSize: 12 },
  price: { color: T.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  gapStack: { alignItems: 'center', gap: 2, marginTop: 4 },
  gapBad: { color: T.faint, fontSize: 26, fontWeight: '800', textDecorationLine: 'line-through' },
  gapGood: { color: T.accent, fontSize: 48, fontWeight: '800', letterSpacing: -1.6 },
  gapLabel: { color: T.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  arrow: { color: T.dim, fontSize: 20, marginVertical: 4 },
  why: { gap: 6, borderTopWidth: 1, borderTopColor: '#1F231F', paddingTop: 12, marginTop: 4 },
  whyTitle: { color: T.text, fontSize: 15, fontWeight: '700' },
  whyBody: { color: T.dim, fontSize: 13, lineHeight: 18 },
  tiny: { color: T.faint, fontSize: 11, marginTop: 4 },
})
