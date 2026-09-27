import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CollateralSection } from '@/components/collateral-section'
import { CostTimeline } from '@/components/cost-timeline'
import { ISSUERS } from '@/constants/issuers'
import { num, T } from '@/constants/theme'
import { costLabel } from '@/lib/cost'
import { compact, getStats, History, Latest } from '@/lib/stats'

type Tab = 'overview' | 'costs' | 'ownership' | 'utility'

const STATE_LABEL: Record<string, string> = {
  open: 'Market open', pre: 'Pre-market', after: 'After hours', closed: 'Overnight', weekend: 'Weekend',
}

export default function PassportScreen() {
  const router = useRouter()
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? 'SPYx'
  const [tab, setTab] = useState<Tab>('overview')
  const [mine, setMine] = useState<Latest | null>(null)
  const [hist, setHist] = useState<History[]>([])
  const [error, setError] = useState<string | null>(null)

  const isOndo = sym.endsWith('on')
  const isBp = sym.endsWith('bp')
  const ticker = isOndo ? sym.slice(0, -2) : isBp ? sym.slice(0, -2) : sym.slice(0, -1)
  const issuerName = isOndo ? 'Ondo' : isBp ? 'Backpack' : 'xStocks'
  const info = ISSUERS[issuerName] ?? ISSUERS.xStocks
  const otherSym = isOndo ? `${ticker}x` : `${ticker}on`

  useEffect(() => {
    getStats()
      .then((s) => {
        setMine(s.latest.find((r) => r.symbol === sym) ?? null)
        setHist(s.history.filter((r) => r.symbol === sym).sort((a, b) => b.samples - a.samples))
      })
      .catch((e) => setError((e as Error).message))
  }, [sym])

  const samples = hist.reduce((n, h) => n + h.samples, 0)
  const avail = samples > 0 ? hist.reduce((n, h) => n + h.availability * h.samples, 0) / samples : null
  const maxAvg = Math.max(1, ...hist.filter((h) => h.avg_entry !== null).map((h) => h.avg_entry as number))
  const raw = mine?.buy_px ? mine.buy_px * mine.multiplier : null
  const shares = mine ? mine.multiplier : null
  const supplyShares = mine ? mine.supply * mine.multiplier : null

  const tabs: [Tab, string][] = [['overview', 'Overview'], ['costs', 'Costs'], ['ownership', 'Ownership'], ['utility', 'Utility']]

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <Text style={s.title}>{sym}</Text>
      <View style={s.badges}>
        <View style={s.badge}><Text style={s.badgeText}>{issuerName}</Text></View>
        <View style={s.badge}><Text style={s.badgeText}>{info.standard}</Text></View>
      </View>

      <View style={s.tabs}>
        {tabs.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
            <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' && (
        <>
          <View style={s.grid2}>
            <View style={s.box}>
              <Text style={s.boxLabel}>Normalized price (per share)</Text>
              <Text style={[s.boxBig, num]}>{mine?.buy_px ? `$${mine.buy_px.toFixed(2)}` : '—'}</Text>
              <Text style={s.faint}>Raw token price {raw ? `$${raw.toFixed(2)}` : '—'}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Entry cost</Text>
              <Text style={[s.boxBig, num, { color: T.accent }]}>{mine ? costLabel(mine.entry_bps, mine.quotable) : '—'}</Text>
              <Text style={s.faint}>Exit cost {mine && mine.quotable ? `${mine.exit_bps} bps` : '—'}</Text>
            </View>
          </View>

          <View style={s.grid2}>
            <View style={s.box}>
              <Text style={s.boxLabel}>Market state</Text>
              <Text style={s.boxMid}>{mine ? STATE_LABEL[mine.market_state] ?? mine.market_state : '—'}</Text>
            </View>
            <View style={s.box}>
              <Text style={s.boxLabel}>Quote available</Text>
              <Text style={s.boxMid}>{avail !== null ? `${(avail * 100).toFixed(0)}%` : '—'}</Text>
              <Text style={s.faint}>last {samples} checks</Text>
            </View>
          </View>

          <CostTimeline ticker={ticker} />
        </>
      )}

      {tab === 'costs' && (
        <>
          <CostTimeline ticker={ticker} />
          {hist.length > 0 && (
            <View style={s.card}>
              <Text style={s.section}>Cost to enter by market state</Text>
              {hist.filter((h) => h.avg_entry !== null).map((h) => (
                <View key={h.market_state} style={s.barRow}>
                  <Text style={s.barLabel}>{STATE_LABEL[h.market_state] ?? h.market_state}</Text>
                  <View style={s.track}><View style={[s.fill, { width: `${Math.round(((h.avg_entry as number) / maxAvg) * 100)}%` }]} /></View>
                  <Text style={[s.barValue, num]}>{(h.avg_entry as number).toFixed(0)}</Text>
                </View>
              ))}
              <Text style={s.faint}>{samples} measurements at $1,000 test size</Text>
            </View>
          )}
        </>
      )}

      {tab === 'ownership' && (
        <>
          <View style={s.card}>
            <Text style={s.section}>Token represents real shares</Text>
            <Text style={[s.hero, num]}>1 token = {shares ? shares.toFixed(4) : '—'} shares</Text>
            <Text style={s.faint}>
              The multiplier is read on-chain and changes when dividends or corporate actions are reinvested.
            </Text>
          </View>

          <View style={s.card}>
            <Text style={s.section}>Total supply</Text>
            <Text style={[s.hero, num]}>{mine ? compact(mine.supply) : '—'} {sym}</Text>
            <Text style={s.faint}>
              {supplyShares ? `≈ ${compact(supplyShares)} shares` : ''}
              {mine?.buy_px && supplyShares ? ` · ≈ $${compact(supplyShares * mine.buy_px)}` : ''}
            </Text>
          </View>

          <View style={s.card}>
            {[['Issuer', info.legalName], ['Backing', info.backing], ['Dividends', info.dividends],
              ['Redemption', info.redemption], ['Eligibility', info.eligibility]].map(([k, v]) => (
              <View key={k} style={s.row}><Text style={s.label}>{k}</Text><Text style={s.value}>{v}</Text></View>
            ))}
          </View>
        </>
      )}

      {tab === 'utility' && (
        <>
          <CollateralSection symbol={sym} otherSymbol={otherSym} />
          <Pressable onPress={() => Linking.openURL('https://app.kamino.finance/')}>
            <Text style={s.link}>Open Kamino ›</Text>
          </Pressable>
          <Text style={s.faint}>
            Collateral data comes from Kamino's public API and may change. Information only, not financial advice.
          </Text>
        </>
      )}

      <Text style={s.faint}>
        {error ?? (mine ? `Last measured ${new Date(mine.ts * 1000).toLocaleString()}` : 'Loading…')}
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  title: { color: T.text, fontSize: 36, fontWeight: '700', letterSpacing: -1 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: { backgroundColor: T.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: T.text, fontSize: 11, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { paddingVertical: 10, paddingHorizontal: 10 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: T.accent },
  tabText: { color: T.dim, fontSize: 14 },
  tabTextOn: { color: T.accent, fontWeight: '700' },
  grid2: { flexDirection: 'row', gap: 12 },
  box: { flex: 1, backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 4 },
  boxLabel: { color: T.faint, fontSize: 11 },
  boxBig: { color: T.text, fontSize: 24, fontWeight: '700' },
  boxMid: { color: T.text, fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  section: { color: T.text, fontSize: 15, fontWeight: '600' },
  hero: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: T.dim, fontSize: 13, width: 92 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: T.border },
  fill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  barValue: { color: T.text, fontSize: 13, width: 28, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: T.dim, fontSize: 14 },
  value: { color: T.text, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  faint: { color: T.faint, fontSize: 12 },
  link: { color: T.accent, fontSize: 14, fontWeight: '600' },
})
