import { useEffect, useState } from 'react'
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { CollateralSection } from '@/components/collateral-section'
import { NormalizationHero } from '@/components/normalization-hero'
import { CostTimeline } from '@/components/cost-timeline'
import { CostToGoOnChain } from '@/components/cost-to-go-onchain'
import { ISSUERS } from '@/constants/issuers'
import { num, T } from '@/constants/theme'
import { costLabel } from '@/lib/cost'
import { getGroups } from '@/lib/pairs'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getHoldings } from '@/lib/stats'
import { TokenIcon } from '@/components/token-icon'
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
  const { account } = useMobileWallet() as any
  const [balance, setBalance] = useState<number | null>(null)
  const [token, setToken] = useState<{ icon?: string | null; name?: string | null } | null>(null)
  const [others, setOthers] = useState<Latest[]>([])
  const [reference, setReference] = useState<any | null>(null)
  useEffect(() => {
    getGroups()
      .then((gs) => {
        const t = gs.flatMap((g) => g.tokens).find((x) => x.symbol === sym)
        setToken(t ? { icon: t.icon, name: t.name } : null)
      })
      .catch(() => {})
  }, [sym])

  useEffect(() => {
    ;(async () => {
      try {
        if (await isDemo()) {
          const d = DEMO_HOLDINGS.find((x) => x.symbol === sym)
          setBalance(d ? d.walletAmount : null)
          return
        }
        const addr = account?.address
        if (!addr) return
        const rows = await getHoldings(String(addr))
        const row = rows.find((r) => r.symbol === sym)
        setBalance(row ? row.walletAmount : null)
      } catch {}
    })()
  }, [sym, account])

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
        setOthers(s.latest.filter((r) => r.symbol !== sym))
        setReference((s as any).reference?.find((r: any) => r.ticker === ticker) ?? null)
        setHist(s.history.filter((r) => r.symbol === sym).sort((a, b) => b.samples - a.samples))
      })
      .catch((e) => setError((e as Error).message))
  }, [sym])

  useEffect(() => {
    ;(async () => {
      try {
        if (await isDemo()) {
          const d = DEMO_HOLDINGS.find((x) => x.symbol === sym)
          setBalance(d ? d.walletAmount : null)
          return
        }
        const addr = account?.address
        if (!addr) return
        const rows = await getHoldings(String(addr))
        const row = rows.find((r) => r.symbol === sym)
        setBalance(row ? row.walletAmount : null)
      } catch {}
    })()
  }, [sym, account])

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

      <View style={s.header}>
        <TokenIcon icon={token?.icon} symbol={sym} label={ticker} issuer={issuerName} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{sym}</Text>
          <Text style={s.subtitle} numberOfLines={1}>{token?.name ?? ticker}</Text>
        </View>
      </View>
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
          {(() => {
            const peer = others.find((o) => o.ticker === ticker && o.buy_px && mine?.buy_px)
            if (!peer || !mine?.buy_px || !peer.buy_px) return null
            const rawGap = Math.round(((peer.buy_px * peer.multiplier) / (mine.buy_px * mine.multiplier) - 1) * 10000)
            const normGap = Math.round((peer.buy_px / mine.buy_px - 1) * 10000)
            if (Math.abs(rawGap - normGap) < 3) return null
            return <NormalizationHero symbol={sym} mine={mine} peer={peer} reference={reference} />
          })()}

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

          {mine && <CostToGoOnChain mine={mine} reference={reference} />}

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

          {balance !== null && (
            <View style={s.card}>
              <Text style={s.section}>Your balance</Text>
              <Text style={[s.hero, num]}>{balance.toFixed(4)} {sym}</Text>
              <Text style={s.faint}>
                = {(balance * (mine?.multiplier ?? 1)).toFixed(4)} shares
                {mine?.buy_px ? ` · ≈ $${(balance * (mine.multiplier ?? 1) * mine.buy_px).toFixed(2)}` : ''}
              </Text>
            </View>
          )}

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
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: T.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { color: T.dim, fontSize: 14 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: { backgroundColor: T.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: T.text, fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: T.border },
  tab: { paddingVertical: 10, paddingHorizontal: 10 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: T.accent },
  tabText: { color: T.dim, fontSize: 14 },
  tabTextOn: { color: T.accent, fontWeight: '700' },
  grid2: { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderTopColor: T.border },
  box: { flex: 1, paddingVertical: 14, gap: 3 },
  boxLabel: { color: T.faint, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  boxBig: { color: T.text, fontSize: 28, fontWeight: '700' },
  boxMid: { color: T.text, fontSize: 18, fontWeight: '600' },
  normCard: { backgroundColor: '#12180E', borderRadius: 22, borderWidth: 1.5, borderColor: T.accent, padding: 18, gap: 14 },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, paddingVertical: 6 },
  heroSide: { alignItems: 'center' },
  heroBad: { color: T.down, fontSize: 40, fontWeight: '800', letterSpacing: -1.5, textDecorationLine: 'line-through' },
  heroGood: { color: T.accent, fontSize: 56, fontWeight: '800', letterSpacing: -2 },
  heroUnit: { color: T.faint, fontSize: 12, marginTop: 2 },
  heroArrow: { color: T.dim, fontSize: 26, marginBottom: 14 },
  normKicker: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  normRow: { flexDirection: 'row', gap: 12 },
  normSmall: { color: T.faint, fontSize: 17, fontWeight: '600', textDecorationLine: 'line-through' },
  normBig: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  normDivider: { height: 1, backgroundColor: T.border },
  gapRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  arrow: { color: T.faint, fontSize: 22, marginTop: 14 },
  gapBad: { color: T.down, fontSize: 26, fontWeight: '700', textDecorationLine: 'line-through' },
  gapGood: { color: T.accent, fontSize: 34, fontWeight: '700', letterSpacing: -1 },
  card: { backgroundColor: T.surface, borderRadius: 16, padding: 16, gap: 10 },
  section: { color: T.text, fontSize: 15, fontWeight: '600' },
  hero: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: T.dim, fontSize: 13, width: 92 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: T.border },
  fill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  barValue: { color: T.text, fontSize: 13, width: 28, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: T.dim, fontSize: 14 },
  labelStrong: { color: T.text, fontSize: 15, fontWeight: '700' },
  value: { color: T.text, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  faint: { color: T.faint, fontSize: 13 },
  link: { color: T.accent, fontSize: 14, fontWeight: '600' },
})














