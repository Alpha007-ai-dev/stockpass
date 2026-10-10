import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { savePurchase } from '@/lib/purchases'
import { PAY_TOKENS, Quote } from '@/lib/swap'
import { getBestQuote, submitSwap } from '@/lib/swap2'
import { markTrade } from '@/lib/trade-signal'
import { getBalances, getStats, Latest, TokenRow } from '@/lib/stats'

const DEFAULT_SIZE = 1000
const NETWORK_FEE_USD = 0.01
const MIN_SAVING_BPS = 5

type Option = { token: TokenRow; entry: number; px: number }

export default function BuyScreen() {
  const router = useRouter()
  const { ticker, symbol } = useLocalSearchParams<{ ticker?: string; symbol?: string }>()
  const { account, connect, signAndSendTransaction, signTransaction } = useMobileWallet() as any

  const [options, setOptions] = useState<Option[] | null>(null)
  const [selected, setSelected] = useState<Option | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [sizeText, setSizeText] = useState(String(DEFAULT_SIZE))
  const [usdc, setUsdc] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => { isDemo().then(setDemo).catch(() => {}) }, [])
  const [status, setStatus] = useState<string | null>(null)
  const [done, setDone] = useState<{ symbol: string; sizeUsd: number; entryBps: number; altBps: number | null; altIssuer: string | null; savedBps: number | null; signature: string } | null>(null)

  const tk = ticker ?? (symbol ? symbol.replace(/(x|on|bp)$/, '') : 'SPY')

  useEffect(() => {
    Promise.all([getStats(), getGroups()])
      .then(([s, groups]) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        const g = groups.find((x) => x.ticker === tk)
        const opts = (g?.tokens ?? [])
          .map((token) => ({ token, l: map[token.symbol] }))
          .filter((o) => o.l && isUsable(o.l.entry_bps, o.l.quotable) && (o.l.buy_px ?? 0) > 0)
          .map((o) => ({ token: o.token, entry: o.l!.entry_bps as number, px: o.l!.buy_px as number }))
          // The cheapest issuer is the one with the lowest price per share (entry cost included); a tie goes to the lower entry cost.
          .sort((a, b) => (a.px - b.px) || (a.entry - b.entry))
        setOptions(opts)
        setSelected(opts.find((o) => o.token.symbol === symbol) ?? opts[0] ?? null)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [tk, symbol])

  useEffect(() => {
    const addr = account?.address
    if (addr) {
      getBalances(String(addr))
        .then((b) => { setUsdc(b.usdc) })
        .catch(() => {})
    }
  }, [account])

  const SIZE_USD = Math.max(0, Number(sizeText.replace(/[^0-9.]/g, '')) || 0)
  const alternative = options?.find((o) => o.token.symbol !== selected?.token.symbol) ?? null
  const issuerCostUsd = selected ? (Math.max(0, selected.entry) / 10000) * SIZE_USD : null
  // Jupiter takes a platform fee in the output token, which needs a fee account per stock token; buys therefore carry no StockPass fee for now.
  const feeBps = 0
  // On the v2 route Jupiter takes its own fee and StockPass takes none; before a quote exists the v1 StockPass fee is shown.
  const isV2 = quote?.route === 'v2'
  const chargedBps = isV2 ? quote!.feeBps : feeBps
  const feeUsd = (chargedBps / 10000) * SIZE_USD
  const totalUsd = issuerCostUsd !== null ? issuerCostUsd + feeUsd + NETWORK_FEE_USD : null
  const totalBps = totalUsd !== null && SIZE_USD > 0 ? (totalUsd / SIZE_USD) * 10000 : null
  // Price per share already includes each issuer's entry cost, so the gap between the two prices is what choosing one over the other saves.
  const savingBps = selected && alternative ? Math.round((alternative.px / selected.px - 1) * 10000) : null
  const overBalance = !demo && usdc !== null && SIZE_USD > usdc


  const prepare = useCallback(async () => {
    if (!selected) return
    setBusy(true); setStatus(null)
    try {
      const usdc = { ...PAY_TOKENS.find((t) => t.key === 'usdc')!, feeAccount: '' }
      const q = await getBestQuote(usdc, SIZE_USD, selected.token.mint, selected.token.decimals, selected.token.symbol, feeBps)
      if (!q) throw new Error('No route available for this amount right now.')
      setQuote(q)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [selected, SIZE_USD, feeBps])


  // The demo cannot sign, so the Review button is disabled and the quote would never load. Fetch it
  // automatically (a read-only preview, nothing is signed) so the receive amount and route are visible.
  useEffect(() => {
    if (!demo || !selected || SIZE_USD <= 0 || quote) return
    const t = setTimeout(() => { prepare() }, 600)
    return () => clearTimeout(t)
  }, [demo, selected, SIZE_USD, quote, prepare])

  const blocked = quote !== null && quote.priceImpactPct * 100 > 5
  const insets = useSafeAreaInsets()
  const sign = useCallback(async () => {
    if (!quote || !selected) return
    setBusy(true); setStatus(null)
    try {
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const sig = await submitSwap(quote, String(addr), { signAndSendTransaction, signTransaction })
      setStatus(`Sent: ${String(sig).slice(0, 20)}...`)
      await savePurchase({
        ticker: tk,
        symbol: selected.token.symbol,
        issuer: selected.token.issuer,
        sizeUsd: SIZE_USD,
        entryBps: selected.entry,
        feeBps: quote.route === 'v2' ? 0 : feeBps,
        altBps: alternative?.entry ?? null,
        savedBps: savingBps,
        signature: String(sig),
        at: Date.now(),
      })
      markTrade()
      setStatus(null)
      setDone({
        symbol: selected.token.symbol,
        sizeUsd: SIZE_USD,
        entryBps: selected.entry,
        altBps: alternative?.entry ?? null,
        altIssuer: alternative?.token.issuer ?? null,
        savedBps: savingBps,
        signature: String(sig),
      })
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [quote, selected, alternative, savingBps, account, connect, signAndSendTransaction, signTransaction, tk, SIZE_USD])

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

      {selected && !done && (
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
                <Pressable onPress={() => { setSizeText((Math.floor(usdc * 100) / 100).toFixed(2)); setQuote(null) }} style={s.quick}>
                  <Text style={s.quickText}>Max</Text>
                </Pressable>
              )}
            </View>
            {usdc !== null && !demo && (
              <View style={s.row}>
                <Text style={s.label}>Your USDC balance</Text>
                <Text style={[s.value, num, SIZE_USD > usdc && { color: T.down }]}>
                  ${usdc.toFixed(2)}{SIZE_USD > usdc ? ' · not enough' : ''}
                </Text>
              </View>
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
              <Text style={[s.value, num]}>{issuerCostUsd! > 0 && issuerCostUsd! < 0.005 ? '<$0.01' : '$' + issuerCostUsd!.toFixed(2)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>Network fee (est.)</Text>
              <Text style={[s.value, num]}>~${NETWORK_FEE_USD.toFixed(2)}</Text>
            </View>
            <View style={s.row}>
              <Text style={s.label}>{isV2 ? `Jupiter fee (${chargedBps} bps)` : `StockPass fee (${feeBps} bps)`}</Text>
              <Text style={[s.value, num]}>{feeUsd > 0 && feeUsd < 0.005 ? '<$0.01' : '$' + feeUsd.toFixed(2)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.row}>
              <Text style={s.totalLabel}>Total cost</Text>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.totalValue, num, blocked && { color: T.down }]}>{blocked ? 'n/a' : '$' + totalUsd!.toFixed(2)}</Text>
                <Text style={s.tiny}>{blocked ? 'route unusable right now' : totalBps !== null ? totalBps.toFixed(1) + ' bps' : ''}</Text>
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
                    ${((savingBps / 10000) * SIZE_USD).toFixed(2)} less than {alternative.token.issuer} for the same stock
                  </Text>
                  <Text style={s.tiny}>
                    {selected!.token.symbol} ${selected!.px.toFixed(2)} vs {alternative.token.symbol} ${alternative.px.toFixed(2)} per share, entry cost included
                  </Text>
                </>
              ) : (
                <>
                  <Text style={s.kicker}>{blocked ? 'TRY THIS ISSUER INSTEAD' : 'ALTERNATIVE ISSUER'}</Text>
                  <View style={s.row}>
                    <Text style={s.label}>{alternative.token.symbol} · {alternative.token.issuer}</Text>
                    <Text style={[s.value, num]}>{alternative.entry} bps</Text>
                  </View>
                  <Text style={s.tiny}>
                    {savingBps <= -MIN_SAVING_BPS
                      ? `${alternative.token.symbol} costs ${Math.abs(savingBps)} bps less per share than your choice. Choose on issuer, availability or utility if that matters more.`
                      : `Only ${Math.abs(savingBps)} bps apart per share. Choose on issuer, availability or utility.`}
                  </Text>
                </>
              )}
            </View>
          )}

          {quote && (
            <View style={s.card}>
              <Text style={s.kicker}>ROUTE DETAILS</Text>
              <View style={s.row}><Text style={s.label}>Route</Text><Text style={s.small}>{quote.routeLabel ?? '-'}</Text></View>
              {quote.altOutUi !== undefined && (<View style={s.row}><Text style={s.label}>Other route ({quote.altLabel})</Text><Text style={[s.small, num]}>~{quote.altOutUi.toFixed(4)} {selected?.token.symbol}</Text></View>)}
              {quote.impactKnown !== false && (<View style={s.row}><Text style={s.label}>Price impact</Text><Text style={[s.small, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>)}
              <View style={s.row}><Text style={s.label}>Slippage limit</Text><Text style={[s.small, num]}>{quote.slippageBps} bps</Text></View>
              <View style={s.row}><Text style={s.label}>Fee charged</Text><Text style={[s.small, num]}>{quote.route === 'v2' ? `${quote.feeBps} bps (Jupiter, no StockPass fee)` : quote.feeUi > 0 ? `${quote.feeUi.toFixed(4)} ${quote.feeSymbol}` : `${quote.feeBps} bps`}</Text></View>
            </View>
          )}

          {blocked && <Text style={{ color: T.down, fontSize: 12, lineHeight: 17 }}>This route has a very high price impact, so signing is disabled. Try a smaller amount.</Text>}
          <Pressable style={[s.primary, (SIZE_USD <= 0 || blocked || demo || overBalance) && { opacity: 0.4 }]} onPress={quote ? sign : prepare} disabled={busy || SIZE_USD <= 0 || blocked || demo || overBalance}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>{demo ? 'Demo mode: buying is disabled' : quote ? (blocked ? 'Blocked: price impact too high' : 'Review and sign') : 'Review Purchase'}</Text>}
          </Pressable>
          {overBalance && <Text style={{ color: T.down, fontSize: 12 }}>This is more than the USDC in your wallet.</Text>}
          <Text style={s.tiny}>You remain in control. The transaction requires wallet approval.</Text>
        </>
      )}

      {done && (
        <View style={s.card}>
          <Text style={s.kicker}>TRADE SENT</Text>
          <Text style={[s.tiny, { color: T.text, fontSize: 15 }]}>
            {done.symbol} · ${done.sizeUsd.toFixed(2)}
          </Text>
          <Text style={s.tiny}>
            Cost at signing: {Math.max(0, done.entryBps)} bps (about ${((Math.max(0, done.entryBps) / 10000) * done.sizeUsd).toFixed(2)}).
            {done.savedBps !== null && done.savedBps > 0 && done.altBps !== null
              ? ` ${done.altIssuer ?? 'The other issuer'}'s token would have cost ${done.savedBps} bps more per share, entry cost included. That is about $${((done.savedBps / 10000) * done.sizeUsd).toFixed(2)} on this trade.`
              : ''}
          </Text>
          <Text style={s.tiny}>Based on the reviewed quote, not the final fill.</Text>
          <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${done.signature}`)}>
            <Text style={[s.tiny, { color: T.accent }]}>View on Solscan ›</Text>
          </Pressable>
        </View>
      )}
      {done && (
        <Pressable style={s.primary} onPress={() => router.replace('/wallet')}>
          <Text style={s.primaryText}>Done</Text>
        </Pressable>
      )}
      {status && !done && <Text style={s.tiny}>{status}</Text>}
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


