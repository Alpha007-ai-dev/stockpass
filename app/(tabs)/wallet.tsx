import { useScrollReset } from '@/lib/use-scroll-reset'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { tradedSince } from '@/lib/trade-signal'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { PortfolioSpark } from '@/components/portfolio-spark'
import { issuerColor, num, T } from '@/constants/theme'
import { ErrorState } from '@/components/error-state'
import { bpsLabel, isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo, setDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { getHoldings, getPricesAgo, getStats, getUsdcBalance, HoldingRow, Latest } from '@/lib/stats'

type Item = HoldingRow & {
  shares: number
  value: number | null
  buyValue: number | null
  exitBps: number | null
}

export default function WalletScreen() {
  const router = useRouter()
  const { account, connect, disconnect } = useMobileWallet() as any
  const [items, setItems] = useState<Item[] | null>(null)
  const [usdc, setUsdc] = useState<number | null>(null)
  const [demo, setDemoState] = useState(false)
  const modeRef = useRef<boolean | null>(null)
  const scrollRef = useScrollReset()
  const lastScan = useRef(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ago, setAgo] = useState<Record<string, { px: number; ts: number }>>({})


  const insets = useSafeAreaInsets()
  const scan = useCallback(async () => {
    lastScan.current = Date.now()
    setBusy(true)
    setError(null)
    try {
      const asDemo = await isDemo()
      setDemoState(asDemo)
      const stats = await getStats()
      const latest = new Map<string, Latest>(stats.latest.map((l) => [l.symbol, l]))

      let rows: HoldingRow[]
      if (asDemo) {
        const groups = await getGroups()
        const all = groups.flatMap((g) => g.tokens)
        rows = DEMO_HOLDINGS.map((d) => {
          const t = all.find((x) => x.symbol === d.symbol)
          return t ? { ...t, walletAmount: d.walletAmount } : null
        }).filter(Boolean) as HoldingRow[]
      } else {
        const addr = account?.address ?? (await connect())?.address
        if (!addr) throw new Error('Wallet not connected')
        rows = await getHoldings(String(addr))
        getUsdcBalance(String(addr)).then(setUsdc).catch(() => {})
      }

      setItems(rows.map((r) => {
        const l = latest.get(r.symbol)
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        return {
          ...r,
          shares,
          value: l?.sell_px ? shares * l.sell_px : null,
          buyValue: l?.buy_px ? shares * l.buy_px : null,
          exitBps: l && isUsable(l.exit_bps, l.quotable) ? (l.exit_bps as number) : null,
        }
      }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
      getPricesAgo(rows.map((r) => r.symbol), 24).then(setAgo).catch(() => {})
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => { isDemo().then((d) => { modeRef.current = d; setDemoState(d); if (d) scan() }) }, [scan])

  // Connecting on any tab connects the whole app, so load the holdings as soon as the wallet is there.
  useEffect(() => {
    if (!account?.address) return
    isDemo().then((d) => { if (!d) scan() })
  }, [account?.address])

  // Tabs stay mounted, so re-sync the demo/wallet mode whenever this tab gains focus.
  useFocusEffect(useCallback(() => {
    isDemo().then((d) => {
      if (modeRef.current === null) return
      if (d === modeRef.current) {
        if (lastScan.current > 0 && (Date.now() - lastScan.current > 60000 || tradedSince(lastScan.current)) && (d || account?.address)) scan()
        return
      }
      modeRef.current = d
      setDemoState(d); setItems(null); setUsdc(null); setAgo({})
      if (d || account?.address) scan()
    })
  }, [account, scan]))

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? null
  const issuers = new Set(items?.map((i) => i.issuer)).size
  const unpriced = items?.filter((i) => i.value === null).length ?? 0
  const agoOk = (sym: string) => !!ago[sym] && Date.now() / 1000 - ago[sym].ts <= 30 * 3600
  const hidden = items?.reduce((n, i) => n + (i.shares - i.walletAmount), 0) ?? 0
  const addr = account?.address ? String(account.address) : null
  const shortAddr = addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : null

  return (
    <ScrollView ref={scrollRef as any} style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Text style={s.title}>Wallet</Text>
        {demo && <Text style={s.demoTag}>DEMO</Text>}
      </View>

      {total !== null ? (
        <View style={[s.heroCard, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.kicker}>TOTAL VALUE</Text>
          <Text style={[s.hero, num]}>
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </Text>
          {(() => {
            const matched = items!.filter((i) => i.buyValue !== null && agoOk(i.symbol))
            if (!matched.length) return null
            const nowVal = matched.reduce((n, i) => n + (i.buyValue as number), 0)
            const thenVal = matched.reduce((n, i) => n + i.shares * ago[i.symbol].px, 0)
            const d = nowVal - thenVal
            const pct = thenVal > 0 ? (d / thenVal) * 100 : 0
            return (
              <Text style={[s.change, num, { color: d >= 0 ? T.accent : T.down }]}>
                {d >= 0 ? '+' : '-'}${Math.abs(d).toFixed(2)} ({d >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                <Text style={s.changeLabel}>  24h price change</Text>
              </Text>
            )
          })()}
          <Text style={s.tiny}>{items!.length} asset{items!.length === 1 ? '' : 's'} · {issuers} issuer{issuers === 1 ? '' : 's'}{unpriced > 0 ? ` · ${unpriced} without a price right now, not counted` : ''}</Text>
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
          <Text style={s.kicker}>YOUR HOLDINGS</Text>
          <Text style={s.tiny}>
            Wallets show raw token counts. StockPass applies each issuer's multiplier to show what you really own.
          </Text>
          {account?.address && !demo ? (
            <View style={{ paddingVertical: 12 }}>
              {busy ? <ActivityIndicator color={T.accent} /> : <Text style={s.tiny}>Pull down to load your holdings.</Text>}
            </View>
          ) : (
            <Pressable style={s.primary} onPress={scan} disabled={busy}>
              {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
            </Pressable>
          )}
        </View>
      )}

      {error && <ErrorState message={error} onRetry={scan} />}

      {usdc !== null && !demo && (
        <View style={s.rowCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>USDC BALANCE</Text>
            <Text style={[s.metric, num]}>
              ${usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </Text>
          </View>
          <Text style={s.tiny}>{usdc > 0 ? 'available to buy' : 'add USDC to buy'}</Text>
        </View>
      )}

      {items && items.length > 0 && (
        <>
          <Text style={s.sectionLabel}>HOLDINGS</Text>

          {items.map((i) => (
            <Pressable key={i.symbol} style={s.card} onPress={() => router.push(`/passport?symbol=${i.symbol}`)}>
              <TokenIcon icon={i.icon} symbol={i.symbol} label={i.ticker} issuer={i.issuer} size={40} />

              <View style={{ flex: 1, gap: 3 }}>
                <View style={s.lineRow}>
                  <Text style={s.symbol}>{i.symbol}</Text>
                  <Text style={[s.value, num]}>{i.value !== null ? `$${i.value.toFixed(2)}` : '—'}</Text>
                </View>
                <View style={s.lineRow}>
                  <Text style={[s.issuer, { color: issuerColor(i.issuer) }]}>{i.issuer}</Text>
                  <Text style={[s.qty, num]}>{i.walletAmount.toFixed(4)} {i.symbol}</Text>
                </View>
                <View style={s.lineRow}>
                  <Text style={s.tiny}>{i.shares.toFixed(2)} {i.ticker} equivalent</Text>
                  <Text style={s.tiny}>{i.exitBps !== null ? `exit ${bpsLabel(i.exitBps)}` : 'no quote'}</Text>
                </View>
              </View>

              <Text style={s.chev}>›</Text>
            </Pressable>
          ))}

          {hidden >= 0.00005 && (
            <View style={s.noteCard}>
              <Text style={s.accent}>+{hidden.toFixed(4)} shares your wallet does not show</Text>
              <Text style={s.tiny}>
                Wallets display raw token counts. Reinvested dividends live in each issuer's multiplier.
              </Text>
            </View>
          )}

          <Pressable style={s.rowCard} onPress={() => router.push('/analytics')}>
            <View style={{ flex: 1 }}>
              <Text style={s.analyticsTitle}>Portfolio Analytics</Text>
              <Text style={s.tiny}>Costs · Exposure · Opportunities</Text>
            </View>
            <Text style={s.chev}>›</Text>
          </Pressable>
        </>
      )}

      {items?.length === 0 && (
        <View style={s.noteCard}>
          <Text style={s.tiny}>No tokenized stocks in this wallet yet.</Text>
        </View>
      )}

      {addr && !demo && (
        <View style={s.rowCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>CONNECTED</Text>
            <Text style={[s.addr, num]}>{shortAddr}</Text>
          </View>
          <Pressable onPress={() => { disconnect?.(); setItems(null); setUsdc(null) }}>
            <Text style={s.disconnect}>Disconnect</Text>
          </Pressable>
        </View>
      )}

      {!demo && (
        <Pressable
          style={s.rowCard}
          onPress={async () => { await setDemo(true); modeRef.current = true; setDemoState(true); setUsdc(null); scan() }}>
          <View style={{ flex: 1 }}>
            <Text style={s.analyticsTitle}>Switch to demo portfolio</Text>
            <Text style={s.tiny}>Real prices, sample amounts</Text>
          </View>
          <Text style={s.chev}>›</Text>
        </Pressable>
      )}

      {items && (
        <Pressable style={s.secondary} onPress={scan} disabled={busy}>
          {busy ? <ActivityIndicator color={T.text} /> : <Text style={s.secondaryText}>Refresh</Text>}
        </Pressable>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  title: { color: T.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  demoTag: { color: T.warn, fontSize: 11, fontWeight: '800', letterSpacing: 1, borderWidth: 1, borderColor: '#4A3A18', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },

  heroCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18, gap: 4 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  hero: { color: T.text, fontSize: 34, fontWeight: '800', letterSpacing: -1.2, marginTop: 4 },
  metric: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 3 },
  tiny: { color: T.faint, fontSize: 13, lineHeight: 18 },
  change: { fontSize: 16, fontWeight: '700' },
  changeLabel: { color: T.dim, fontSize: 14, fontWeight: '400' },

  sectionLabel: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 1 },

  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16 },
  noteCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 5 },

  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { fontSize: 13, fontWeight: '600' },
  value: { color: T.text, fontSize: 17, fontWeight: '700' },
  qty: { color: T.dim, fontSize: 13 },
  chev: { color: T.faint, fontSize: 18 },
  accent: { color: T.accent, fontSize: 14, fontWeight: '600' },
  analyticsTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  addr: { color: T.text, fontSize: 16, fontWeight: '600', marginTop: 3 },
  disconnect: { color: T.warn, fontSize: 14, fontWeight: '600' },

  error: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
  secondary: { borderWidth: 1, borderColor: T.borderBright, borderRadius: 12, height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  secondaryText: { color: T.text, fontSize: 15, fontWeight: '600' },
})
