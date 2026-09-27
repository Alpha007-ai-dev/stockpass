import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '../constants/theme'
import { isUsable } from '../lib/cost'
import { getPairs, Pair } from '../lib/pairs'
import { buildSwapTx, decodeTx, getQuote, PAY_TOKENS, PLATFORM_FEE_BPS, Quote } from '../lib/swap'
import { getStats, Latest } from '../lib/stats'
import { savePurchase } from '../lib/purchases'

const SIZE_USD = 1000
const MIN_SAVING_BPS = 5

export default function BuyScreen() {
  const router = useRouter()
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const tk = ticker ?? 'SPY'
  const { account, connect, signAndSendTransaction } = useMobileWallet() as any

  const [pair, setPair] = useState<Pair | null>(null)
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getStats(), getPairs()])
      .then(([s, pairs]) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        setLatest(map)
        setPair(pairs.find((p) => p.ticker === tk) ?? null)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [tk])

  const x = pair?.x
  const on = pair?.on
  const lx = x ? latest[x.symbol] : undefined
  const lon = on ? latest[on.symbol] : undefined
  const xOk = isUsable(lx?.entry_bps, lx?.quotable)
  const onOk = isUsable(lon?.entry_bps, lon?.quotable)

  const selected = xOk && onOk ? (lx!.entry_bps! <= lon!.entry_bps! ? x! : on!) : xOk ? x! : onOk ? on! : null
  const alternative = selected && x && on ? (selected.symbol === x.symbol ? on : x) : null
  const selectedEntry = selected ? latest[selected.symbol]?.entry_bps ?? null : null
  const altEntry = alternative ? latest[alternative.symbol]?.entry_bps ?? null : null
  const total = selectedEntry !== null ? selectedEntry + PLATFORM_FEE_BPS : null
  const bothOk = xOk && onOk
  const netSaving = bothOk && total !== null && altEntry !== null ? altEntry - total : null
  const worthIt = netSaving !== null && netSaving >= MIN_SAVING_BPS

  const prepare = useCallback(async () => {
    if (!selected) return
    setBusy(true)
    setStatus(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getQuote(usdc, SIZE_USD, selected.mint, selected.decimals, selected.symbol)
      if (!q) throw new Error('No route available')
      setQuote(q)
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }, [selected])

  const sign = useCallback(async () => {
    if (!quote) return
    setBusy(true)
    setStatus(null)
    try {
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const b64 = await buildSwapTx(quote, String(addr))
      if (!b64) throw new Error('Could not build transaction')
      const sig = await signAndSendTransaction(decodeTx(b64), BigInt(quote.contextSlot))
      setStatus(`Sent: ${String(sig).slice(0, 20)}...`)
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }, [quote, account, connect, signAndSendTransaction, selected, selectedEntry, altEntry, netSaving, tk])

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}><Text style={s.backText}>‹ Back</Text></Pressable>

      <Text style={s.kicker}>{worthIt ? 'BEST ENTRY' : 'ENTRY ROUTE'}</Text>
      <Text style={s.title}>Buy {tk}</Text>
      <Text style={s.faint}>${SIZE_USD.toLocaleString()} in USDC</Text>

      {!selected && <Text style={s.faint}>{status ?? 'Loading measurements…'}</Text>}

      {selected && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>{selected.symbol} · {selected.issuer}</Text>
            <View style={s.row}><Text style={s.label}>Entry cost</Text><Text style={[s.value, num]}>{selectedEntry} bps</Text></View>
            <View style={s.row}><Text style={s.label}>StockPass fee</Text><Text style={[s.value, num]}>{PLATFORM_FEE_BPS} bps</Text></View>
            <View style={s.divider} />
            <View style={s.row}><Text style={s.labelStrong}>Your total</Text><Text style={[s.valueStrong, num]}>{total} bps</Text></View>
          </View>

          {alternative && (
            <View style={s.card}>
              <View style={s.row}>
                <Text style={s.label}>{alternative.symbol} · {alternative.issuer}</Text>
                <Text style={[s.value, num]}>{altEntry !== null ? `${altEntry} bps` : 'no quote'}</Text>
              </View>
              {netSaving !== null && (
                worthIt ? (
                  <>
                    <View style={s.divider} />
                    <View style={s.row}><Text style={s.labelStrong}>You save</Text><Text style={[s.saving, num]}>{netSaving} bps</Text></View>
                    <Text style={s.faint}>${((netSaving / 10000) * SIZE_USD).toFixed(2)} on ${SIZE_USD.toLocaleString()}, after our fee.</Text>
                  </>
                ) : (
                  <>
                    <View style={s.divider} />
                    <Text style={s.labelStrong}>No meaningful difference</Text>
                    <Text style={s.faint}>
                      Only {netSaving} bps apart after the StockPass fee. Choose on availability or issuer instead.
                    </Text>
                  </>
                )
              )}
              {!bothOk && <Text style={s.faint}>The other issuer has no usable quote right now.</Text>}
            </View>
          )}

          {!quote ? (
            <Pressable style={s.primary} onPress={prepare} disabled={busy}>
              {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Review route</Text>}
            </Pressable>
          ) : (
            <>
              <View style={s.card}>
                <View style={s.row}><Text style={s.label}>You receive</Text><Text style={[s.value, num]}>{quote.outUi.toFixed(4)} {selected.symbol}</Text></View>
                <View style={s.row}><Text style={s.label}>Fee charged</Text><Text style={[s.value, num]}>{quote.feeUi > 0 ? `${quote.feeUi.toFixed(4)} ${quote.feeSymbol}` : `${quote.feeBps} bps`}</Text></View>
                <View style={s.row}><Text style={s.label}>Price impact</Text><Text style={[s.value, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
                <View style={s.row}><Text style={s.label}>Slippage</Text><Text style={[s.value, num]}>{quote.slippageBps} bps</Text></View>
              </View>
              <Pressable style={s.primary} onPress={sign} disabled={busy}>
                {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Review and sign</Text>}
              </Pressable>
            </>
          )}
        </>
      )}

      {status && <Text style={s.faint}>{status}</Text>}
      <Text style={s.faint}>You remain in control. The transaction requires wallet approval.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  kicker: { color: T.faint, fontSize: 11, letterSpacing: 1.4 },
  title: { color: T.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.8 },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  cardTitle: { color: T.text, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  divider: { height: 1, backgroundColor: T.border },
  label: { color: T.dim, fontSize: 14 },
  labelStrong: { color: T.text, fontSize: 15, fontWeight: '600' },
  value: { color: T.text, fontSize: 14 },
  valueStrong: { color: T.text, fontSize: 18, fontWeight: '700' },
  saving: { color: T.accent, fontSize: 22, fontWeight: '700' },
  faint: { color: T.faint, fontSize: 12 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})


