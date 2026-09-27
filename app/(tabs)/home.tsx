import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { getMarketState, MARKET_LABEL } from '@/lib/market-hours'
import { getLastPurchase, Purchase } from '@/lib/purchases'
import { getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'

type Item = HoldingRow & { shares: number; value: number | null; exitBps: number | null }

export default function HomeScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet() as any
  const [items, setItems] = useState<Item[] | null>(null)
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [last, setLast] = useState<Purchase | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const market = MARKET_LABEL[getMarketState()]

  useEffect(() => { getLastPurchase().then(setLast) }, [])

  const scan = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const [rows, stats] = await Promise.all([getHoldings(String(addr)), getStats()])
      const map: Record<string, Latest> = {}
      stats.latest.forEach((r) => { map[r.symbol] = r })
      setLatest(map)
      setItems(rows.map((r) => {
        const l = map[r.symbol]
        const shares = r.walletAmount * (l?.multiplier ?? 1)
        return {
          ...r,
          shares,
          value: l?.buy_px ? shares * l.buy_px : null,
          exitBps: isUsable(l?.exit_bps, l?.quotable) ? l!.exit_bps : null,
        }
      }).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  const total = items?.reduce((n, i) => n + (i.value ?? 0), 0) ?? null
  const issuers = new Set(items?.map((i) => i.issuer)).size

  const insights: { tag: string; title: string; body: string; onPress?: () => void }[] = []
  const pairsSeen = new Set<string>()
  Object.values(latest).forEach((l) => {
    if (pairsSeen.has(l.ticker)) return
    const other = latest[l.issuer === 'Ondo' ? `${l.ticker}x` : `${l.ticker}on`]
    if (!other || !isUsable(l.entry_bps, l.quotable) || !isUsable(other.entry_bps, other.quotable)) return
    const d = Math.abs(l.entry_bps! - other.entry_bps!)
    if (d < 20) return
    pairsSeen.add(l.ticker)
    const cheap = l.entry_bps! <= other.entry_bps! ? l : other
    insights.push({
      tag: l.ticker,
      title: `Entry cost is ${d} bps lower through ${cheap.issuer}`,
      body: `${cheap.symbol} costs ${cheap.entry_bps} bps to enter right now.`,
      onPress: () => router.push(`/compare?ticker=${l.ticker}`),
    })
  })
  const top = insights.sort((a, b) => b.title.localeCompare(a.title)).slice(0, 2)

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={scan} tintColor={T.dim} />}>

      <Text style={s.brand}>StockPass</Text>
      <Text style={s.sub}>Your on-chain portfolio</Text>

      {total !== null ? (
        <>
          <Text style={[s.total, num]}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          <Text style={s.faint}>{items!.length} assets · {issuers} issuer{issuers === 1 ? '' : 's'}</Text>
        </>
      ) : (
        <Pressable style={s.primary} onPress={scan} disabled={busy}>
          {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
        </Pressable>
      )}

      {error && <Text style={s.warn}>{error}</Text>}

      {top.length > 0 && (
        <>
          <Text style={s.section}>{top.length} thing{top.length === 1 ? '' : 's'} worth knowing</Text>
          {top.map((i) => (
            <Pressable key={i.tag} style={s.card} onPress={i.onPress}>
              <Text style={s.tag}>{i.tag}</Text>
              <Text style={s.cardTitle}>{i.title}</Text>
              <Text style={s.faint}>{i.body}</Text>
            </Pressable>
          ))}
        </>
      )}

      <View style={s.card}>
        <Text style={s.tag}>{market.title}</Text>
        <Text style={s.faint}>{market.subtitle}</Text>
      </View>

      {items && items.length > 0 && (
        <>
          <Text style={s.section}>Your holdings</Text>
          {items.map((i) => (
            <Pressable key={i.symbol} style={s.row} onPress={() => router.push(`/passport?symbol=${i.symbol}`)}>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{i.symbol}</Text>
                <Text style={s.faint}>{i.shares.toFixed(4)} {i.ticker} · {i.issuer}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.rowValue, num]}>{i.value !== null ? `$${i.value.toFixed(2)}` : '—'}</Text>
                <Text style={s.faint}>{i.exitBps !== null ? `Exit cost ${i.exitBps} bps` : 'no quote'}</Text>
              </View>
            </Pressable>
          ))}
        </>
      )}

      <Text style={s.section}>Your activity</Text>
      {last ? (
        <View style={s.card}>
          <Text style={s.tag}>LAST PURCHASE</Text>
          <Text style={s.cardTitle}>{last.ticker} · {last.issuer}</Text>
          <Text style={s.faint}>
            {last.savedBps !== null && last.savedBps > 0
              ? `You saved ${last.savedBps} bps · $${((last.savedBps / 10000) * last.sizeUsd).toFixed(2)} vs the alternative`
              : `Entry ${last.entryBps} bps + ${last.feeBps} bps fee on $${last.sizeUsd}`}
          </Text>
          <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${last.signature}`)}>
            <Text style={s.link}>View transaction ›</Text>
          </Pressable>
        </View>
      ) : (
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
  brand: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { color: T.dim, fontSize: 13 },
  total: { color: T.text, fontSize: 40, fontWeight: '700', letterSpacing: -1.2, marginTop: 6 },
  section: { color: T.text, fontSize: 15, fontWeight: '600', marginTop: 10 },
  card: { backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 4 },
  cardTitle: { color: T.text, fontSize: 15, fontWeight: '600' },
  tag: { color: T.accent, fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 12 },
  rowTitle: { color: T.text, fontSize: 15, fontWeight: '600' },
  rowValue: { color: T.text, fontSize: 16, fontWeight: '700' },
  faint: { color: T.faint, fontSize: 12 },
  warn: { color: T.warn, fontSize: 13 },
  link: { color: T.accent, fontSize: 13, fontWeight: '600', marginTop: 4 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})

