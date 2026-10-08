import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { buildSwapTx, decodeTx, feeBpsFor, getQuote, PAY_TOKENS, PLATFORM_FEE_BPS, Quote, SKR_THRESHOLD } from '@/lib/swap'
import { getBalances, getHoldings, getStats, Latest, TokenRow } from '@/lib/stats'

const NETWORK_FEE_USD = 0.01
const PCTS = [25, 50, 75, 100]

export default function SellScreen() {
  const router = useRouter()
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? ''
  const { account, connect, signAndSendTransaction } = useMobileWallet() as any

  const [token, setToken] = useState<TokenRow | null>(null)
  const [latest, setLatest] = useState<Latest | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [pct, setPct] = useState(100)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [skr, setSkr] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

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
          setBalance(DEMO_HOLDINGS.find((d) => d.symbol === sym)?.walletAmount ?? null)
          return
        }
        const addr = account?.address
        if (!addr) return
        const rows = await getHoldings(String(addr))
        setBalance(rows.find((r) => r.symbol === sym)?.walletAmount ?? null)
        getBalances(String(addr)).then((b) => setSkr(b.skr)).catch(() => {})
      } catch {}
    })()
  }, [sym, account])

  const ok = latest ? isUsable(latest.exit_bps, latest.quotable) : false
  const amount = balance !== null ? (balance * pct) / 100 : null
  const shares = amount !== null && latest ? amount * latest.multiplier : null
  const grossUsd = shares !== null && latest?.sell_px ? shares * latest.sell_px : null
  const exitCostUsd = grossUsd !== null && ok ? (grossUsd * Math.max(0, latest!.exit_bps as number)) / 10000 : null
  const feeBps = feeBpsFor(skr)
  const skrDiscount = feeBps < PLATFORM_FEE_BPS
  const feeUsd = grossUsd !== null ? (grossUsd * feeBps) / 10000 : null
  const netUsd = grossUsd !== null && exitCostUsd !== null && feeUsd !== null
    ? grossUsd - feeUsd
    : null

  const prepare = useCallback(async () => {
    if (!token || amount === null || amount <= 0) return
    setBusy(true); setStatus(null); setQuote(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getQuote(
        { key: token.symbol, mint: token.mint, decimals: token.decimals, symbol: token.symbol, feeAccount: usdc.feeAccount } as any,
        amount,
        usdc.mint,
        usdc.decimals,
        'USDC',
        feeBps,
      )
      if (!q) throw new Error('No route in the standard Jupiter router. This token is priced through Jupiter Ultra market makers, which this app version cannot execute yet.')
      setQuote(q)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [token, amount, feeBps])

  const blocked = quote !== null && (quote.priceImpactPct * 100 > 5 || (netUsd !== null && quote.outUi < netUsd * 0.9))
  const insets = useSafeAreaInsets()
  const sign = useCallback(async () => {
    if (!quote) return
    setBusy(true); setStatus(null)
    try {
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const b64 = await buildSwapTx(quote, String(addr))
      if (!b64) throw new Error('Could not build transaction')
      const sig = await signAndSendTransaction(decodeTx(b64), BigInt(quote.contextSlot))
      setStatus(`Sent: ${String(sig).slice(0, 20)}...`)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [quote, account, connect, signAndSendTransaction])

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
              {token.issuer}{token.name ? ` · ${token.name}` : ''}
            </Text>
          )}
        </View>
      </View>

      {balance === null && <Text style={s.tiny}>You do not hold {sym} in this wallet.</Text>}

      {balance !== null && (
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
                <Pressable key={p} onPress={() => { setPct(p); setQuote(null) }} style={[s.pct, pct === p && s.pctOn]}>
                  <Text style={[s.pctText, pct === p && s.pctTextOn]}>{p === 100 ? 'Max' : `${p}%`}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={s.tiny}>Balance {balance.toFixed(4)} {sym}</Text>
          </View>

          {grossUsd !== null && (
            <View style={s.card}>
              <Text style={s.kicker}>COST BREAKDOWN</Text>
              <View style={s.row}>
                <Text style={s.label}>Proceeds at executable price</Text>
                <Text style={[s.value, num]}>${grossUsd.toFixed(2)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Included exit cost ({!ok ? '—' : (latest!.exit_bps as number) < 0 ? '~0' : latest!.exit_bps} bps)</Text>
                <Text style={[s.value, num]}>{exitCostUsd !== null ? `~$${exitCostUsd.toFixed(2)}` : '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>StockPass fee ({feeBps} bps)</Text>
                <Text style={[s.value, num]}>-${feeUsd!.toFixed(2)}</Text>
              </View>
              {skrDiscount ? (
                <View style={s.skrRow}>
                  <Text style={s.skrText}>SKR holder · {feeBps} bps instead of {PLATFORM_FEE_BPS}</Text>
                  <Text style={s.skrText}>✓</Text>
                </View>
              ) : (
                <Text style={s.tiny}>Hold {SKR_THRESHOLD} SKR and this fee drops to 2 bps.</Text>
              )}
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.totalLabel}>Est. receive</Text>
                <Text style={[s.totalValue, num]}>{netUsd!.toFixed(2)}<Text style={s.tiny}> USDC</Text></Text>
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
              <View style={s.row}><Text style={s.label}>You receive</Text><Text style={[s.small, num]}>{quote.outUi.toFixed(2)} USDC</Text></View>
              <View style={s.row}><Text style={s.label}>Route</Text><Text style={s.small}>{quote.raw?.routePlan?.[0]?.swapInfo?.label ?? '-'}</Text></View>
              {netUsd !== null && (<View style={s.row}><Text style={s.label}>vs. estimate</Text><Text style={[s.small, num]}>{quote.outUi - netUsd >= 0 ? '+' : '-'}${Math.abs(quote.outUi - netUsd).toFixed(2)}</Text></View>)}
              <View style={s.row}><Text style={s.label}>Price impact</Text><Text style={[s.small, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
              <View style={s.row}><Text style={s.label}>Slippage limit</Text><Text style={[s.small, num]}>{quote.slippageBps} bps</Text></View>
              {netUsd !== null && quote.outUi < netUsd * 0.99 && (<Text style={{ color: T.warn, fontSize: 13, lineHeight: 19 }}>The live route returns {(((netUsd - quote.outUi) / netUsd) * 100).toFixed(1)}% less than the price we measured. Our measurements use Jupiter Ultra quotes, which can route through market makers. This swap uses the standard Jupiter router.</Text>)}
            </View>
          )}

          <Pressable style={[s.primary, blocked && { opacity: 0.35 }]} onPress={quote ? sign : prepare} disabled={busy || !ok || blocked}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>{quote ? (blocked ? 'Blocked: route loses too much' : 'Review and sign') : 'Review Sale'}</Text>}
          </Pressable>
          {!ok && <Text style={s.tiny}>No executable quote right now, so this position cannot be priced.</Text>}
          {blocked && <Text style={[s.tiny, { color: T.down }]}>This route would return far less than the price we measured, so signing is disabled. Try a smaller amount.</Text>}
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
  hero: { color: T.text, fontSize: 30, fontWeight: '800', letterSpacing: -1 },
  heroUnit: { color: T.dim, fontSize: 17, fontWeight: '600' },
  pctRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  pct: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  pctOn: { backgroundColor: T.accent, borderColor: T.accent },
  pctText: { color: T.dim, fontSize: 14, fontWeight: '600' },
  pctTextOn: { color: T.bg, fontWeight: '700' },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 6 },
  skrRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#1A2410', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  skrText: { color: T.accent, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  small: { color: T.dim, fontSize: 14 },
  totalLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: T.accent, fontSize: 20, fontWeight: '800', letterSpacing: -0.6 },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})


