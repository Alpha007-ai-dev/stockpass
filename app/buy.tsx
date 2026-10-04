import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { getGroups } from '@/lib/pairs'
import { savePurchase } from '@/lib/purchases'
import { buildSwapTx, decodeTx, feeBpsFor, getQuote, PAY_TOKENS, PLATFORM_FEE_BPS, Quote, SKR_THRESHOLD } from '@/lib/swap'
import { getBalances, getStats, Latest, TokenRow } from '@/lib/stats'

const DEFAULT_SIZE = 1000
const NETWORK_FEE_USD = 0.01
const MIN_SAVING_BPS = 5

type Option = { token: TokenRow; entry: number }

export default function BuyScreen() {
  const router = useRouter()
  const { ticker, symbol } = useLocalSearchParams<{ ticker?: string; symbol?: string }>()
  const { account, connect, signAndSendTransaction } = useMobileWallet() as any

  const [options, setOptions] = useState<Option[] | null>(null)
  const [selected, setSelected] = useState<Option | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [sizeText, setSizeText] = useState(String(DEFAULT_SIZE))
  const [usdc, setUsdc] = useState<number | null>(null)
  const [skr, setSkr] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const tk = ticker ?? (symbol ? symbol.replace(/(x|on|bp)$/, '') : 'SPY')

  useEffect(() => {
    Promise.all([getStats(), getGroups()])
      .then(([s, groups]) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        const g = groups.find((x) => x.ticker === tk)
        const opts = (g?.tokens ?? [])
          .map((token) => ({ token, l: map[token.symbol] }))
          .filter((o) => o.l && isUsable(o.l.entry_bps, o.l.quotable))
          .map((o) => ({ token: o.token, entry: o.l!.entry_bps as number }))
          .sort((a, b) => a.entry - b.entry)
        setOptions(opts)
        setSelected(opts.find((o) => o.token.symbol === symbol) ?? opts[0] ?? null)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [tk, symbol])

  useEffect(() => {
    const addr = account?.address
    if (addr) {
      getBalances(String(addr))
        .then((b) => { setUsdc(b.usdc); setSkr(b.skr) })
        .catch(() => {})
    }
  }, [account])

  const SIZE_USD = Math.max(0, Number(sizeText.replace(/[^0-9.]/g, '')) || 0)
  const alternative = options?.find((o) => o.token.symbol !== selected?.token.symbol) ?? null
  const issuerCostUsd = selected ? (Math.max(0, selected.entry) / 10000) * SIZE_USD : null
  const feeBps = feeBpsFor(skr)
  const skrDiscount = feeBps < PLATFORM_FEE_BPS
  const feeUsd = (feeBps / 10000) * SIZE_USD
  const totalUsd = issuerCostUsd !== null ? issuerCostUsd + feeUsd + NETWORK_FEE_USD : null
  const totalBps = totalUsd !== null ? (totalUsd / SIZE_USD) * 10000 : null
  // The StockPass fee applies to either issuer, so it cancels out of the comparison.
  const savingBps = selected && alternative ? alternative.entry - selected.entry : null


  const prepare = useCallback(async () => {
    if (!selected) return
    setBusy(true); setStatus(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getQuote(usdc, SIZE_USD, selected.token.mint, selected.token.decimals, selected.token.symbol, feeBps)
      if (!q) throw new Error('No route available')
      setQuote(q)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [selected, SIZE_USD, feeBps])


  const insets = useSafeAreaInsets()
  const sign = useCallback(async () => {
    if (!quote || !selected) return
    setBusy(true); setStatus(null)
    try {
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
        savedBps: savingBps,
        signature: String(sig),
        at: Date.now(),
      })
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [quote, selected, alternative, savingBps, account, connect, signAndSendTransaction, tk, SIZE_USD])

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <View style={s.header}>
        {selected && <TokenIcon icon={selected.token.icon} symbol={selected.token.symbol} label={tk} issuer={selected.token.issuer} size={44} />}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Buy {selected?.token.symbol ?? tk}</Text>
          {selected && (
            <Text style={[s.subtitle, { color: issuerColor(selected.token.issuer) }]} numberOfLines={1}>
              {selected.token.issuer}{selected.token.name ? ` · ${selected.token.name}` : ''}
            </Text>
          )}
        </View>
      </View>

      {!options && <ActivityIndicator color={T.dim} style={{ marginTop: 30 }} />}
      {options?.length === 0 && <Text style={s.tiny}>No issuer has a usable quote for {tk} right now.</Text>}

      {selected && (
        <>
          <View style={s.card}>
            <Text style={s.kicker}>YOU PAY</Text>
            <View style={s.inputRow}>
              <Text style={s.dollar}>$</Text>
              <TextInput
                value={sizeText}
                onChangeText={(t) => { setSizeText(t); setQuote(null) }}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={T.faint}
                style={[s.input, num]}
              />
              <Text style={s.inputUnit}>USDC</Text>
            </View>
            <View style={s.quickRow}>
              {[100, 500, 1000].map((v) => (
                <Pressable key={v} onPress={() => { setSizeText(String(v)); setQuote(null) }} style={s.quick}>
                  <Text style={s.quickText}>${v}</Text>
                </Pressable>
              ))}
              {usdc !== null && usdc > 0 && (
                <Pressable onPress={() => { setSizeText(usdc.toFixed(2)); setQuote(null) }} style={s.quick}>
                  <Text style={s.quickText}>Max</Text>
                </Pressable>
              )}
            </View>
            {usdc !== null && (
              <Text style={s.tiny}>
                Balance ${usdc.toFixed(2)} USDC{SIZE_USD > usdc ? ' · not enough for this size' : ''}
              </Text>
            )}

            <View style={s.divider} />

            <Text style={s.kicker}>YOU RECEIVE</Text>
            <Text style={[s.hero, num]}>
              {quote ? `~${quote.outUi.toFixed(4)}` : '—'} <Text style={s.heroUnit}>{selected.token.symbol}</Text>
            </Text>
            <Text style={s.tiny}>{quote ? `Est. price $${(SIZE_USD / quote.outUi).toFixed(2)}` : 'Review the route to get a quote'}</Text>
          </View>

          <View style={s.card}>
            <Text style={s.kicker}>COST BREAKDOWN</Text>
            <View style={s.row}>
              <Text style={s.label}>Issuer cost ({selected.entry < 0 ? '~0' : selected.entry} bps)</Text>
              <Text style={[s.value, num]}>${issuerCostUsd!.toFixed(2)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Network fee (est.)</Text>
              <Text style={[s.value, num]}>~${NETWORK_FEE_USD.toFixed(2)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>StockPass fee ({feeBps} bps)</Text>
              <Text style={[s.value, num]}>${feeUsd.toFixed(2)}</Text>
            </View>
            {skrDiscount ? (
              <View style={s.skrRow}>
                <Text style={s.skrText}>SKR holder · {feeBps} bps instead of {PLATFORM_FEE_BPS}</Text>
                <Text style={s.skrCheck}>✓</Text>
              </View>
            ) : (
              <Text style={s.tiny}>Hold {SKR_THRESHOLD} SKR and this fee drops to 2 bps.</Text>
            )}
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.totalLabel}>Total cost</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.totalValue, num]}>${totalUsd!.toFixed(2)}</Text>
                <Text style={s.tiny}>{totalBps!.toFixed(1)} bps</Text>
              </View>
            </View>
          </View>

          {alternative && savingBps !== null && (
            <View style={savingBps >= MIN_SAVING_BPS ? s.savingCard : s.card}>
              {savingBps >= MIN_SAVING_BPS ? (
                <>
                  <Text style={s.kickerAccent}>YOU SAVE</Text>
                  <Text style={[s.savingValue, num]}>{savingBps} bps</Text>
                  <Text style={s.savingSub}>
                    ${((savingBps / 10000) * SIZE_USD).toFixed(2)} vs {alternative.token.issuer} ({alternative.entry} bps)
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.kicker}>ALTERNATIVE ISSUER</Text>
                  <View style={s.row}>
                    <Text style={s.label}>{alternative.token.symbol} · {alternative.token.issuer}</Text>
                    <Text style={[s.value, num]}>{alternative.entry} bps</Text>
                  </View>
                  <Text style={s.tiny}>
                    Only {Math.abs(savingBps)} bps apart after the StockPass fee. Choose on issuer, availability or utility.
                  </Text>
                </>
              )}
            </View>
          )}

          {quote && (
            <View style={s.card}>
              <Text style={s.kicker}>ROUTE DETAILS</Text>
              <View style={s.row}><Text style={s.label}>Price impact</Text><Text style={[s.small, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
              <View style={s.row}><Text style={s.label}>Slippage limit</Text><Text style={[s.small, num]}>{quote.slippageBps} bps</Text></View>
              <View style={s.row}><Text style={s.label}>Fee charged</Text><Text style={[s.small, num]}>{quote.feeUi > 0 ? `${quote.feeUi.toFixed(4)} ${quote.feeSymbol}` : `${quote.feeBps} bps`}</Text></View>
            </View>
          )}

          <Pressable style={[s.primary, SIZE_USD <= 0 && { opacity: 0.4 }]} onPress={quote ? sign : prepare} disabled={busy || SIZE_USD <= 0}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>{quote ? 'Review and sign' : 'Review Purchase'}</Text>}
          </Pressable>
          <Text style={s.tiny}>You remain in control. The transaction requires wallet approval.</Text>
        </>
      )}

      {status && <Text style={s.tiny}>{status}</Text>}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },

  header: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingBottom: 4 },
  title: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, fontWeight: '600', marginTop: 2 },

  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 8 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  kickerAccent: { color: T.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  hero: { color: T.text, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  heroUnit: { color: T.dim, fontSize: 18, fontWeight: '600' },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 6 },
  skrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A2410', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  skrText: { color: T.accent, fontSize: 13, fontWeight: '600' },
  skrCheck: { color: T.accent, fontSize: 14, fontWeight: '700' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  dollar: { color: T.text, fontSize: 30, fontWeight: '800' },
  input: { flex: 1, color: T.text, fontSize: 32, fontWeight: '800', letterSpacing: -1, padding: 0 },
  inputUnit: { color: T.dim, fontSize: 16, fontWeight: '600' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  quick: { borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  quickText: { color: T.dim, fontSize: 14, fontWeight: '600' },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  small: { color: T.dim, fontSize: 14 },
  totalLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: T.accent, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },

  savingCard: { backgroundColor: '#16210C', borderWidth: 1.5, borderColor: T.accent, borderRadius: 16, padding: 16, gap: 3, alignItems: 'center' },
  savingValue: { color: T.accent, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  savingSub: { color: T.text, fontSize: 14 },

  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})


