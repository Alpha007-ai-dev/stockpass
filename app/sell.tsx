import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { buildSwapTx, decodeTx, getQuote, PAY_TOKENS, PLATFORM_FEE_BPS, Quote } from '@/lib/swap'
import { getHoldings, getStats, Latest, TokenRow } from '@/lib/stats'

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
      } catch {}
    })()
  }, [sym, account])

  const ok = latest ? isUsable(latest.exit_bps, latest.quotable) : false
  const amount = balance !== null ? (balance * pct) / 100 : null
  const shares = amount !== null && latest ? amount * latest.multiplier : null
  const grossUsd = shares !== null && latest?.sell_px ? shares * latest.sell_px : null
  const exitCostUsd = grossUsd !== null && ok ? (grossUsd * Math.max(0, latest!.exit_bps as number)) / 10000 : null
  const feeUsd = grossUsd !== null ? (grossUsd * PLATFORM_FEE_BPS) / 10000 : null
  const netUsd = grossUsd !== null && exitCostUsd !== null && feeUsd !== null
    ? grossUsd - exitCostUsd - feeUsd - NETWORK_FEE_USD
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
      )
      if (!q) throw new Error('No route available')
      setQuote(q)
    } catch (e) { setStatus((e as Error).message) }
    setBusy(false)
  }, [token, amount])

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
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
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
                <Text style={s.label}>Gross proceeds</Text>
                <Text style={[s.value, num]}>${grossUsd.toFixed(2)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Exit cost ({!ok ? '—' : (latest!.exit_bps as number) < 0 ? '~0' : latest!.exit_bps} bps)</Text>
                <Text style={[s.value, num]}>{exitCostUsd !== null ? `-$${exitCostUsd.toFixed(2)}` : '—'}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>Network fee (est.)</Text>
                <Text style={[s.value, num]}>-~${NETWORK_FEE_USD.toFixed(2)}</Text>
              </View>
              <View style={s.row}>
                <Text style={s.label}>StockPass fee ({PLATFORM_FEE_BPS} bps)</Text>
                <Text style={[s.value, num]}>-${feeUsd!.toFixed(2)}</Text>
              </View>
              <View style={s.divider} />
              <View style={s.row}>
                <Text style={s.totalLabel}>You receive</Text>
                <Text style={[s.totalValue, num]}>${netUsd!.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {quote && (
            <View style={s.card}>
              <Text style={s.kicker}>ROUTE DETAILS</Text>
              <View style={s.row}><Text style={s.label}>You receive</Text><Text style={[s.small, num]}>{quote.outUi.toFixed(2)} USDC</Text></View>
              <View style={s.row}><Text style={s.label}>Price impact</Text><Text style={[s.small, num]}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
              <View style={s.row}><Text style={s.label}>Slippage limit</Text><Text style={[s.small, num]}>{quote.slippageBps} bps</Text></View>
            </View>
          )}

          <Pressable style={s.primary} onPress={quote ? sign : prepare} disabled={busy || !ok}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>{quote ? 'Review and sign' : 'Review Sale'}</Text>}
          </Pressable>
          {!ok && <Text style={s.tiny}>No executable quote right now, so this position cannot be priced.</Text>}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  small: { color: T.dim, fontSize: 14 },
  totalLabel: { color: T.text, fontSize: 16, fontWeight: '700' },
  totalValue: { color: T.accent, fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})


