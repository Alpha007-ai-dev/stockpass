import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'

type Item = HoldingRow & {
  shares: number
  value: number | null
  entryBps: number | null
  exitBps: number | null
  altSymbol: string | null
  altEntryBps: number | null
}

type Tab = 'overview' | 'costs' | 'exposure' | 'insights' | 'opportunities'

export default function AnalyticsScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet() as any
  const { tab: initialTab } = useLocalSearchParams<{ tab?: string }>()
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

      setItems(rows.map((r) => {
        const l = latest.get(r.symbol)
        const peers = groups.find((g) => g.ticker === r.ticker)?.tokens ?? []
        const alt = peers
          .filter((p) => p.symbol !== r.symbol)
          .map((p) => latest.get(p.symbol))
          .filter((x) => x && isUsable(x.entry_bps, x.quotable)) as Latest[]
        const cheapest = alt.length ? alt.reduce((a, b) => ((a.entry_bps as number) <= (b.entry_bps as number) ? a : b)) : null
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        return {
          ...r,
          shares,
          value: l?.sell_px ? shares * l.sell_px : null,
          entryBps: l && isUsable(l.entry_bps, l.quotable) ? (l.entry_bps as number) : null,
          exitBps: l && isUsable(l.exit_bps, l.quotable) ? (l.exit_bps as number) : null,
          altSymbol: cheapest ? cheapest.symbol : null,
          altEntryBps: cheapest ? (cheapest.entry_bps as number) : null,
        }
      }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
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

      <Text style={s.title}>Portfolio analytics</Text>
      <Text style={s.sub}>What your ownership actually costs</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={{ gap: 6 }}>
        {tabs.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
            <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!items && busy && <ActivityIndicator color={T.dim} style={{ marginTop: 40 }} />}
      {error && <Text style={s.warn}>{error}</Text>}

      {items && tab === 'overview' && (
        <View style={{ gap: 16 }}>
          <View>
            <Text style={s.label}>Portfolio value</Text>
            <Text style={[s.hero, num]}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
            <Text style={s.faint}>{items.length} assets · {new Set(items.map((i) => i.issuer)).size} issuers</Text>
          </View>
          <View style={s.split}>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Average entry</Text>
              <Text style={[s.big, num]}>{avgEntry !== null ? `${avgEntry.toFixed(1)} bps` : '—'}</Text>
              <Text style={s.tiny}>at current quotes</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.label}>Estimated exit</Text>
              <Text style={[s.big, num]}>${exitCost.toFixed(2)}</Text>
              <Text style={s.tiny}>{avgExit !== null ? `${avgExit.toFixed(1)} bps average` : ''}</Text>
            </View>
          </View>
          <Text style={s.faint}>
            {priced.length} of {items.length} holdings executable right now. Estimates from live quotes, not commitments.
          </Text>
        </View>
      )}

      {items && tab === 'costs' && (
        <View style={{ gap: 4 }}>
          {items.map((i) => (
            <View key={i.symbol} style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{i.symbol}</Text>
                <Text style={s.faint}>{i.value !== null ? `$${i.value.toFixed(2)}` : 'no quote'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.rowValue, num]}>{i.exitBps !== null ? `${i.exitBps} bps` : '—'}</Text>
                <Text style={s.faint}>
                  {i.value !== null && i.exitBps !== null ? `$${((i.value * i.exitBps) / 10000).toFixed(2)} to exit` : ''}
                </Text>
              </View>
            </View>
          ))}
          <View style={[s.row, { borderBottomWidth: 0, marginTop: 6 }]}>
            <Text style={s.rowTitle}>Total</Text>
            <Text style={[s.rowValue, num, { color: T.accent }]}>${exitCost.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {items && tab === 'exposure' && (
        <View style={{ gap: 14 }}>
          <Text style={s.label}>By issuer</Text>
          {Object.entries(byIssuer).sort((a, b) => b[1] - a[1]).map(([issuer, v]) => {
            const pct = total > 0 ? (v / total) * 100 : 0
            return (
              <View key={issuer} style={{ gap: 5 }}>
                <View style={s.line}>
                  <Text style={s.rowTitle}>{issuer}</Text>
                  <Text style={[s.rowValue, num]}>{pct.toFixed(1)}%</Text>
                </View>
                <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: issuerColor(issuer) }]} /></View>
              </View>
            )
          })}

          <Text style={[s.label, { marginTop: 8 }]}>By holding</Text>
          {items.map((i) => {
            const pct = total > 0 ? ((i.value ?? 0) / total) * 100 : 0
            return (
              <View key={i.symbol} style={{ gap: 5 }}>
                <View style={s.line}>
                  <Text style={s.rowTitle}>{i.symbol}</Text>
                  <Text style={[s.rowValue, num]}>{pct.toFixed(1)}%</Text>
                </View>
                <View style={s.track}><View style={[s.fill, { width: `${Math.max(2, pct)}%`, backgroundColor: issuerColor(i.issuer) }]} /></View>
              </View>
            )
          })}
        </View>
      )}

      {items && tab === 'insights' && (
        <View style={{ gap: 10 }}>
          <Text style={s.faint}>
            Not enough history yet. StockPass compares your holdings against its own measurements over time, and needs a
            few days of data per token before it can show what changed.
          </Text>
        </View>
      )}

      {items && tab === 'opportunities' && (
        <View style={{ gap: 12 }}>
          {items.map((i) => {
            const cheaper = i.altEntryBps !== null && i.entryBps !== null && i.altEntryBps < i.entryBps
            const saving = cheaper ? (i.entryBps as number) - (i.altEntryBps as number) : 0
            const switching = i.exitBps !== null && i.altEntryBps !== null ? i.exitBps + i.altEntryBps : null
            const net = switching !== null ? saving - switching : null
            return (
              <View key={i.symbol} style={s.opp}>
                <View style={s.line}>
                  <Text style={s.rowTitle}>{i.symbol}</Text>
                  <Text style={[s.faint, !cheaper && { color: T.accent }]}>
                    {cheaper ? 'cheaper issuer exists' : 'cheapest route'}
                  </Text>
                </View>
                {cheaper && switching !== null ? (
                  <>
                    <Text style={s.faint}>{i.altSymbol} is {saving} bps cheaper to enter. Switching costs {switching} bps.</Text>
                    <Text style={[s.netGood, (net ?? 0) < 0 && s.netBad]}>
                      Net result {(net ?? 0) >= 0 ? '+' : ''}{net} bps · {(net ?? 0) < 0 ? 'keep current position' : 'switching could pay off'}
                    </Text>
                  </>
                ) : (
                  <Text style={s.faint}>
                    {cheaper ? 'No exit quote right now, so switching cannot be priced.' : 'You already hold the cheapest issuer for this stock.'}
                  </Text>
                )}
              </View>
            )
          })}
          <Text style={s.faint}>Cheapest to buy is not the same as cheapest for you.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  title: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6 },
  sub: { color: T.dim, fontSize: 14 },
  tabs: { marginTop: 4 },
  tab: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: T.border },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { color: T.dim, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: T.bg, fontWeight: '700' },
  label: { color: T.faint, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  hero: { color: T.text, fontSize: 38, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  big: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.4, marginTop: 3 },
  split: { flexDirection: 'row', gap: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: T.border, paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: T.border },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rowTitle: { color: T.text, fontSize: 16, fontWeight: '600' },
  rowValue: { color: T.text, fontSize: 16, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: T.border },
  fill: { height: 6, borderRadius: 3 },
  opp: { gap: 5, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  netGood: { color: T.accent, fontSize: 14, fontWeight: '600' },
  netBad: { color: T.warn },
  faint: { color: T.faint, fontSize: 13, lineHeight: 19 },
  tiny: { color: T.faint, fontSize: 11, marginTop: 1 },
  warn: { color: T.warn, fontSize: 13 },
})

