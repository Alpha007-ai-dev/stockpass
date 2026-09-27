import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { getGroups } from '@/lib/pairs'
import { savePurchase } from '@/lib/purchases'
import { buildSwapTx, decodeTx, getQuote, PAY_TOKENS, PLATFORM_FEE_BPS, Quote } from '@/lib/swap'
import { getStats, Latest, TokenRow } from '@/lib/stats'
import { isDemo } from '@/lib/demo'

const SIZE_USD = 1000
const MIN_SAVING_BPS = 5

type Option = { token: TokenRow; entry: number }

export default function BuyScreen() {
  const router = useRouter()
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const tk = ticker ?? 'SPY'
  const { account, connect, signAndSendTransaction } = useMobileWallet() as any

  const [options, setOptions] = useState<Option[] | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([getStats(), getGroups()])
      .then(([s, groups]) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        const g = groups.find((x) => x.ticker === tk)
        const opts = (g?.tokens ?? [])
          .map((token) => ({ token, l: map[token.symbol] }))
          .filter((o) => o.l && isUsable(o.l.entry_bps, o.l.quotable))
          .map((o) => ({ token: o.token, entry: o.l!.entry_bps! }))
          .sort((a, b) => a.entry - b.entry)
        setOptions(opts)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [tk])

  const selected = options?.[0] ?? null
  const alternative = options?.[1] ?? null
  const total = selected ? selected.entry + PLATFORM_FEE_BPS : null
  const netSaving = selected && alternative && total !== null ? alternative.entry - total : null
  const worthIt = netSaving !== null && netSaving >= MIN_SAVING_BPS

  const prepare = useCallback(async () => {
    if (!selected) return
    setBusy(true); setStatus(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getQuote(usdc, SIZE_USD, selected.token.mint, selected.token.decimals, selected.token.symbol)
      if (!q) throw new Error('No route available')
      setQuote(q)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [selected])

  const sign = useCallback(async () => {
    if (!quote || !selected) return
    setBusy(true); setStatus(null)
    try {
      if (await isDemo()) { setStatus('Demo mode: connect a real wallet to sign a transaction.'); setBusy(false); return }
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const b64 = await buildSwapTx(quote, String(addr))
      if (!b64) throw new Error('Could not build transaction')
      const sig = await signAndSendTransaction(decodeTx(b64), BigInt(quote.contextSlot))
      setStatus(`Sent: ${String(sig).slice(0, 20)}...`)
      await savePurchase({
        ticker: tk,
        symbol: selected.token.symbol,
        issuer: selected.token.issuer,
        sizeUsd: SIZE_USD,
        entryBps: selected.entry,
        feeBps: PLATFORM_FEE_BPS,
        altBps: alternative?.entry ?? null,
        savedBps: netSaving,
        signature: String(sig),
        at: Date.now(),
      })
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [quote, selected, alternative, netSaving, account, connect, signAndSendTransaction, tk])

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <Text style={s.kicker}>{worthIt ? 'BEST ENTRY' : 'ENTRY ROUTE'}</Text>
      <Text style={s.title}>Buy {tk}</Text>
      <Text style={s.faint}>${SIZE_USD.toLocaleString()} in USDC · {options?.length ?? 0} tradable issuer{options?.length === 1 ? '' : 's'}</Text>

      {!options && <Text style={s.faint}>Loading measurements…</Text>}
      {options?.length === 0 && <Text style={s.faint}>No issuer has a usable quote for {tk} right now.</Text>}

      {selected && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>{selected.token.symbol} · {selected.token.issuer}</Text>
            <View style={s.row}><Text style={s.label}>Entry cost</Text><Text style={[s.value, num]}>{selected.entry} bps</Text></View>
            <View style={s.row}><Text style={s.label}>StockPass fee</Text><Text style={[s.value, num]}>{PLATFORM_FEE_BPS} bps</Text></View>
            <View style={s.divider} />
            <View style={s.row}><Text style={s.labelStrong}>Your total</Text><Text style={[s.valueStrong, num]}>{total} bps</Text></View>
          </View>

          {options!.length > 1 && (
            <View style={s.card}>
              <Text style={s.label}>Other issuers</Text>
              {options!.slice(1).map((o) => (
                <View key={o.token.symbol} style={s.row}>
                  <Text style={s.label}>{o.token.symbol} · {o.token.issuer}</Text>
                  <Text style={[s.value, num]}>{o.entry} bps</Text>
                </View>
              ))}
              <View style={s.divider} />
              {worthIt ? (
                <>
                  <View style={s.row}><Text style={s.labelStrong}>You save</Text><Text style={[s.saving, num]}>{netSaving} bps</Text></View>
                  <Text style={s.faint}>${((netSaving! / 10000) * SIZE_USD).toFixed(2)} vs the next best route, after our fee.</Text>
                </>
              ) : (
                <>
                  <Text style={s.labelStrong}>No meaningful difference</Text>
                  <Text style={s.faint}>Only {netSaving} bps apart after the StockPass fee. Choose on availability or issuer instead.</Text>
                </>
              )}
            </View>
          )}

          {!quote ? (
            <Pressable style={s.primary} onPress={prepare} disabled={busy}>
              {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Review route</Text>}
            </Pressable>
          ) : (
            <>
              <View style={s.card}>
                <View style={s.row}><Text style={s.label}>You receive</Text><Text style={[s.value, num]}>{quote.outUi.toFixed(4)} {selected.token.symbol}</Text></View>
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
  content: { padding: 20, paddingBottom: 40, gap: 12 },
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

