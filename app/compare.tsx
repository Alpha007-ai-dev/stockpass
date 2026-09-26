import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ISSUERS } from '../constants/issuers'
import { num, T } from '../constants/theme'
import { compact, getStats, History, Latest } from '../lib/stats'

const NO_MARKET_BPS = 200

export default function CompareScreen() {
  const router = useRouter()
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const tk = ticker ?? 'SPY'
  const [x, setX] = useState<Latest | null>(null)
  const [on, setOn] = useState<Latest | null>(null)
  const [hist, setHist] = useState<History[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((s) => {
        setX(s.latest.find((r) => r.symbol === `${tk}x`) ?? null)
        setOn(s.latest.find((r) => r.symbol === `${tk}on`) ?? null)
        setHist(s.history.filter((r) => r.ticker === tk))
      })
      .catch((e) => setError((e as Error).message))
  }, [tk])

  const usable = (l: Latest | null) => !!l && !!l.quotable && (l.entry_bps ?? 999) < NO_MARKET_BPS
  const bothPriced = x?.buy_px && on?.buy_px
  const rawGap = bothPriced ? Math.round(((on!.buy_px! * on!.multiplier) / (x!.buy_px! * x!.multiplier) - 1) * 10000) : null
  const normGap = bothPriced ? Math.round((on!.buy_px! / x!.buy_px! - 1) * 10000) : null
  const cheaper = usable(x) && usable(on) ? (x!.entry_bps! <= on!.entry_bps! ? 'xStocks' : 'Ondo') : usable(x) ? 'xStocks' : usable(on) ? 'Ondo' : null
  const diff = usable(x) && usable(on) ? Math.abs(x!.entry_bps! - on!.entry_bps!) : null

  const cost = (l: Latest | null) => {
    if (!l || !l.quotable) return 'no quote'
    if ((l.entry_bps ?? 0) >= NO_MARKET_BPS) return 'no real market'
    return `${l.entry_bps} bps`
  }
  const usual = (sym: string) => {
    const rows = hist.filter((h) => h.symbol === sym && h.avg_entry !== null)
    const total = rows.reduce((n, r) => n + r.samples, 0)
    if (total === 0) return null
    return rows.reduce((n, r) => n + (r.avg_entry ?? 0) * r.samples, 0) / total
  }

  const Col = ({ l, sym, issuer }: { l: Latest | null; sym: string; issuer: 'xStocks' | 'Ondo' }) => {
    const best = cheaper === issuer
    const u = usual(sym)
    return (
      <View style={[s.col, best && s.colBest]}>
        <Text style={s.colTitle}>{sym}</Text>
        <Text style={s.faint}>{issuer}</Text>
        <Text style={[s.colCost, num, best && s.accentText]}>{cost(l)}</Text>
        <Text style={s.faint}>{u ? `usual ${u.toFixed(0)} bps` : 'collecting'}</Text>
        <View style={s.colLine} />
        <Text style={s.faint}>Per share</Text>
        <Text style={[s.colValue, num]}>{l?.buy_px ? `$${l.buy_px.toFixed(2)}` : '—'}</Text>
        <Text style={s.faint}>Raw token</Text>
        <Text style={[s.colValue, num]}>{l?.buy_px ? `$${(l.buy_px * l.multiplier).toFixed(2)}` : '—'}</Text>
        <Text style={s.faint}>1 token = {l ? l.multiplier.toFixed(5) : '—'} sh</Text>
        <Text style={s.faint}>Supply {l ? compact(l.supply) : '—'}</Text>
      </View>
    )
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ Back</Text></Pressable>

      <Text style={s.kicker}>SAME UNDERLYING, DIFFERENT REPRESENTATION</Text>
      <Text style={s.title}>{tk}</Text>

      <View style={s.cols}>
        <Col l={x} sym={`${tk}x`} issuer="xStocks" />
        <Col l={on} sym={`${tk}on`} issuer="Ondo" />
      </View>

      {rawGap !== null && normGap !== null && (
        <View style={s.card}>
          {Math.abs(rawGap - normGap) >= 3 ? (
            <>
              <View style={s.row}>
                <Text style={s.label}>Raw-price gap</Text>
                <Text style={[s.gapMuted, num]}>{rawGap > 0 ? '+' : ''}{rawGap} bps</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Normalized gap</Text>
                <Text style={[s.gapAccent, num]}>{normGap > 0 ? '+' : ''}{normGap} bps</Text>
              </View>
              <Text style={s.faint}>
                The raw prices differ mostly because one token holds more reinvested dividends. Only the normalized gap is real.
              </Text>
            </>
          ) : (
            <>
              <View style={s.row}>
                <Text style={s.label}>Price gap per share</Text>
                <Text style={[s.gapAccent, num]}>{normGap > 0 ? '+' : ''}{normGap} bps</Text>
              </View>
              <Text style={s.faint}>
                Both issuers use the same multiplier here, so the raw token prices are directly comparable.
              </Text>
            </>
          )}
        </View>
      )}

      <View style={s.card}>
        {cheaper && diff !== null && diff > 0 ? (
          <>
            <Text style={s.headline}>{cheaper} is {diff} bps cheaper to enter</Text>
            <Text style={s.faint}>About ${((diff / 10000) * 1000).toFixed(2)} on a $1,000 position.</Text>
          </>
        ) : cheaper ? (
          <>
            <Text style={s.headline}>Only {cheaper} is tradable right now</Text>
            <Text style={s.faint}>The other issuer has no usable quote at $1,000.</Text>
          </>
        ) : (
          <Text style={s.headline}>No usable quote right now</Text>
        )}
      </View>

      <View style={s.card}>
        {[
          ['Backing', ISSUERS.xStocks.backing, ISSUERS.Ondo.backing],
          ['Dividends', ISSUERS.xStocks.dividends, ISSUERS.Ondo.dividends],
          ['Redemption', ISSUERS.xStocks.redemption, ISSUERS.Ondo.redemption],
          ['Eligibility', ISSUERS.xStocks.eligibility, ISSUERS.Ondo.eligibility],
        ].map(([k, a, b]) => (
          <View key={k} style={{ gap: 4 }}>
            <Text style={s.label}>{k}</Text>
            <View style={s.cols}>
              <Text style={[s.small, { flex: 1 }]}>{a}</Text>
              <Text style={[s.small, { flex: 1 }]}>{b}</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable style={s.primary} onPress={() => router.push(`/buy?ticker=${tk}`)}>
        <Text style={s.primaryText}>Review route</Text>
      </Pressable>

      <Text style={s.faint}>{error ?? (x ? `Last measured ${new Date(x.ts * 1000).toLocaleString()}` : '')}</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  kicker: { color: T.faint, fontSize: 11, letterSpacing: 1.2 },
  title: { color: T.text, fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  cols: { flexDirection: 'row', gap: T.gap },
  col: { flex: 1, backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 4 },
  colBest: { borderColor: T.accent },
  colTitle: { color: T.text, fontSize: 17, fontWeight: '700' },
  colCost: { color: T.text, fontSize: 26, fontWeight: '700', marginTop: 6 },
  colValue: { color: T.text, fontSize: 15, fontWeight: '600' },
  colLine: { height: 1, backgroundColor: T.border, marginVertical: 8 },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  headline: { color: T.text, fontSize: 18, fontWeight: '700' },
  label: { color: T.dim, fontSize: 14 },
  small: { color: T.text, fontSize: 12 },
  gapMuted: { color: T.faint, fontSize: 18, fontWeight: '600', textDecorationLine: 'line-through' },
  gapAccent: { color: T.accent, fontSize: 22, fontWeight: '700' },
  accentText: { color: T.accent },
  faint: { color: T.faint, fontSize: 12 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})

