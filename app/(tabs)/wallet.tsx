import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '@/constants/theme'
import { TokenIcon } from '@/components/token-icon'
import { getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'
import { DEMO_HOLDINGS, isDemo, setDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'

type Item = HoldingRow & {
  shares: number
  value: number | null
  exitBps: number | null
  entryBps: number | null
  altSymbol: string | null
  altEntryBps: number | null
}

export default function WalletScreen() {
  const router = useRouter()
  const { account, connect } = useMobileWallet() as any
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scan = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const demo = await isDemo()
      let rows: HoldingRow[]
      let stats = await getStats()
      if (demo) {
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
      }
      const latest = new Map<string, Latest>(stats.latest.map((l) => [l.symbol, l]))

      const list: Item[] = rows.map((r) => {
        const mine = latest.get(r.symbol)
        const altSymbol = r.issuer === 'Ondo' ? `${r.ticker}x` : `${r.ticker}on`
        const alt = latest.get(altSymbol)
        return {
          ...r,
          shares: r.walletAmount * (mine?.multiplier ?? 1),
          value: mine?.sell_px ? r.walletAmount * (mine.multiplier ?? 1) * mine.sell_px : null,
          exitBps: mine?.quotable ? mine.exit_bps : null,
          entryBps: mine?.quotable ? mine.entry_bps : null,
          altSymbol: alt ? altSymbol : null,
          altEntryBps: alt?.quotable ? alt.entry_bps : null,
        }
      })
      setItems(list.sort((a, b) => b.shares - a.shares))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  const hidden = items?.reduce((n, i) => n + (i.shares - i.walletAmount), 0) ?? 0

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.title}>What you really own</Text>
      <Text style={s.sub}>Wallets show raw token counts. StockPass applies each issuer's multiplier.</Text>

      <Pressable style={s.primary} onPress={scan} disabled={busy}>
        {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>{items ? 'Scan again' : 'Scan my wallet'}</Text>}
      </Pressable>

      {error && <Text style={s.error}>{error}</Text>}
      {items?.length === 0 && <Text style={s.faint}>No tokenized stocks in this wallet yet.</Text>}

      {items && items.length > 0 && (() => {
        const priced = items.filter((i) => i.exitBps !== null && i.value !== null)
        const totalValue = priced.reduce((n, i) => n + (i.value as number), 0)
        const totalCost = priced.reduce((n, i) => n + ((i.value as number) * (i.exitBps as number)) / 10000, 0)
        const avgBps = totalValue > 0 ? (totalCost / totalValue) * 10000 : null
        return (
          <View style={s.card}>
            <Text style={s.costKicker}>PORTFOLIO COSTS</Text>
            <View style={s.row}>
              <Text style={s.faint}>Estimated exit cost</Text>
              <Text style={[s.costBig, num]}>${totalCost.toFixed(2)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.faint}>Average exit</Text>
              <Text style={[s.costSmall, num]}>{avgBps !== null ? `${avgBps.toFixed(1)} bps` : '—'}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.faint}>Executable now</Text>
              <Text style={s.costSmall}>{priced.length} of {items.length} holdings</Text>
            </View>
            <Text style={s.faint}>
              What it would cost to sell every position back to USDC at current quotes. Estimate, not a commitment.
            </Text>
          </View>
        )
      })()}

      {items && items.length > 0 && (() => {
        const rows = items.map((i) => {
          const cheaper = i.altEntryBps !== null && i.entryBps !== null && i.altEntryBps < i.entryBps
          const saving = cheaper ? (i.entryBps as number) - (i.altEntryBps as number) : 0
          const switching = i.exitBps !== null && i.altEntryBps !== null ? (i.exitBps as number) + (i.altEntryBps as number) : null
          const net = switching !== null ? saving - switching : null
          return { i, cheaper, saving, switching, net }
        })
        const onCheapest = rows.filter((r) => !r.cheaper).length
        return (
          <View style={{ gap: 10 }}>
            <Text style={s.costKicker}>OPPORTUNITIES</Text>
            <Text style={s.faint}>
              {onCheapest} of {rows.length} holdings are already on the cheapest route right now.
            </Text>

            {rows.map((r) => (
              <View key={r.i.symbol} style={s.card}>
                <View style={s.row}>
                  <Text style={s.symbol}>{r.i.symbol}</Text>
                  <Text style={[s.faint, !r.cheaper && { color: T.accent }]}>
                    {r.cheaper ? 'cheaper issuer exists' : 'cheapest route'}
                  </Text>
                </View>
                {r.cheaper && r.switching !== null ? (
                  <>
                    <Text style={s.faint}>
                      {r.i.altSymbol} is {r.saving} bps cheaper to enter. Switching costs {r.switching} bps.
                    </Text>
                    <Text style={[s.accent, (r.net ?? 0) < 0 && { color: T.warn }]}>
                      Net result: {(r.net ?? 0) >= 0 ? '+' : ''}{r.net} bps
                      {(r.net ?? 0) < 0 ? ' · not worth switching' : ' · switching could pay off'}
                    </Text>
                  </>
                ) : (
                  <Text style={s.faint}>
                    {r.cheaper ? 'No exit quote right now, so switching cannot be priced.' : 'You already hold the cheapest issuer for this stock.'}
                  </Text>
                )}
              </View>
            ))}

            <Text style={s.faint}>Cheapest to buy is not the same as cheapest for you.</Text>
          </View>
        )
      })()}

      {hidden > 0.00001 && (
        <View style={s.card}>
          <Text style={s.accent}>+{hidden.toFixed(4)} shares your wallet doesn't show</Text>
          <Text style={s.faint}>Reinvested dividends and corporate actions live in the multiplier.</Text>
        </View>
      )}

      {items?.map((i) => {
        const cheaper = i.entryBps !== null && i.altEntryBps !== null && i.altEntryBps < i.entryBps
        return (
          <Pressable key={i.symbol} style={s.card} onPress={() => router.push(`/passport?symbol=${i.symbol}`)}>
            <View style={s.row}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TokenIcon icon={i.icon} symbol={i.symbol} label={i.ticker} issuer={i.issuer} size={36} />
                <View style={{ gap: 2 }}>
                  <Text style={s.symbol}>{i.symbol}</Text>
                  <Text style={s.faint}>{i.issuer}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[s.shares, num]}>{i.shares.toFixed(4)} {i.ticker}</Text>
                <Text style={[s.faint, num]}>wallet shows {i.walletAmount.toFixed(4)}</Text>
              </View>
            </View>
            <View style={s.foot}>
              <Text style={s.faint}>Exit cost {i.entryBps !== null ? `${i.entryBps} bps` : 'no quote'}</Text>
              {cheaper && <Text style={s.accent}>{i.altSymbol} is {i.entryBps! - i.altEntryBps!} bps cheaper</Text>}
            </View>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  title: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginTop: 8 },
  sub: { color: T.dim, fontSize: 13 },
  card: { backgroundColor: T.surface, borderRadius: 16, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbol: { color: T.text, fontSize: 17, fontWeight: '600' },
  shares: { color: T.accent, fontSize: 17, fontWeight: '600' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingTop: 6 },
  faint: { color: T.faint, fontSize: 13 },
  accent: { color: T.accent, fontSize: 13, fontWeight: '600' },
  costKicker: { color: T.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  costBig: { color: T.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  costSmall: { color: T.text, fontSize: 15, fontWeight: '600' },
  error: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})











