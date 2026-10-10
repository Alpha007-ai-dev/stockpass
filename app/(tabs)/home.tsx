import { useScrollReset } from '@/lib/use-scroll-reset'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { PortfolioSpark } from '@/components/portfolio-spark'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { ErrorState } from '@/components/error-state'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo, setDemo } from '@/lib/demo'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups } from '@/lib/pairs'
import { getLastPortfolio, savePortfolio, Snapshot } from '@/lib/portfolio'
import { getLastPurchase, Purchase } from '@/lib/purchases'
import { getBalances, getHoldings, getPricesAgo, getSeries, getStats, History, HoldingRow, Latest } from '@/lib/stats'
import { buildInsight, InsightCard } from '@/components/insight-card'
import { AlertsCard } from '@/components/alerts-card'
import { describeChange, getMultiplierChanges, MultiplierChange } from '@/lib/insights'

type Item = HoldingRow & {
  shares: number
  value: number | null
  buyValue: number | null
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
  const [allHist, setAllHist] = useState<History[]>([])
  const [ago, setAgo] = useState<Record<string, { px: number; ts: number }>>({})
  const [last, setLast] = useState<Purchase | null>(null)
  const [prev, setPrev] = useState<Snapshot | null>(null)
  const [demo, setDemoState] = useState(false)
  const modeRef = useRef<boolean | null>(null)
  const [usdc, setUsdc] = useState<number | null>(null)
  const scrollRef = useScrollReset()
  const lastScan = useRef(0)
  const statsAt = useRef(Date.now())
  const [busy, setBusy] = useState(false)
  const [mchanges, setMchanges] = useState<MultiplierChange[]>([])
  const [error, setError] = useState<string | null>(null)
  const insets = useSafeAreaInsets()
  const state = getMarketState()
  const market = MARKET_LABEL[state]
  const open = state === 'open'

  const scan = useCallback(async (useDemo?: boolean) => {
    lastScan.current = Date.now()
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
      setAllHist(stats.history)

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
        getBalances(String(addr)).then((b) => setUsdc(b.usdc)).catch(() => {})
      }
      if (asDemo) setUsdc(null)

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
          buyValue: l?.buy_px ? shares * l.buy_px : null,
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

  // Connecting on any tab connects the whole app, so load the portfolio as soon as the wallet is there.
  useEffect(() => {
    if (!account?.address) return
    isDemo().then((d) => { if (!d) scan(false) })
  }, [account?.address])

  useEffect(() => {
    getMultiplierChanges().then(setMchanges)
    getLastPortfolio().then(setPrev)
    getLastPurchase().then(setLast)
    isDemo().then((d) => { modeRef.current = d; setDemoState(d); if (d) scan(true) })
    getStats().then((s) => {
      const map: Record<string, Latest> = {}
      s.latest.forEach((r) => { map[r.symbol] = r })
      setLatest(map)
    }).catch(() => {})
  }, [scan])

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? null
  // Only compare against a snapshot taken in the same mode, so switching between
  // the demo portfolio and a real wallet never shows a fabricated change.
  const change = total !== null && prev && prev.demo === demo && prev.total > 0 ? total - prev.total : null
  const issuers = new Set(items?.map((i) => i.issuer)).size
  const unpriced = items?.filter((i) => i.value === null).length ?? 0
  // A 24h comparison is only meaningful when the earlier price really is about a day old.
  const agoOk = (sym: string) => !!ago[sym] && Date.now() / 1000 - ago[sym].ts <= 30 * 3600

  useEffect(() => {
    if (total === null || total <= 0 || unpriced > 0) return
    if (prev && prev.demo === demo && Date.now() - prev.at < 60 * 60 * 1000) return
    savePortfolio(total, demo).then(() => getLastPortfolio().then(setPrev))
  }, [total, prev, demo])

  const startDemo = async () => { await setDemo(true); modeRef.current = true; setDemoState(true); scan(true) }
  // Tabs stay mounted, so re-sync the demo/wallet mode whenever this tab gains focus.
  useFocusEffect(useCallback(() => {
    isDemo().then((d) => {
      if (modeRef.current === null) return
      if (d === modeRef.current) {
        if (lastScan.current > 0 && Date.now() - lastScan.current > 60000 && (d || account?.address)) scan(d)
        else if (Date.now() - statsAt.current > 60000) {
          // No portfolio to rescan: still keep the Daily Brief inputs current.
          statsAt.current = Date.now()
          getStats().then((st) => {
            const map: Record<string, Latest> = {}
            st.latest.forEach((r) => { map[r.symbol] = r })
            setLatest(map); setAllHist(st.history)
          }).catch(() => {})
        }
        return
      }
      modeRef.current = d
      setDemoState(d); setItems(null); setAgo({})
      getLastPortfolio().then(setPrev)
      if (d || account?.address) scan(d)
    })
  }, [account, scan]))
  const exitDemo = async () => { await setDemo(false); modeRef.current = false; setDemoState(false); setItems(null); setPrev(null) }

  // The collector measures each token about every 50 minutes, so anything older than 90 minutes is not a current reading.
  const isFresh = (l?: Latest) => !!l && Date.now() / 1000 - l.ts <= 5400
  const allLatest = Object.values(latest)
  const entries = allLatest.filter((l) => isUsable(l.entry_bps, l.quotable)).map((l) => l.entry_bps as number).sort((a, b) => a - b)
  const tracked = new Set(allLatest.map((l) => l.ticker)).size

  // 30-day share of measurements that were quotable, per token (needs a meaningful sample).
  const availability: Record<string, number> = {}
  const tally = new Map<string, { n: number; q: number }>()
  allHist.forEach((h) => {
    const b = tally.get(h.symbol) ?? { n: 0, q: 0 }
    b.n += h.samples
    b.q += h.samples * h.availability
    tally.set(h.symbol, b)
  })
  tally.forEach((b, symbol) => { if (b.n >= 50) availability[symbol] = Math.round((b.q / b.n) * 100) })

  // What it would cost to sell everything right now, from the latest exit quotes.
  const exitRows = (items ?? []).filter((i) => i.value !== null && i.exitBps !== null && isFresh(latest[i.symbol]))
  const exitValue = exitRows.reduce((n, i) => n + (i.value as number), 0)
  const exitCostUsd = exitRows.reduce((n, i) => n + ((i.value as number) * Math.max(0, i.exitBps as number)) / 10000, 0)
  const exitCostBps = exitValue > 0 ? Math.round((exitCostUsd / exitValue) * 10000) : null

  // Median entry cost across fresh, quotable tokens now, against the median usual cost in the same market state.
  const median = (xs: number[]) => {
    if (!xs.length) return null
    const a = [...xs].sort((x, y) => x - y)
    const m = Math.floor(a.length / 2)
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
  }
  const freshEntries = allLatest.filter((l) => isFresh(l) && isUsable(l.entry_bps, l.quotable))
  const cheapest = freshEntries.length ? freshEntries.reduce((a, b) => (a.entry_bps <= b.entry_bps ? a : b)) : null
  // The stock where the issuers differ most right now, as a concrete example for a visitor without a wallet.
  let example: { ticker: string; rows: Latest[]; gap: number } | null = null
  const byTicker = new Map<string, Latest[]>()
  freshEntries.forEach((l) => byTicker.set(l.ticker, [...(byTicker.get(l.ticker) ?? []), l]))
  for (const [ticker, rows] of Array.from(byTicker.entries())) {
    if (rows.length < 2) continue
    const v = rows.map((r) => Math.max(0, r.entry_bps))
    const gap = Math.max(...v) - Math.min(...v)
    if (!example || gap > example.gap) example = { ticker, rows: [...rows].sort((a, b) => a.entry_bps - b.entry_bps), gap }
  }
  const medianNow = median(freshEntries.map((l) => Math.max(0, l.entry_bps)))
  const medianUsual = median(
    allHist.filter((h) => h.market_state === state && h.samples * h.availability >= 10 && h.avg_entry !== null && h.avg_entry < 200).map((h) => Math.max(0, h.avg_entry))
  )

  // Holdings worth a look, most important first (unusual cost, rarely-tradable token, cheaper issuer).
  const ranked = (items ?? [])
    .filter((i) => i.entryBps !== null && isFresh(latest[i.symbol]))
    .map((i) => ({ i, ins: buildInsight(i, hist[i.symbol], availability[i.symbol] ?? null) }))
    .filter((x) => x.ins !== null)
    .sort((a, b) => (a.ins as any).rank - (b.ins as any).rank)
    .slice(0, 4)

  return (
    <ScrollView ref={scrollRef as any} style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}
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
              const matched = items!.filter((i) => i.buyValue !== null && agoOk(i.symbol))
              if (matched.length) {
                const nowVal = matched.reduce((n, i) => n + (i.buyValue as number), 0)
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
            <Text style={s.heroMeta}>{items!.length} assets · {issuers} issuer{issuers === 1 ? '' : 's'}{unpriced > 0 ? ` · ${unpriced} without a price right now, not counted` : ''}</Text>
            {usdc !== null && !demo && (
              <Text style={s.heroExit}>
                USDC balance <Text style={[s.heroExitStrong, num]}>${usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
                <Text style={s.heroChangeLabel}>  available to buy</Text>
              </Text>
            )}
            {exitCostBps !== null && (
              <Text style={s.heroExit}>
                Exit cost now <Text style={[s.heroExitStrong, num]}>${exitCostUsd.toFixed(2)} · {exitCostBps} bps</Text>
                {exitRows.length < items!.length ? <Text style={s.heroChangeLabel}>  ({exitRows.length} of {items!.length} assets)</Text> : null}
              </Text>
            )}
          </View>
          <PortfolioSpark
            tickers={items!.map((i) => i.ticker)}
            up={(() => {
              const m = items!.filter((i) => i.buyValue !== null && agoOk(i.symbol))
              if (!m.length) return undefined
              const now = m.reduce((n, i) => n + (i.buyValue as number), 0)
              const then = m.reduce((n, i) => n + i.shares * ago[i.symbol].px, 0)
              return now - then >= 0
            })()}
          />
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
      {total === null && example && example.gap >= 1 && (
        <View style={s.card2}>
          <Text style={s.kicker}>LIVE EXAMPLE</Text>
          <Text style={s.lastTitle}>Buying {example.ticker} right now</Text>
          {example.rows.map((r, idx) => (
            <View key={r.symbol} style={s.line}>
              <Text style={s.lineLabel}>{r.symbol} · {r.issuer}</Text>
              <Text style={[s.lineValue, num, idx === 0 && { color: T.accent }]}>{Math.max(0, r.entry_bps)} bps</Text>
            </View>
          ))}
          <Text style={s.stateSub}>Same stock, different issuer. On $100 the difference is ${(example.gap / 100).toFixed(2)}.</Text>
        </View>
      )}
      {demo && (
        <Pressable style={s.secondary} onPress={async () => { await exitDemo(); scan(false) }} disabled={busy}>
          <Text style={s.secondaryText}>Connect real wallet</Text>
        </Pressable>
      )}
      {!demo && <AlertsCard owner={account?.address ? String(account.address) : undefined} />}

      {error && <ErrorState message={error} onRetry={() => scan()} />}

      <Text style={s.sectionLabel}>FOR YOU</Text>
      {(items ?? []).flatMap((i) => mchanges.filter((c) => c.symbol === i.symbol)).map((c) => (
        <Pressable key={`mc-${c.symbol}`} style={s.mcard} onPress={() => router.push(`/passport?symbol=${c.symbol}`)}>
          <Text style={s.mkicker}>{c.symbol}</Text>
          <Text style={s.mtext}>{describeChange(c)}</Text>
        </Pressable>
      ))}
      <DailyBrief latest={latest} history={allHist} />
      {ranked.map(({ i }) => (
        <InsightCard key={i.symbol} item={i} hist={hist[i.symbol]} availability={availability[i.symbol] ?? null} states={allHist.filter((h) => h.symbol === i.symbol)} state={state} />
      ))}

      <View style={s.card2}>
        <View style={s.live}>
          <View style={[s.dot, { backgroundColor: open ? T.accent : T.warn }]} />
          <Text style={[s.stateTitle, { color: open ? T.accent : T.warn }]}>{market.title}</Text>
          <Text style={s.stateSub}>  {open ? 'US equities trading' : 'US equities closed'}</Text>
        </View>
        {cheapest && (
          <View style={s.line}>
            <Text style={s.lineLabel}>Cheapest entry now</Text>
            <Text style={[s.lineValue, num]}>{cheapest.symbol} · {Math.max(0, cheapest.entry_bps)} bps</Text>
          </View>
        )}
        {medianNow !== null && (
          <View style={s.line}>
            <Text style={s.lineLabel}>Median across tokens</Text>
            <Text style={[s.lineValue, num]}>
              {Math.round(medianNow)} bps{medianUsual !== null ? ` · usual ${Math.round(medianUsual)}` : ''}
            </Text>
          </View>
        )}
      </View>

      {last && !demo ? (
        <Pressable style={s.card2} onPress={() => Linking.openURL(`https://solscan.io/tx/${last.signature}`)}>
          <Text style={s.kicker}>LAST PURCHASE</Text>
          <Text style={s.lastTitle}>{last.symbol} · {last.issuer} · ${last.sizeUsd.toFixed(2)}</Text>
          <Text style={s.stateSub}>{new Date(last.at).toLocaleString()}</Text>
          {last.savedBps !== null && last.savedBps > 0 && (
            <Text style={s.saved}>Saved {last.savedBps} bps · ${((last.savedBps / 10000) * last.sizeUsd).toFixed(2)}</Text>
          )}
        </Pressable>
      ) : null}

      {items && items.length > 0 && (
        <Pressable style={s.analyticsCard} onPress={() => router.push('/analytics')}>
          <Text style={s.analyticsIcon}>▥</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.analyticsText}>Portfolio Analytics</Text>
            <Text style={s.stateSub}>Cost per asset, cheaper issuers, timing</Text>
          </View>
          <Text style={s.chev}>›</Text>
        </Pressable>
      )}
    </ScrollView>
  )
}


function DailyBrief({ latest, history }: { latest: Record<string, Latest>; history: History[] }) {
  const nowTs = Date.now() / 1000
  const bySymbol = new Map<string, { n: number; q: number }>()
  let openQ = 0, openSum = 0, offQ = 0, offSum = 0
  history.forEach((h) => {
    const q = h.samples * h.availability
    const b = bySymbol.get(h.symbol) ?? { n: 0, q: 0 }
    b.n += h.samples
    b.q += q
    bySymbol.set(h.symbol, b)
    if (q > 0 && h.avg_entry !== null && h.avg_entry < 200) {
      const v = Math.max(0, h.avg_entry) * q
      if (h.market_state === 'open') { openQ += q; openSum += v } else { offQ += q; offSum += v }
    }
  })

  let turnaround: { symbol: string; pct: number } | null = null
  for (const [symbol, b] of Array.from(bySymbol.entries())) {
    const l = latest[symbol]
    if (!l || b.n < 50 || !isUsable(l.entry_bps, l.quotable) || nowTs - l.ts > 5400) continue
    const pct = Math.round((b.q / b.n) * 100)
    if (pct < 50 && (turnaround === null || pct < turnaround.pct)) turnaround = { symbol, pct }
  }

  const bps = (v: number) => (v < 0.5 ? '~0 bps' : `${Math.round(v)} bps`)
  let regime: { openBps: number; offBps: number; pct: number; higher: boolean } | null = null
  if (openQ >= 50 && offQ >= 50) {
    const openBps = openSum / openQ
    const offBps = offSum / offQ
    if (openBps > 0 && Math.abs(offBps - openBps) / openBps >= 0.2) {
      regime = { openBps, offBps, pct: Math.round((Math.abs(offBps - openBps) / openBps) * 100), higher: offBps > openBps }
    }
  }

  return (
    <View style={s.briefCard}>
      <Text style={s.briefKicker}>DAILY BRIEF</Text>
      {turnaround && (
        <Text style={s.briefText}>
          {turnaround.symbol} has a quote right now, but over the last 30 days it was quotable only {turnaround.pct}% of the time.
          <Text style={s.briefNote}> Historical pattern, not a forecast.</Text>
        </Text>
      )}
      {regime && (
        <Text style={s.briefText}>
          Outside US market hours entry costs have averaged {bps(regime.offBps)}, against {bps(regime.openBps)} during the open session ({regime.pct}% {regime.higher ? 'higher' : 'lower'}).
          <Text style={s.briefNote}> Historical pattern, not a forecast.</Text>
        </Text>
      )}
      {!turnaround && !regime && <Text style={s.briefText}>Not enough observations yet.</Text>}
    </View>
  )
}
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  briefCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, gap: 8, marginBottom: 12 },
  briefKicker: { color: T.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  briefText: { color: T.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  briefNote: { color: T.faint, fontSize: 13 },
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
  mcard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.warn, borderRadius: 16, padding: 14, gap: 4 },
  mkicker: { color: T.warn, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  mtext: { color: T.text, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  heroExit: { color: T.dim, fontSize: 13, marginTop: 4 },
  heroExitStrong: { color: T.text, fontWeight: '700' },
  card2: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, gap: 6 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lineLabel: { color: T.dim, fontSize: 14 },
  lineValue: { color: T.text, fontSize: 14, fontWeight: '700' },

  sectionLabel: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 1 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { color: T.dim, fontSize: 14 },
  entry: { color: T.text, fontSize: 18, fontWeight: '700' },
  exit: { color: T.dim, fontSize: 14 },
  delta: { fontSize: 12, fontWeight: '600' },
  noQuote: { color: T.faint, fontSize: 12 },
  chev: { color: T.faint, fontSize: 18 },

  stateTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4 },
  stateSub: { color: T.faint, fontSize: 13 },
  lastTitle: { color: T.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
  saved: { color: T.accent, fontSize: 13, fontWeight: '600', marginTop: 2 },

  analyticsCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18, marginTop: 4 },
  analyticsIcon: { color: T.accent, fontSize: 18 },
  analyticsText: { color: T.text, fontSize: 16, fontWeight: '600' },

  warn: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: T.borderBright, borderRadius: 14, height: 48, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: T.text, fontSize: 15, fontWeight: '600' },
})


