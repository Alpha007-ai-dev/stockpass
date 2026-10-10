import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { fmtUsd } from '@/lib/format'
import { getGroups } from '@/lib/pairs'
import { feeBpsFor, PAY_TOKENS, PLATFORM_FEE_BPS, Quote, SKR_THRESHOLD } from '@/lib/swap'
import { getBestQuote, submitSwap } from '@/lib/swap2'
import { markTrade } from '@/lib/trade-signal'
import { getBalances, getHoldings, getStats, Latest, TokenRow } from '@/lib/stats'

const NETWORK_FEE_USD = 0.01
const PCTS = [25, 50, 75, 100]

export default function SellScreen() {
  const router = useRouter()
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? ''
  const { account, connect, signAndSendTransaction, signTransaction } = useMobileWallet() as any

  const [token, setToken] = useState<TokenRow | null>(null)
  const [latest, setLatest] = useState<Latest | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  // Why there is no balance: still loading, no wallet connected, the request failed, or the wallet really holds none.
  const [balState, setBalState] = useState<'loading' | 'ready' | 'none' | 'noWallet' | 'error'>('loading')
  const [balTry, setBalTry] = useState(0)
  const [pct, setPct] = useState(100)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [skr, setSkr] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [demo, setDemo] = useState(false)
  useEffect(() => {
    isDemo()
      .then(setDemo)
      .catch(() => {})
  }, [])
  const [status, setStatus] = useState<string | null>(null)
  const [done, setDone] = useState<{ symbol: string; amount: number; receiveUsd: number; signature: string } | null>(
    null,
  )

  useEffect(() => {
    Promise.all([getStats(), getGroups()])
      .then(([s, groups]) => {
        setLatest(s.latest.find((r) => r.symbol === sym) ?? null)
        setToken(groups.flatMap((g) => g.tokens).find((t) => t.symbol === sym) ?? null)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [sym])

  useEffect(() => {
    ;(async () => {
      try {
        if (await isDemo()) {
          const d = DEMO_HOLDINGS.find((x) => x.symbol === sym)?.walletAmount ?? null
          setBalance(d)
          setBalState(d !== null ? 'ready' : 'none')
          return
        }
        const addr = account?.address
        if (!addr) {
          setBalance(null)
          setBalState('noWallet')
          return
        }
        setBalState('loading')
        const rows = await getHoldings(String(addr))
        const held = rows.find((r) => r.symbol === sym)?.walletAmount ?? null
        setBalance(held)
        setBalState(held !== null ? 'ready' : 'none')
        getBalances(String(addr))
          .then((b) => setSkr(b.skr))
          .catch(() => {})
      } catch {
        setBalState('error')
      }
    })()
  }, [sym, account, balTry])

  const ok = latest ? isUsable(latest.exit_bps, latest.quotable) : false
  const amount = balance !== null ? (balance * pct) / 100 : null
  const shares = amount !== null && latest ? amount * latest.multiplier : null
  const grossUsd = shares !== null && latest?.sell_px ? shares * latest.sell_px : null
  // sell_px is already net of the exit cost, so measure the cost against the value before it.
  const exitFrac = ok ? Math.min(0.99, Math.max(0, latest!.exit_bps as number) / 10000) : 0
  const exitCostUsd = grossUsd !== null && ok ? (grossUsd / (1 - exitFrac)) * exitFrac : null
  const feeBps = feeBpsFor(skr)
  // The SKR balance can arrive after a quote was fetched: a quote made with the old fee must not stay on screen.
  useEffect(() => {
    setQuote(null)
  }, [feeBps])
  const inflight = useRef(false)
  const feeRef = useRef(feeBps)
  feeRef.current = feeBps
  const skrDiscount = feeBps < PLATFORM_FEE_BPS
  // On the v2 route Jupiter takes its own fee and StockPass takes none.
  const isV2 = quote?.route === 'v2'
  const chargedBps = isV2 ? quote!.feeBps : feeBps
  const feeUsd = grossUsd !== null ? (grossUsd * chargedBps) / 10000 : null
  const netUsd = grossUsd !== null && exitCostUsd !== null && feeUsd !== null ? grossUsd - feeUsd : null

  const prepare = useCallback(async () => {
    if (!token || amount === null || amount <= 0 || inflight.current) return
    inflight.current = true
    setBusy(true)
    setStatus(null)
    setQuote(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getBestQuote(
        {
          key: token.symbol,
          mint: token.mint,
          decimals: token.decimals,
          symbol: token.symbol,
          feeAccount: usdc.feeAccount,
        } as any,
        amount,
        usdc.mint,
        usdc.decimals,
        'USDC',
        feeBps,
      )
      if (!q) throw new Error('No route available for this amount right now.')
      // The SKR balance may have arrived while the quote was loading: a quote made with the old fee must not be shown.
      if (feeRef.current !== feeBps) throw new Error('Your fee tier just changed. Review again.')
      setQuote(q)
    } catch (e) {
      setStatus((e as Error).message)
    }
    inflight.current = false
    setBusy(false)
  }, [token, amount, feeBps])

  // On the v2 route Jupiter takes its own fee instead of the StockPass fee, so compare the quote against that estimate.
  const baselineUsd = quote?.route === 'v2' && grossUsd !== null ? grossUsd * (1 - quote.feeBps / 10000) : netUsd
  const blocked =
    quote !== null && (quote.priceImpactPct * 100 > 5 || (baselineUsd !== null && quote.outUi < baselineUsd * 0.9))
  const insets = useSafeAreaInsets()
  const sign = useCallback(async () => {
    if (!quote || inflight.current) return
    inflight.current = true
    let attempted = false
    setBusy(true)
    setStatus(null)
    try {
      if (await isDemo()) throw new Error('Demo mode cannot trade. Connect a real wallet.')
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      attempted = true
      const sig = await submitSwap(quote, String(addr), { signAndSendTransaction, signTransaction })
      markTrade()
      setStatus(null)
      setDone({ symbol: sym, amount: amount ?? 0, receiveUsd: quote.outUi, signature: String(sig) })
    } catch (e) {
      // After a signing attempt the sale may have gone through even though an error came back: drop the quote so the
      // button cannot sign a second sale, and send the user to the wallet history first.
      if (attempted) setQuote(null)
      setStatus(
        attempted ? `${(e as Error).message} Check your wallet history before trying again.` : (e as Error).message,
      )
    }
    inflight.current = false
    setBusy(false)
  }, [quote, account, connect, signAndSendTransaction, signTransaction, sym, amount])

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <View style={s.header}>
        {token && <TokenIcon icon={token.icon} symbol={sym} label={token.ticker} issuer={token.issuer} size={44} />}
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Sell {sym}</Text>
          {token && (
            <Text style={[s.subtitle, { color: issuerColor(token.issuer) }]} numberOfLines={1}>
              {token.issuer}
              {token.name ? ` · ${token.name}` : ''}
            </Text>
          )}
        </View>
      </View>

      {balance === null && balState === 'loading' && <ActivityIndicator color={T.accent} />}
      {balance === null && balState === 'noWallet' && <Text style={s.tiny}>Connect your wallet to sell {sym}.</Text>}
      {balance === null && balState === 'none' && <Text style={s.tiny}>You do not hold {sym} in this wallet.</Text>}
      {balance === null && balState === 'error' && (
        <Pressable onPress={() => setBalTry((n) => n + 1)}>
          <Text style={[s.tiny, { color: T.down }]}>Could not read your balance. Tap to try again.</Text>
        </Pressable>
      )}

      {balance !== null && !done && (
        <>
          <View style={s.card}>
            <Text style={s.kicker}>YOU SELL</Text>
            <Text style={[s.hero, num]}>
              {amount!.toFixed(4)} <Text style={s.heroUnit}>{sym}</Text>
            </Text>
            <Text style={s.tiny}>
              {shares !== null ? `${shares.toFixed(4)} ${token?.ticker ?? ''} shares` : ''}
              {grossUsd !== null ? ` · ≈ $${grossUsd.toFixed(2)}` : ''}
            </Text>

            <View style={s.pctRow}>
              {PCTS.map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    setPct(p)
                    setQuote(null)
                  }}
                  style={[s.pct, pct === p && s.pctOn]}
                >
                  <Text style={[s.pctText, pct === p && s.pctTextOn]}>{p === 100 ? 'Max' : `${p}%`}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.tiny}>
              Balance {balance.toFixed(4)} {sym}
            </Text>
          </View>

          {grossUsd !== null && (
            <View style={s.card}>
              <Text style={s.kicker}>COST BREAKDOWN</Text>
              <View style={s.row}>
                <Text style={s.label}>Proceeds at executable price</Text>
                <Text style={[s.value, num]}>${grossUsd.toFixed(2)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>
                  Included exit cost ({!ok ? '—' : (latest!.exit_bps as number) < 0 ? '~0' : latest!.exit_bps} bps)
                </Text>
                <Text style={[s.value, num]}>{exitCostUsd !== null ? `~${fmtUsd(exitCostUsd)}` : '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>
                  {isV2 ? `Jupiter fee (${chargedBps} bps)` : `StockPass fee (${feeBps} bps)`}
                </Text>
                <Text style={[s.value, num]}>
                  {feeUsd! > 0 ? '-' : ''}
                  {fmtUsd(feeUsd!)}
                </Text>
              </View>
              {isV2 ? null : skrDiscount ? (
                <View style={s.skrRow}>
                  <Text style={s.skrText}>
                    SKR holder · {feeBps} bps instead of {PLATFORM_FEE_BPS}
                  </Text>
                  <Text style={s.skrText}>✓</Text>
                </View>
              ) : (
                <Text style={s.tiny}>Hold {SKR_THRESHOLD} SKR and this fee drops to 2 bps.</Text>
              )}
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.totalLabel}>Est. receive</Text>
                <Text style={[s.totalValue, num]}>
                  {netUsd!.toFixed(2)}
                  <Text style={s.tiny}> USDC</Text>
                </Text>
              </View>
              <View style={s.row}>
                <Text style={s.tiny}>Network fee, paid in SOL (est.)</Text>
                <Text style={[s.tiny, num]}>~${NETWORK_FEE_USD.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {quote && (
            <View style={s.card}>
              <Text style={s.kicker}>ROUTE DETAILS</Text>
              <View style={s.row}>
                <Text style={s.label}>You receive</Text>
                <Text style={[s.small, num]}>{quote.outUi.toFixed(2)} USDC</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Route</Text>
                <Text style={s.small}>{quote.routeLabel ?? '-'}</Text>
              </View>
              {quote.altOutUi !== undefined && (
                <View style={s.row}>
                  <Text style={s.label}>Other route ({quote.altLabel})</Text>
                  <Text style={[s.small, num]}>{quote.altOutUi.toFixed(2)} USDC</Text>
                </View>
              )}
              {quote.route === 'v2' && (
                <View style={s.row}>
                  <Text style={s.label}>StockPass fee</Text>
                  <Text style={s.small}>none on this route</Text>
                </View>
              )}
              {baselineUsd !== null && (
                <View style={s.row}>
                  <Text style={s.label}>vs. estimate</Text>
                  <Text style={[s.small, num]}>
                    {quote.outUi - baselineUsd >= 0 ? '+' : '-'}${Math.abs(quote.outUi - baselineUsd).toFixed(2)}
                  </Text>
                </View>
              )}
              {quote.impactKnown !== false && (
                <View style={s.row}>
                  <Text style={s.label}>Price impact</Text>
                  <Text style={[s.small, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text>
                </View>
              )}
              <View style={s.row}>
                <Text style={s.label}>Slippage limit</Text>
                <Text style={[s.small, num]}>{quote.slippageBps} bps</Text>
              </View>
              {netUsd !== null && quote.outUi < netUsd * 0.99 && (
                <Text style={{ color: T.warn, fontSize: 13, lineHeight: 19 }}>
                  The live route returns {(((netUsd - quote.outUi) / netUsd) * 100).toFixed(1)}% less than the price we
                  measured. Compare it with the other route above before signing.
                </Text>
              )}
            </View>
          )}

          <Pressable
            style={[s.primary, (blocked || demo) && { opacity: 0.35 }]}
            onPress={quote ? sign : prepare}
            disabled={busy || !ok || blocked || demo}
          >
            {busy ? (
              <ActivityIndicator color={T.bg} />
            ) : (
              <Text style={s.primaryText}>
                {demo
                  ? 'Demo mode: selling is disabled'
                  : quote
                    ? blocked
                      ? 'Blocked: route loses too much'
                      : 'Review and sign'
                    : 'Review Sale'}
              </Text>
            )}
          </Pressable>
          {!ok && <Text style={s.tiny}>No executable quote right now, so this position cannot be priced.</Text>}
          {blocked && (
            <Text style={[s.tiny, { color: T.down }]}>
              This route would return far less than the price we measured, so signing is disabled. Try a smaller amount.
            </Text>
          )}
          <Text style={s.tiny}>You remain in control. The transaction requires wallet approval.</Text>
        </>
      )}

      {done && (
        <>
          <View style={s.card}>
            <Text style={s.kicker}>SALE SENT</Text>
            <Text style={[s.tiny, { color: T.text, fontSize: 15 }]}>
              {done.symbol} · {done.amount.toFixed(4)} sold
            </Text>
            <Text style={s.tiny}>
              Expected to receive about {done.receiveUsd.toFixed(2)} USDC, based on the reviewed quote, not the final
              fill.
            </Text>
            <Pressable onPress={() => Linking.openURL(`https://solscan.io/tx/${done.signature}`)}>
              <Text style={[s.tiny, { color: T.accent }]}>View on Solscan ›</Text>
            </Pressable>
          </View>
          <Pressable style={s.primary} onPress={() => router.replace('/wallet')}>
            <Text style={s.primaryText}>Done</Text>
          </Pressable>
        </>
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
  hero: { color: T.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  heroUnit: { color: T.dim, fontSize: 17, fontWeight: '600' },
  pctRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pct: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  pctOn: { backgroundColor: T.accent, borderColor: T.accent },
  pctText: { color: T.dim, fontSize: 14, fontWeight: '600' },
  pctTextOn: { color: T.bg, fontWeight: '700' },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 6 },
  skrRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1A2410',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  skrText: { color: T.accent, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  small: { color: T.dim, fontSize: 14 },
  totalLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: T.accent, fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
  primary: {
    backgroundColor: T.accent,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})
