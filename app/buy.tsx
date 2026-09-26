import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { STOCKS } from '../constants/stocks'
import { buildSwapTx, decodeTx, getQuote, PAY_TOKENS, Quote } from '../lib/swap'
import { getStats, Latest } from '../lib/stats'

const SIZE_USD = 1000
const APP_FEE_BPS = 0 // 10 bps once the fee token account exists
const MIN_SAVING_BPS = 5

export default function BuyScreen() {
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const stock = STOCKS.find((s) => s.ticker === (ticker ?? 'SPY')) ?? STOCKS[0]
  const { account, connect, signAndSendTransaction } = useMobileWallet() as any

  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [quote, setQuote] = useState<Quote | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((s) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        setLatest(map)
      })
      .catch((e) => setStatus((e as Error).message))
  }, [])

  const [x, on] = stock.tokens
  const lx = latest[x.symbol]
  const lon = latest[on.symbol]
  const ready = lx && lon && lx.quotable && lon.quotable
  const best = ready ? (lx.entry_bps <= lon.entry_bps ? x : on) : null
  const other = ready ? (best === x ? on : x) : null
  const gross = ready ? Math.abs(lx.entry_bps - lon.entry_bps) : 0
  const net = gross - APP_FEE_BPS
  const worthIt = net >= MIN_SAVING_BPS

  const prepare = useCallback(async () => {
    if (!best) return
    setBusy(true)
    setStatus(null)
    try {
      const usdc = PAY_TOKENS.find((t) => t.key === 'usdc')!
      const q = await getQuote(usdc, SIZE_USD, best.mint, best.decimals, best.symbol)
      if (!q) throw new Error('No route')
      setQuote(q)
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }, [best])

  const sign = useCallback(async () => {
    if (!quote) return
    setBusy(true)
    setStatus(null)
    try {
      const addr = account?.address ?? (await connect())?.address
      if (!addr) throw new Error('Wallet not connected')
      const b64 = await buildSwapTx(quote, String(addr))
      if (!b64) throw new Error('Could not build transaction')
      const tx = decodeTx(b64)
      const sig = await signAndSendTransaction(tx, BigInt(quote.contextSlot))
      setStatus(`Sent: ${String(sig).slice(0, 16)}...`)
    } catch (e) {
      setStatus((e as Error).message)
    }
    setBusy(false)
  }, [quote, account, connect, signAndSendTransaction])

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.kicker}>BEST ENTRY</Text>
      <Text style={s.title}>Buy {stock.ticker}</Text>
      <Text style={s.muted}>{stock.name} - ${SIZE_USD.toLocaleString()} in USDC</Text>

      {!ready && <Text style={s.muted}>Loading measurements...</Text>}

      {ready && best && other && (
        <>
          <View style={s.card}>
            <View style={s.row}><Text style={s.label}>Selected</Text><Text style={s.value}>{best.symbol} - {best.issuer}</Text></View>
            <View style={s.row}><Text style={s.label}>Entry cost</Text><Text style={s.value}>{latest[best.symbol].entry_bps} bps</Text></View>
            <View style={s.row}><Text style={s.label}>Alternative</Text><Text style={s.value}>{other.symbol} - {latest[other.symbol].entry_bps} bps</Text></View>
            <View style={s.row}><Text style={s.label}>App fee</Text><Text style={s.value}>{APP_FEE_BPS} bps</Text></View>
          </View>

          <View style={s.card}>
            {worthIt ? (
              <>
                <Text style={s.good}>Net saving vs {other.symbol}: {net} bps</Text>
                <Text style={s.tiny}>About ${((net / 10000) * SIZE_USD).toFixed(2)} on this size, after the app fee.</Text>
              </>
            ) : (
              <>
                <Text style={s.warn}>No meaningful saving after fees</Text>
                <Text style={s.tiny}>Both issuers cost about the same right now. Pick either one.</Text>
              </>
            )}
          </View>

          {!quote ? (
            <Pressable style={s.primary} onPress={prepare} disabled={busy}>
              {busy ? <ActivityIndicator color="#0E0E0D" /> : <Text style={s.primaryText}>Review route</Text>}
            </Pressable>
          ) : (
            <>
              <View style={s.card}>
                <View style={s.row}><Text style={s.label}>You receive</Text><Text style={s.value}>{quote.outUi.toFixed(4)} {best.symbol}</Text></View>
                <View style={s.row}><Text style={s.label}>Price impact</Text><Text style={s.value}>{(quote.priceImpactPct * 100).toFixed(3)}%</Text></View>
                <View style={s.row}><Text style={s.label}>Slippage</Text><Text style={s.value}>{quote.slippageBps} bps</Text></View>
              </View>
              <Pressable style={s.primary} onPress={sign} disabled={busy}>
                {busy ? <ActivityIndicator color="#0E0E0D" /> : <Text style={s.primaryText}>Sign in wallet</Text>}
              </Pressable>
            </>
          )}
        </>
      )}

      {status && <Text style={s.tiny}>{status}</Text>}
      <Text style={s.tiny}>You remain in control. The transaction requires wallet approval.</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0E0D' },
  content: { padding: 20, gap: 12 },
  kicker: { color: '#8A8A84', fontSize: 12, letterSpacing: 1 },
  title: { color: '#F5F5F1', fontSize: 32, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#262624', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#181817' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: '#A7A7A0', fontSize: 14 },
  value: { color: '#F5F5F1', fontSize: 14, textAlign: 'right', flexShrink: 1 },
  good: { color: '#D4F25A', fontSize: 16, fontWeight: '600' },
  warn: { color: '#E9B45A', fontSize: 16, fontWeight: '600' },
  muted: { color: '#A7A7A0', fontSize: 13 },
  tiny: { color: '#8A8A84', fontSize: 12 },
  primary: { backgroundColor: '#D4F25A', borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#0E0E0D', fontSize: 16, fontWeight: '600' },
})
