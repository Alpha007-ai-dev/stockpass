import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { bpsLabel, bpsValue, isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { getHoldings, getSeries, getStats, HoldingRow, Latest } from '@/lib/stats'

type Item = HoldingRow & {
  shares: number
  value: number | null
  entryBps: number | null
  exitBps: number | null
  entryDelta: number | null
  altSymbol: string | null
  altIssuer: string | null
  altEntryBps: number | null
}

type Tab = 'overview' | 'costs' | 'exposure' | 'insights' | 'opportunities'

export default function AnalyticsScreen() {
  const router = useRouter()
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>()
  const { account, connect } = useMobileWallet() as any
  const [tab, setTab] = useState<Tab>((initialTab as Tab) ?? 'overview')
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [stats, groups] = await Promise.all([getStats(), getGroups()])
      const latest = new Map<string, Latest>(stats.latest.map((l) => [l.symbol, l]))

      let rows: HoldingRow[]
      if (await isDemo()) {
        const all = groups.flatMap((g) => g.tokens)
        rows = DEMO_HOLDINGS.map((d) => {
          const t = all.find((x) => x.symbol === d.symbol)
          return t ? { ...t, walletAmount: d.walletAmount } : null
        }).filter(Boolean) as HoldingRow[]
      } else {
        const addr = account?.address ?? (await connect())?.address
        if (!addr) throw new Error('Wallet not connected')
        rows = await getHoldings(String(addr))
      }

      const base: Item[] = rows.map((r) => {
        const l = latest.get(r.symbol)
        const peers = (groups.find((g) => g.ticker === r.ticker)?.tokens ?? [])
          .filter((p) => p.symbol !== r.symbol)
          .map((p) => ({ token: p, l: latest.get(p.symbol) }))
          .filter((o) => o.l && isUsable(o.l.entry_bps, o.l.quotable))
        const cheapest = peers.length
          ? peers.reduce((a, b) => ((a.l!.entry_bps as number) <= (b.l!.entry_bps as number) ? a : b))
          : null
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        return {
          ...r,
          shares,
          value: l?.sell_px ? shares * l.sell_px : null,
          entryBps: l && isUsable(l.entry_bps, l.quotable) ? (l.entry_bps as number) : null,
          exitBps: l && isUsable(l.exit_bps, l.quotable) ? (l.exit_bps as number) : null,
          entryDelta: null,
          altSymbol: cheapest ? cheapest.token.symbol : null,
          altIssuer: cheapest ? cheapest.token.issuer : null,
          altEntryBps: cheapest ? (cheapest.l!.entry_bps as number) : null,
        }
      }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      setItems(base)

      const withDelta = await Promise.all(base.map(async (i) => {
        try {
          const pts = (await getSeries(i.ticker, 24)).filter((p) => p.symbol === i.symbol && p.quotable && p.entry_bps !== null)
          if (pts.length < 2 || i.entryBps === null) return i
          return { ...i, entryDelta: i.entryBps - (pts[0].entry_bps as number) }
        } catch { return i }
      }))
      setItems(withDelta)
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => { load() }, [load])

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? 0
  const priced = items?.filter((i) => i.exitBps !== null && i.value !== null) ?? []
  const exitValue = priced.reduce((n, i) => n + (i.value as number), 0)
  const exitCost = priced.reduce((n, i) => n + ((i.value as number) * (i.exitBps as number)) / 10000, 0)
  const avgExit = exitValue > 0 ? (exitCost / exitValue) * 10000 : null
  const entryPriced = items?.filter((i) => i.entryBps !== null && i.value !== null) ?? []
  const entryValue = entryPriced.reduce((n, i) => n + (i.value as number), 0)
  const avgEntry = entryValue > 0
    ? entryPriced.reduce((n, i) => n + (i.value as number) * (i.entryBps as number), 0) / entryValue
    : null

  const byIssuer: Record<string, number> = {}
  items?.forEach((i) => { byIssuer[i.issuer] = (byIssuer[i.issuer] ?? 0) + (i.value ?? 0) })

  const insights = (items ?? []).filter((i) => i.entryBps === null || (i.entryDelta !== null && Math.abs(i.entryDelta) >= 2))

  const tabs: [Tab, string][] = [
    ['overview', 'Overview'], ['costs', 'Costs'], ['exposure', 'Exposure'],
    ['insights', 'Insights'], ['opportunities', 'Opportunities'],
  ]

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={T.dim} />}>

      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/wallet'))} style={s.back}>
        <Text style={s.backText}>‹ Wallet</Text>
      </Pressable>

      <Text style={s.title}>Portfolio Analytics</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
        {tabs.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
            <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!items && busy && <ActivityIndicator color={T.dim} style={{ marginTop: 40 }} />}
      {error && <Text style={s.warn}>{error}</Text>}

      {items && tab === 'overview' && (
        <>
          <View style={s.heroCard}>
            <Text style={s.kicker}>TOTAL VALUE</Text>
            <Text style={[s.hero, num]}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Text style={s.tiny}>{items.length} assets · {Object.keys(byIssuer).length} issuers</Text>
          </View>

          <View style={s.pairRow}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.kicker}>ENTRY COST</Text>
              <Text style={[s.metric, num]}>{avgEntry !== null ? `${avgEntry.toFixed(1)} bps` : '—'}</Text>
              <Text style={s.tiny}>weighted average</Text>
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.kicker}>EXIT COST</Text>
              <Text style={[s.metric, num]}>{avgExit !== null ? `${avgExit.toFixed(1)} bps` : '—'}</Text>
              <Text style={s.tiny}>weighted average</Text>
            </View>
          </View>

          <View style={s.card}>
            <Text style={s.kicker}>ESTIMATED EXECUTION COST</Text>
            <Text style={[s.hero, num, { fontSize: 30 }]}>${exitCost.toFixed(2)}</Text>
            <Text style={s.tiny}>
              What it would cost to sell every position back to USDC at current quotes.
              {'\n'}{priced.length} of {items.length} holdings executable right now. Estimate, not a commitment.
            </Text>
          </View>
        </>
      )}

      {items && tab === 'costs' && (
        <>
          {items.map((i) => (
            <View key={i.symbol} style={s.card}>
              <View style={s.rowHead}>
                <TokenIcon icon={i.icon} symbol={i.symbol} label={i.ticker} issuer={i.issuer} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={s.symbol}>{i.symbol}</Text>
                  <Text style={[s.issuerText, { color: issuerColor(i.issuer) }]}>{i.issuer}</Text>
                </View>
                <Text style={[s.value, num]}>{i.value !== null ? `$${i.value.toFixed(2)}` : '—'}</Text>
              </View>
              <View style={s.metricsRow}>
                <View style={s.metricCell}>
                  <Text style={s.tinyLabel}>entry</Text>
                  <Text style={[s.metricSmall, num]}>{bpsLabel(i.entryBps)}</Text>
                </View>
                <View style={s.metricCell}>
                  <Text style={s.tinyLabel}>exit</Text>
                  <Text style={[s.metricSmall, num]}>{bpsLabel(i.exitBps)}</Text>
                </View>
                <View style={[s.metricCell, { flex: 1, alignItems: 'flex-end' }]}>
                  <Text style={s.tinyLabel}>cost to exit</Text>
                  <Text style={[s.metricSmall, num]}>
                    {i.value !== null && i.exitBps !== null ? `$${((i.value * bpsValue(i.exitBps)) / 10000).toFixed(2)}` : '—'}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <View style={s.card}>
            <View style={s.row}>
              <Text style={s.totalLabel}>Total estimated exit</Text>
              <Text style={[s.totalValue, num]}>${exitCost.toFixed(2)}</Text>
            </View>
          </View>
        </>
      )}

      {items && tab === 'exposure' && (
        <>
          <View style={s.card}>
            <Text style={s.kicker}>BY ISSUER</Text>
            {Object.entries(byIssuer).sort((a, b) => b[1] - a[1]).map(([issuer, v]) => {
              const pct = total > 0 ? (v / total) * 100 : 0
              return (
                <View key={issuer} style={{ gap: 6, marginTop: 8 }}>
                  <View style={s.row}>
                    <Text style={s.allocLabel}>{issuer}</Text>
                    <Text style={[s.allocPct, num]}>{pct.toFixed(1)}%</Text>
                  </View>
                  <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: issuerColor(issuer) }]} /></View>
                </View>
              )
            })}
          </View>

          <View style={s.card}>
            <Text style={s.kicker}>BY ASSET</Text>
            {items.map((i) => {
              const pct = total > 0 ? ((i.value ?? 0) / total) * 100 : 0
              return (
                <View key={i.symbol} style={{ gap: 6, marginTop: 8 }}>
                  <View style={s.row}>
                    <Text style={s.allocLabel}>{i.symbol}</Text>
                    <Text style={[s.allocPct, num]}>{pct.toFixed(1)}%</Text>
                  </View>
                  <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: issuerColor(i.issuer) }]} /></View>
                </View>
              )
            })}
          </View>
        </>
      )}

      {items && tab === 'insights' && (
        insights.length > 0 ? (
          insights.map((i) => (
            <View key={i.symbol} style={s.card}>
              <View style={s.rowHead}>
                <TokenIcon icon={i.icon} symbol={i.symbol} label={i.ticker} issuer={i.issuer} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={s.symbol}>{i.symbol}</Text>
                  <Text style={[s.issuerText, { color: issuerColor(i.issuer) }]}>{i.issuer}</Text>
                </View>
              </View>
              <Text style={[s.insightText, i.entryBps === null ? { color: T.faint } : { color: i.entryDelta! < 0 ? T.accent : T.down }]}>
                {i.entryBps === null
                  ? 'No executable quote right now'
                  : `Entry cost ${i.entryDelta! < 0 ? '↓' : '↑'} ${Math.abs(i.entryDelta!)} bps vs 24h ago`}
              </Text>
            </View>
          ))
        ) : (
          <View style={s.card}>
            <Text style={s.tiny}>
              Nothing changed meaningfully in the last 24 hours, or there is not enough history yet for these holdings.
            </Text>
          </View>
        )
      )}

      {items && tab === 'opportunities' && (
        <>
          {items.map((i) => {
            const cheaper = i.altEntryBps !== null && i.entryBps !== null && i.altEntryBps < i.entryBps
            const saving = cheaper ? (i.entryBps as number) - (i.altEntryBps as number) : 0
            const switching = i.exitBps !== null && i.altEntryBps !== null ? i.exitBps + i.altEntryBps : null
            const net = switching !== null ? saving - switching : null
            return (
              <View key={i.symbol} style={s.card}>
                <View style={s.rowHead}>
                  <TokenIcon icon={i.icon} symbol={i.symbol} label={i.ticker} issuer={i.issuer} size={34} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.symbol}>{i.symbol}</Text>
                    <Text style={[s.issuerText, { color: issuerColor(i.issuer) }]}>{i.issuer}</Text>
                  </View>
                  <Text style={[s.tiny, !cheaper && { color: T.accent }]}>
                    {cheaper ? 'alternative exists' : 'cheapest route'}
                  </Text>
                </View>

                {cheaper && switching !== null ? (
                  <>
                    <View style={s.switchRow}>
                      <View style={s.switchCell}>
                        <Text style={s.tinyLabel}>current exit</Text>
                        <Text style={[s.metricSmall, num]}>{bpsLabel(i.exitBps)}</Text>
                      </View>
                      <View style={s.switchCell}>
                        <Text style={s.tinyLabel}>{i.altSymbol} entry</Text>
                        <Text style={[s.metricSmall, num]}>{bpsLabel(i.altEntryBps)}</Text>
                      </View>
                      <View style={[s.switchCell, { alignItems: 'flex-end', flex: 1 }]}>
                        <Text style={s.tinyLabel}>switching cost</Text>
                        <Text style={[s.metricSmall, num, { color: T.warn }]}>{switching} bps</Text>
                      </View>
                    </View>
                    <Text style={s.tiny}>
                      {i.altSymbol} is {saving} bps cheaper to enter, but switching requires selling this position and
                      entering the alternative. Net result {net! >= 0 ? '+' : ''}{net} bps.
                    </Text>
                  </>
                ) : (
                  <Text style={s.tiny}>
                    {cheaper
                      ? 'No exit quote right now, so switching cannot be priced.'
                      : 'You already hold the cheapest issuer for this stock.'}
                  </Text>
                )}
              </View>
            )
          })}
          <Text style={s.tiny}>Cheapest to buy is not the same as cheapest for you.</Text>
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  title: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },

  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { color: T.dim, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: T.bg, fontWeight: '700' },

  heroCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18, gap: 4 },
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 8 },
  pairRow: { flexDirection: 'row', gap: 11 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  hero: { color: T.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  metric: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 3 },
  metricSmall: { color: T.text, fontSize: 17, fontWeight: '700' },
  tiny: { color: T.faint, fontSize: 13, lineHeight: 18 },
  tinyLabel: { color: T.faint, fontSize: 12 },

  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  symbol: { color: T.text, fontSize: 16, fontWeight: '700' },
  issuerText: { fontSize: 13, fontWeight: '600' },
  value: { color: T.text, fontSize: 16, fontWeight: '700' },
  metricsRow: { flexDirection: 'row', gap: 24, marginTop: 2 },
  metricCell: { gap: 1 },
  switchRow: { flexDirection: 'row', gap: 20, marginTop: 4 },
  switchCell: { gap: 1 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  allocLabel: { color: T.text, fontSize: 15, fontWeight: '600' },
  allocPct: { color: T.dim, fontSize: 15, fontWeight: '700' },
  track: { height: 7, borderRadius: 4, backgroundColor: T.border },
  fill: { height: 7, borderRadius: 4 },

  insightText: { fontSize: 15, fontWeight: '600' },
  totalLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: T.accent, fontSize: 24, fontWeight: '800' },

  warn: { color: T.warn, fontSize: 13 },
})
