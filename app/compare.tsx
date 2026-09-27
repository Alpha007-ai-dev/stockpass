import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { num, T } from '../constants/theme'
import { isUsable, NO_MARKET_BPS } from '../lib/cost'
import { compact, getStats, Latest } from '../lib/stats'

export default function CompareScreen() {
  const router = useRouter()
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const tk = ticker ?? 'SPY'
  const [x, setX] = useState<Latest | null>(null)
  const [on, setOn] = useState<Latest | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((s) => {
        setX(s.latest.find((r) => r.symbol === `${tk}x`) ?? null)
        setOn(s.latest.find((r) => r.symbol === `${tk}on`) ?? null)
      })
      .catch((e) => setError((e as Error).message))
  }, [tk])

  const xOk = isUsable(x?.entry_bps, x?.quotable)
  const onOk = isUsable(on?.entry_bps, on?.quotable)
  const best = xOk && onOk ? (x!.entry_bps! <= on!.entry_bps! ? 'x' : 'on') : xOk ? 'x' : onOk ? 'on' : null
  const diff = xOk && onOk ? Math.abs(x!.entry_bps! - on!.entry_bps!) : null
  const maxBps = Math.max(x?.entry_bps ?? 0, on?.entry_bps ?? 0, 1)
  const multiDiff = x && on ? Math.abs(x.multiplier - on.multiplier) > 0.0002 : false

  const Card = ({ l, symbol, issuer, isBest }: { l: Latest | null; symbol: string; issuer: string; isBest: boolean }) => {
    const ok = isUsable(l?.entry_bps, l?.quotable)
    const bar = (v: number | null) => (v === null ? 0 : Math.max(6, Math.round((v / maxBps) * 100)))
    return (
      <View style={[s.card, isBest && s.cardBest]}>
        <Text style={s.symbol}>{symbol}</Text>
        <Text style={s.issuer}>{issuer}</Text>

        <Text style={s.metaLabel}>Per-share price</Text>
        <Text style={[s.price, num]}>{l?.buy_px ? `$${l.buy_px.toFixed(2)}` : '—'}</Text>

        <Text style={s.metaLabel}>Entry cost</Text>
        <Text style={[s.cost, num]}>{ok ? `${l!.entry_bps} bps` : l?.quotable ? 'no real market' : 'no quote'}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${bar(ok ? l!.entry_bps : null)}%`, backgroundColor: isBest ? T.accent : '#5C8FD6' }]} /></View>

        <Text style={s.metaLabel}>Exit cost</Text>
        <Text style={[s.cost, num]}>{ok ? `${l!.exit_bps} bps` : '—'}</Text>
        <View style={s.track}><View style={[s.fill, { width: `${bar(ok ? l!.exit_bps : null)}%`, backgroundColor: isBest ? T.accent : '#5C8FD6' }]} /></View>

        <Text style={s.metaLabel}>Multiplier</Text>
        <Text style={[s.meta, num]}>{l ? `${l.multiplier.toFixed(4)}x` : '—'}</Text>

        <Text style={s.metaLabel}>Supply</Text>
        <Text style={[s.meta, num]}>{l ? compact(l.supply) : '—'}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}><Text style={s.backText}>‹ Back</Text></Pressable>

      <Text style={s.h1}>Compare</Text>
      <Text style={s.h2}>Same underlying.{'\n'}Different representation.</Text>
      <Text style={s.faint}>{tk}</Text>

      <View style={s.cards}>
        <Card l={x} symbol={`${tk}x`} issuer="xStocks" isBest={best === 'x'} />
        <Card l={on} symbol={`${tk}on`} issuer="Ondo" isBest={best === 'on'} />
      </View>

      <View style={s.banner}>
        {diff !== null && diff > 0 ? (
          <>
            <Text style={s.bannerStrong}>
              {best === 'x' ? 'xStocks' : 'Ondo'} is {diff} bps cheaper to enter right now for {tk}.
            </Text>
            <Text style={s.faint}>${((diff / 10000) * 1000).toFixed(2)} on a $1,000 position, before our fee.</Text>
          </>
        ) : best ? (
          <Text style={s.bannerStrong}>Only {best === 'x' ? 'xStocks' : 'Ondo'} has a usable quote right now.</Text>
        ) : (
          <Text style={s.bannerStrong}>Neither issuer has a usable quote right now.</Text>
        )}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Why is there a difference?</Text>
        <Text style={s.body}>
          Ondo quotes come from RFQ market makers, while xStocks trades in on-chain pools. This can lead to different
          spreads and liquidity conditions, and it changes with the market session.
        </Text>
        {multiDiff && (
          <Text style={s.body}>
            The two issuers also apply different multipliers ({x!.multiplier.toFixed(4)}x vs {on!.multiplier.toFixed(4)}x),
            so their raw token prices are not directly comparable. The prices above are per share.
          </Text>
        )}
      </View>

      {best && (
        <Pressable style={s.primary} onPress={() => router.push(`/buy?ticker=${tk}`)}>
          <Text style={s.primaryText}>Buy via {best === 'x' ? 'xStocks' : 'Ondo'}</Text>
        </Pressable>
      )}

      <Text style={s.faint}>{error ?? (x ? `Last measured ${new Date(x.ts * 1000).toLocaleString()}` : '')}</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  h1: { color: T.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  h2: { color: T.text, fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  cards: { flexDirection: 'row', gap: 12 },
  card: { flex: 1, backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 3 },
  cardBest: { borderColor: T.accent, borderWidth: 1.5 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { color: T.dim, fontSize: 13, marginBottom: 8 },
  metaLabel: { color: T.faint, fontSize: 11, marginTop: 8 },
  price: { color: T.text, fontSize: 19, fontWeight: '700' },
  cost: { color: T.text, fontSize: 17, fontWeight: '600' },
  meta: { color: T.text, fontSize: 14, fontWeight: '500' },
  track: { height: 5, borderRadius: 3, backgroundColor: T.border, marginTop: 5 },
  fill: { height: 5, borderRadius: 3 },
  banner: { backgroundColor: '#1F2A12', borderRadius: 16, padding: 14, gap: 4 },
  bannerStrong: { color: T.accent, fontSize: 15, fontWeight: '600' },
  section: { gap: 8, marginTop: 4 },
  sectionTitle: { color: T.text, fontSize: 16, fontWeight: '600' },
  body: { color: T.dim, fontSize: 13, lineHeight: 19 },
  faint: { color: T.faint, fontSize: 12 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})

