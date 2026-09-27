import { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '@/constants/theme'
import { getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'

type Item = HoldingRow & {
  shares: number
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
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')

      const [rows, stats] = await Promise.all([getHoldings(String(addr)), getStats()])
      const latest = new Map<string, Latest>(stats.latest.map((l) => [l.symbol, l]))

      const list: Item[] = rows.map((r) => {
        const mine = latest.get(r.symbol)
        const altSymbol = r.issuer === 'Ondo' ? `${r.ticker}x` : `${r.ticker}on`
        const alt = latest.get(altSymbol)
        return {
          ...r,
          shares: r.walletAmount * (mine?.multiplier ?? 1),
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
              <View style={{ gap: 2 }}>
                <Text style={s.symbol}>{i.symbol}</Text>
                <Text style={s.faint}>{i.issuer}</Text>
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
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbol: { color: T.text, fontSize: 17, fontWeight: '600' },
  shares: { color: T.accent, fontSize: 17, fontWeight: '600' },
  foot: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8 },
  faint: { color: T.faint, fontSize: 12 },
  accent: { color: T.accent, fontSize: 13, fontWeight: '600' },
  error: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})

