import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { PortfolioSpark } from '@/components/portfolio-spark'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo, setDemo } from '@/lib/demo'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups } from '@/lib/pairs'
import { getLastPortfolio, savePortfolio, Snapshot } from '@/lib/portfolio'
import { getLastPurchase, Purchase } from '@/lib/purchases'
import { getHoldings, getPricesAgo, getSeries, getStats, History, HoldingRow, Latest } from '@/lib/stats'
import { InsightCard } from '@/components/insight-card'

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

export default function HomeScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet() as any
  const [items, setItems] = useState<Item[] | null>(null)
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [hist, setHist] = useState<Record<string, History>>({})
  const [ago, setAgo] = useState<Record<string, { px: number; ts: number }>>({})
  const [last, setLast] = useState<Purchase | null>(null)
  const [prev, setPrev] = useState<Snapshot | null>(null)
  const [demo, setDemoState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const state = getMarketState()
  const market = MARKET_LABEL[state]
  const open = state === 'open'

  const scan = useCallback(async (useDemo?: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const asDemo = useDemo ?? (await isDemo())
      const stats = await getStats()
      const map: Record<string, Latest> = {}
      stats.latest.forEach((r) => { map[r.symbol] = r })
      setLatest(map)
      const h: Record<string, History> = {}
      stats.history.filter((r) => r.market_state === state).forEach((r) => { h[r.symbol] = r })
      setHist(h)

      let rows: HoldingRow[]
      if (asDemo) {
        const groups = await getGroups()
        const all = groups.flatMap((g) => g.tokens)
        rows = DEMO_HOLDINGS
          .map((d) => {
            const t = all.find((x) => x.symbol === d.symbol)
            return t ? { ...t, walletAmount: d.walletAmount } : null
          })
          .filter(Boolean) as HoldingRow[]
      } else {
        const addr = account?.address ?? (await connect())?.address
        if (!addr) throw new Error('Wallet not connected')
        rows = await getHoldings(String(addr))
      }

      const groupsForAlt = await getGroups()
      const base: Item[] = rows.map((r) => {
        const l = map[r.symbol]
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        const peers = (groupsForAlt.find((g) => g.ticker === r.ticker)?.tokens ?? [])
          .filter((p) => p.symbol !== r.symbol)
          .map((p) => ({ token: p, l: map[p.symbol] }))
          .filter((o) => o.l && isUsable(o.l.entry_bps, o.l.quotable))
        const cheapest = peers.length
          ? peers.reduce((a, b) => ((a.l!.entry_bps as number) <= (b.l!.entry_bps as number) ? a : b))
          : null
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
      getPricesAgo(base.map((i) => i.symbol), 24).then(setAgo).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => {
    getLastPortfolio().then(setPrev)
    getLastPurchase().then(setLast)
    isDemo().then((d) => { setDemoState(d); if (d) scan(true) })
    getStats().then((s) => {
      const map: Record<string, Latest> = {}
      s.latest.forEach((r) => { map[r.symbol] = r })
      setLatest(map)
    }).catch(() => {})
  }, [scan])

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? null
  const change = total !== null && prev && prev.total > 0 ? total - prev.total : null
  const issuers = new Set(items?.map((i) => i.issuer)).size

  useEffect(() => {
    if (total === null || total <= 0) return
    if (prev && Date.now() - prev.at < 60 * 60 * 1000) return
    savePortfolio(total).then(() => getLastPortfolio().then(setPrev))
  }, [total, prev])

  const startDemo = async () => { await setDemo(true); setDemoState(true); scan(true) }
  const exitDemo = async () => { await setDemo(false); setDemoState(false); setItems(null) }

  const allLatest = Object.values(latest)
  const entries = allLatest.filter((l) => isUsable(l.entry_bps, l.quotable)).map((l) => l.entry_bps as number).sort((a, b) => a - b)
  const tracked = new Set(allLatest.map((l) => l.ticker)).size

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => scan()} tintColor={T.dim} />}>

      {demo && (
        <Pressable style={s.demoBar} onPress={exitDemo}>
          <Text style={s.demoText}>DEMO PORTFOLIO · real prices, sample amounts</Text>
          <Text style={s.demoExit}>Exit</Text>
        </Pressable>
      )}

      <View style={s.header}>
        <Text style={s.brand}>StockPass</Text>
        <View style={s.live}>
          <View style={[s.dot, { backgroundColor: open ? T.accent : T.warn }]} />
          <Text style={s.liveText}>{open ? 'LIVE' : 'CLOSED'}</Text>
        </View>
      </View>

      {total !== null ? (
        <View style={s.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>YOUR PORTFOLIO</Text>
            <Text style={[s.heroValue, num]}>
              ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
            {(() => {
              const matched = items!.filter((i) => i.value !== null && ago[i.symbol])
              if (matched.length) {
                const nowVal = matched.reduce((n, i) => n + (i.value as number), 0)
                const thenVal = matched.reduce((n, i) => n + i.shares * ago[i.symbol].px, 0)
                const d = nowVal - thenVal
                const pct = thenVal > 0 ? (d / thenVal) * 100 : 0
                return (
                  <Text style={[s.heroChange, num, { color: d >= 0 ? T.accent : T.down }]}>
                    {d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(2)} ({d >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                    <Text style={s.heroChangeLabel}>  24h</Text>
                  </Text>
                )
              }
              if (change !== null) {
                return (
                  <Text style={[s.heroChange, num, { color: change >= 0 ? T.accent : T.down }]}>
                    {change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(2)}
                    <Text style={s.heroChangeLabel}> since last snapshot</Text>
                  </Text>
                )
              }
              return null
            })()}
            <Text style={s.heroMeta}>{items!.length} assets · {issuers} issuer{issuers === 1 ? '' : 's'}</Text>
          </View>
          <PortfolioSpark tickers={items!.map((i) => i.ticker)} />
        </View>
      ) : (
        <View style={s.heroCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>TOKENIZED EQUITIES</Text>
            <Text style={[s.heroValue, num]}>{tracked || '—'}</Text>
            <Text style={s.heroMeta}>
              tracked · {entries.length ? `cheapest entry ${entries[0]} bps` : 'measuring'}
            </Text>
          </View>
        </View>
      )}

      {total === null && (
        <>
          <Pressable style={s.primary} onPress={() => scan(false)} disabled={busy}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
          </Pressable>
          <Pressable style={s.secondary} onPress={startDemo} disabled={busy}>
            <Text style={s.secondaryText}>Explore with a demo portfolio</Text>
          </Pressable>
        </>
      )}

      {error && <Text style={s.warn}>{error}</Text>}

      {items && items.length > 0 && (
        <>
          <Text style={s.sectionLabel}>THINGS WORTH KNOWING</Text>

          {items.slice(0, 4).map((i) => (
            <InsightCard key={i.symbol} item={i} hist={hist[i.symbol]} />
          ))}
        </>
      )}

      <View style={s.pairRow}>
        <View style={[s.card, s.halfCard]}>
          <View style={s.live}>
            <View style={[s.dot, { backgroundColor: open ? T.accent : T.warn }]} />
            <Text style={[s.stateTitle, { color: open ? T.accent : T.warn }]}>{market.title}</Text>
          </View>
          <Text style={s.stateSub}>{open ? 'US equities trading' : 'US equities closed'}</Text>
        </View>

        {last ? (
          <Pressable style={[s.card, s.halfCard]} onPress={() => Linking.openURL(`https://solscan.io/tx/${last.signature}`)}>
            <Text style={s.kicker}>LAST PURCHASE</Text>
            <Text style={s.lastTitle}>{last.symbol} · {last.issuer}</Text>
            <Text style={s.stateSub}>{new Date(last.at).toLocaleString()}</Text>
            {last.savedBps !== null && last.savedBps > 0 && (
              <Text style={s.saved}>Saved {last.savedBps} bps · ${((last.savedBps / 10000) * last.sizeUsd).toFixed(2)}</Text>
            )}
          </Pressable>
        ) : (
          <View style={[s.card, s.halfCard]}>
            <Text style={s.kicker}>LAST PURCHASE</Text>
            <Text style={s.stateSub}>No purchase yet</Text>
          </View>
        )}
      </View>

      {items && items.length > 0 && (
        <Pressable style={s.analyticsCard} onPress={() => router.push('/analytics')}>
          <Text style={s.analyticsIcon}>▥</Text>
          <Text style={s.analyticsText}>Portfolio Analytics</Text>
          <Text style={s.chev}>›</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },

  demoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: '#4A3A18', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  demoText: { color: T.warn, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  demoExit: { color: T.warn, fontSize: 12, fontWeight: '700', paddingHorizontal: 8 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  brand: { color: T.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveText: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  heroCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  heroValue: { color: T.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, marginTop: 5 },
  heroChange: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  heroChangeLabel: { color: T.dim, fontSize: 14, fontWeight: '400' },
  heroMeta: { color: T.faint, fontSize: 13, marginTop: 8 },

  sectionLabel: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 1 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { color: T.dim, fontSize: 14 },
  entry: { color: T.text, fontSize: 18, fontWeight: '700' },
  exit: { color: T.dim, fontSize: 14 },
  delta: { fontSize: 12, fontWeight: '600' },
  noQuote: { color: T.faint, fontSize: 12 },
  chev: { color: T.faint, fontSize: 18 },

  pairRow: { flexDirection: 'row', gap: 11, marginTop: 8 },
  halfCard: { flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 4, paddingVertical: 14 },
  stateTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  stateSub: { color: T.faint, fontSize: 13 },
  lastTitle: { color: T.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  saved: { color: T.accent, fontSize: 13, fontWeight: '600', marginTop: 2 },

  analyticsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18, marginTop: 4 },
  analyticsIcon: { color: T.accent, fontSize: 18 },
  analyticsText: { color: T.text, fontSize: 16, fontWeight: '600', flex: 1 },

  warn: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: T.borderBright, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: T.text, fontSize: 15, fontWeight: '600' },
})


