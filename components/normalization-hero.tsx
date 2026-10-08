import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { Latest } from '@/lib/stats'

function tokenLabel(row: Latest, fallback: string) {
  const r = row as Latest & { symbol?: string; issuer?: string }
  return r.symbol || r.issuer || fallback
}

export function NormalizationHero({
  symbol, mine, peer, reference, total = 2, ticker,
}: {
  symbol: string
  mine: Latest
  peer: Latest
  reference: any | null
  total?: number
  ticker?: string
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
  const router = useRouter()
  const bothOk = isUsable(mine.entry_bps, mine.quotable) && isUsable(peer.entry_bps, peer.quotable)
  const peerCheaper = bothOk && normGap >= 5 && peerPx < minePx
  const mineCheaper = bothOk && normGap >= 5 && minePx < peerPx

  return (
    <View style={s.card}>
      <Text style={s.kicker}>{total > 2 ? `SAME STOCK, ${total} TOKENS` : 'SAME STOCK, TWO TOKENS'}</Text>
      {total > 2 && <Text style={s.tiny}>Compared with the cheapest of the other {total - 1}.</Text>}

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
      <Text style={s.gapLabel}>PRICE PER TOKEN</Text>

      <View style={s.gapStack}>
        {shrinks && <Text style={[s.gapBad, num]}>{rawGap} bps</Text>}
        {shrinks && <Text style={s.gapLabel}>PRICE DIFFERENCE AS LISTED</Text>}
        {shrinks && <Text style={s.arrow}>&#8595;</Text>}
        <Text style={[s.gapGood, num]}>{normGap} bps</Text>
        <Text style={[s.gapLabel, { color: T.accent, textAlign: 'center' }]}>{shrinks ? 'DIFFERENCE AFTER ADJUSTING FOR TOKEN SIZE' : 'PRICE DIFFERENCE BETWEEN THE TWO TOKENS'} ({(normGap / 100).toFixed(2)}%)</Text>
      </View>

      {peerCheaper && (
        <Pressable onPress={() => router.push(`/passport?symbol=${peer.symbol}`)}>
          <Text style={s.cheaper}>{tokenLabel(peer, 'Other')} is {normGap} bps cheaper to buy right now, entry costs included. View it ›</Text>
        </Pressable>
      )}
      {mineCheaper && (
        <Text style={s.cheaper}>{symbol} is {normGap} bps cheaper to buy right now, entry costs included.</Text>
      )}

      {shrinks && (
        <View style={s.why}>
          <Text style={s.whyTitle}>Why is the difference smaller after adjusting?</Text>
          <Text style={s.whyBody}>These tokens represent different amounts of the same stock. A lower token price doesn't necessarily mean a cheaper stock.</Text>
        </View>
      )}

      {total > 2 && ticker && (
        <Pressable onPress={() => router.push(`/compare?ticker=${ticker}`)}>
          <Text style={s.cheaper}>Compare all {total} issuers ›</Text>
        </Pressable>
      )}

      <Text style={s.tiny}>The difference is what you pay per share. The cost below is half the round-trip spread, measured on each token's own price.</Text>

      {closed && (
        <Text style={s.tiny}>Wall Street is closed, so these are the latest prices we measured on Solana.</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: 'transparent', paddingVertical: 20, gap: 10, overflow: 'hidden' },
  glow: { position: 'absolute', right: -6, top: -4 },
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
  cheaper: { color: T.accent, fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 6 },
})
