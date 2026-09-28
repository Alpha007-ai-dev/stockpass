import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo, setDemo } from '@/lib/demo'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getGroups } from '@/lib/pairs'
import { getLastPortfolio, savePortfolio, Snapshot } from '@/lib/portfolio'
import { getLastPurchase, Purchase } from '@/lib/purchases'
import { getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'
import { TokenIcon } from '@/components/token-icon'

type Item = HoldingRow & { shares: number; value: number | null; exitBps: number | null }

function Avatar({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.avatar, { borderColor: color }]}>
      <Text style={[s.avatarText, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet() as any
  const [items, setItems] = useState<Item[] | null>(null)
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [last, setLast] = useState<Purchase | null>(null)
  const [demo, setDemoState] = useState(false)
  const [busy, setBusy] = useState(false)
  const [updated, setUpdated] = useState<Date | null>(null)
  const [prev, setPrev] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const market = MARKET_LABEL[getMarketState()]
  const [icons, setIcons] = useState<Record<string, string | null>>({})
  const iconFor = (ticker: string, issuer: string) => icons[ticker + "|" + issuer] ?? null

  const scan = useCallback(async (useDemo?: boolean) => {
    setBusy(true)
    setError(null)
    try {
      const asDemo = useDemo ?? (await isDemo())
      const stats = await getStats()
      const map: Record<string, Latest> = {}
      stats.latest.forEach((r) => { map[r.symbol] = r })
      setLatest(map)
      setUpdated(new Date())

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

      setItems(rows.map((r) => {
        const l = map[r.symbol]
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        return {
          ...r,
          shares,
          value: l?.buy_px ? shares * l.buy_px : null,
          exitBps: isUsable(l?.exit_bps, l?.quotable) ? (l!.exit_bps as number) : null,
        }
      }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => {
    getGroups().then((gs) => {
      const m: Record<string, string | null> = {}
      gs.forEach((g) => g.tokens.forEach((t) => { m[t.ticker + "|" + t.issuer] = t.icon ?? null }))
      setIcons(m)
    }).catch(() => {})
    getLastPortfolio().then(setPrev)
    getLastPurchase().then(setLast)
    isDemo().then((d) => { setDemoState(d); if (d) scan(true) })
    getStats()
      .then((s) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        setLatest(map)
        setUpdated(new Date())
      })
      .catch(() => {})
  }, [scan])

  const startDemo = async () => { await setDemo(true); setDemoState(true); scan(true) }
  const exitDemo = async () => { await setDemo(false); setDemoState(false); setItems(null) }

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? null
  const change = total !== null && prev && prev.total > 0 ? total - prev.total : null
  const changePct = change !== null && prev ? (change / prev.total) * 100 : null
  useEffect(() => {
    if (total === null || total <= 0) return
    if (prev && Date.now() - prev.at < 60 * 60 * 1000) return
    savePortfolio(total).then(() => getLastPortfolio().then(setPrev))
  }, [total, prev])
  const issuers = new Set(items?.map((i) => i.issuer)).size
  const ago = updated ? Math.max(1, Math.round((Date.now() - updated.getTime()) / 1000)) : null

  const allLatest = Object.values(latest)
  const entries = allLatest.filter((l) => isUsable(l.entry_bps, l.quotable)).map((l) => l.entry_bps as number).sort((a, b) => a - b)
  const snapshot = {
    stocks: new Set(allLatest.map((l) => l.ticker)).size,
    cheapest: entries.length ? entries[0] : null,
    median: entries.length ? entries[Math.floor(entries.length / 2)] : null,
    noQuote: allLatest.filter((l) => !l.quotable).length,
  }

  const insights: { tag: string; issuer: string; head: string; strong: string; tail: string; onPress: () => void }[] = []
  const seen = new Set<string>()
  allLatest.forEach((l) => {
    if (seen.has(l.ticker)) return
    const same = allLatest.filter((o) => o.ticker === l.ticker && isUsable(o.entry_bps, o.quotable))
    if (same.length < 2) return
    const costs = same.map((o) => o.entry_bps as number)
    const d = Math.max(...costs) - Math.min(...costs)
    if (d < 20) return
    seen.add(l.ticker)
    const cheap = same.reduce((a, b) => ((a.entry_bps as number) <= (b.entry_bps as number) ? a : b))
    insights.push({
      tag: l.ticker,
      issuer: cheap.issuer,
      head: `${cheap.issuer} is `,
      strong: `${d} bps cheaper`,
      tail: ' to enter right now.',
      onPress: () => router.push(`/compare?ticker=${l.ticker}`),
    })
  })
  const top = insights.slice(0, 2)

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={() => scan()} tintColor={T.dim} />}>

      {demo && (
        <View style={s.demoBar}>
          <Text style={s.demoText}>&#9679;  DEMO PORTFOLIO · real prices, sample amounts</Text>
          <Pressable onPress={exitDemo}><Text style={s.demoExit}>Exit</Text></Pressable>
        </View>
      )}

      <View style={s.topRow}>
        <Text style={s.brand}>StockPass</Text>
        <Text style={s.bell}>&#9788;</Text>
      </View>
      <Text style={s.sub}>{total !== null ? 'Your on-chain portfolio' : 'What you really pay to own a stock on-chain'}</Text>

      {total !== null ? (
        <>
          <Text style={[s.total, num]}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          {change !== null && changePct !== null && (
            <Text style={[s.change, num, { color: change >= 0 ? T.accent : T.down }]}>
              {change >= 0 ? '+' : '-'}${Math.abs(change).toFixed(2)} ({change >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </Text>
          )}
          <Text style={s.faint}>
            {items!.length} assets · {issuers} issuer{issuers === 1 ? '' : 's'}{ago ? ` · updated ${ago}s ago` : ''}
          </Text>
        </>
      ) : (
        <>
          <Text style={[s.total, num]}>{snapshot.stocks || '—'}</Text>
          <Text style={s.faint}>tokenized stocks tracked{ago ? ` · updated ${ago}s ago` : ''}</Text>
          <View style={s.miniRow}>
            <View style={s.mini}>
              <Text style={[s.miniNum, num, { color: T.accent }]}>{snapshot.cheapest ?? '—'}</Text>
              <Text style={s.miniLabel}>cheapest entry</Text>
            </View>
            <View style={s.mini}>
              <Text style={[s.miniNum, num]}>{snapshot.median ?? '—'}</Text>
              <Text style={s.miniLabel}>typical entry</Text>
            </View>
            <View style={s.mini}>
              <Text style={[s.miniNum, num, { color: T.warn }]}>{snapshot.noQuote}</Text>
              <Text style={s.miniLabel}>no quote</Text>
            </View>
          </View>
          <Pressable style={s.primary} onPress={() => scan(false)} disabled={busy}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
          </Pressable>
          <Pressable style={s.secondary} onPress={startDemo} disabled={busy}>
            <Text style={s.secondaryText}>Explore with a demo portfolio</Text>
          </Pressable>
        </>
      )}

      {error && <Text style={s.warn}>{error}</Text>}

      {top.length > 0 && (
        <>
          <View style={s.sectionRow}>
            <Text style={s.section}><Text style={{ color: T.accent }}>{top.length}</Text> things worth knowing</Text>
            <Text style={s.chev}>›</Text>
          </View>
          {top.map((i) => (
            <Pressable key={i.tag} style={s.insight} onPress={i.onPress}>
              <TokenIcon label={i.tag} issuer={i.issuer} icon={iconFor(i.tag, i.issuer)} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle}>{i.tag}</Text>
                <Text style={s.insightText}>
                  {i.head}<Text style={{ color: T.accent, fontWeight: '700' }}>{i.strong}</Text>{i.tail}
                </Text>
              </View>
              <Text style={s.chev}>›</Text>
            </Pressable>
          ))}
        </>
      )}

      <View style={s.card}>
        <Text style={s.tag}>{market.title}</Text>
        <Text style={s.faint}>{market.subtitle}</Text>
      </View>

      {last && (
        <>
          <View style={s.sectionRow}>
            <Text style={s.section}>Last purchase</Text>
            <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${last.signature}`)}>
              <Text style={s.link}>See all</Text>
            </Pressable>
          </View>
          <View style={s.insight}>
            <TokenIcon label={last.ticker} issuer={last.issuer} icon={iconFor(last.ticker, last.issuer)} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.rowTitle}>{last.ticker} · {last.issuer}</Text>
              <Text style={s.faint}>{new Date(last.at).toLocaleString()}</Text>
              <Text style={s.insightText}>
                {last.savedBps !== null && last.savedBps > 0
                  ? <>You saved <Text style={{ color: T.accent, fontWeight: '700' }}>{last.savedBps} bps · ${((last.savedBps / 10000) * last.sizeUsd).toFixed(2)}</Text></>
                  : `Entry ${last.entryBps} bps + ${last.feeBps} bps fee`}
              </Text>
            </View>
            <Text style={[s.chev, { color: T.accent }]}>✓</Text>
          </View>
        </>
      )}

      {items && items.length > 0 && (
        <>
          <View style={s.sectionRow}>
            <Text style={s.section}>Your holdings</Text>
            <Pressable onPress={() => router.push('/wallet')}><Text style={s.link}>See all</Text></Pressable>
          </View>
          {items.map((i) => (
            <Pressable key={i.symbol} style={s.insight} onPress={() => router.push(`/passport?symbol=${i.symbol}`)}>
              <TokenIcon label={i.ticker} issuer={i.issuer} icon={i.icon} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.rowTitle}>{i.symbol}</Text>
                <Text style={s.faint}>{i.ticker} · {i.shares.toFixed(4)} shares</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[s.rowValue, num]}>{i.value !== null ? `$${i.value.toFixed(2)}` : '—'}</Text>
                <Text style={s.faint}>{i.exitBps !== null ? `Exit cost ${i.exitBps} bps` : 'no quote'}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      {!last && !items && (
        <View style={s.card}>
          <Text style={s.faint}>Your first optimized purchase will appear here.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  demoBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: T.surfaceAlt, borderWidth: 1, borderColor: '#4A3A18', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, marginTop: 8 },
  demoText: { color: T.warn, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  demoExit: { color: T.warn, fontSize: 12, fontWeight: '700', paddingHorizontal: 8 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bell: { color: T.dim, fontSize: 20 },
  change: { fontSize: 15, fontWeight: '600', marginTop: 2 },
  brand: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { color: T.dim, fontSize: 13 },
  total: { color: T.text, fontSize: 40, fontWeight: '700', letterSpacing: -1.2, marginTop: 6 },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  mini: { flex: 1, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 12, gap: 2, alignItems: 'center' },
  miniNum: { color: T.text, fontSize: 26, fontWeight: '700' },
  miniLabel: { color: T.faint, fontSize: 11, textAlign: 'center' },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  section: { color: T.text, fontSize: 16, fontWeight: '700' },
  chev: { color: T.faint, fontSize: 20 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, paddingVertical: 16, paddingHorizontal: 15 },
  insightText: { color: T.dim, fontSize: 14, lineHeight: 20 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt },
  avatarText: { fontSize: 11, fontWeight: '800' },
  card: { backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 4 },
  tag: { color: T.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  rowTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  rowValue: { color: T.text, fontSize: 16, fontWeight: '700' },
  faint: { color: T.faint, fontSize: 13 },
  warn: { color: T.warn, fontSize: 13 },
  link: { color: T.accent, fontSize: 13, fontWeight: '600' },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: T.borderBright, borderRadius: 14, height: 50, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: T.text, fontSize: 14, fontWeight: '600' },
})












