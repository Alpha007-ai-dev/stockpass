import { useScrollReset } from '@/lib/use-scroll-reset'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { ErrorState } from '@/components/error-state'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { Collateral, getCollateral, getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'
import { kaminoBorrowUrl } from '@/lib/kamino'

type Row = {
  token: HoldingRow
  value: number | null
  markets: Collateral[]
  peerAccepted: string | null
}

export default function DefiScreen() {
  const { account, connect } = useMobileWallet() as any
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const modeRef = useRef<boolean | null>(null)
  const scrollRef = useScrollReset()

  const insets = useSafeAreaInsets()
  const load = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const [stats, collateral, groups] = await Promise.all([getStats(), getCollateral(), getGroups()])
      const latest = new Map<string, Latest>(stats.latest.map((l) => [l.symbol, l]))

      let holdings: HoldingRow[]
      if (await isDemo()) {
        const all = groups.flatMap((g) => g.tokens)
        holdings = DEMO_HOLDINGS.map((d) => {
          const t = all.find((x) => x.symbol === d.symbol)
          return t ? { ...t, walletAmount: d.walletAmount } : null
        }).filter(Boolean) as HoldingRow[]
      } else {
        const addr = account?.address ?? (await connect())?.address
        if (!addr) throw new Error('Wallet not connected')
        holdings = await getHoldings(String(addr))
      }

      setRows(holdings.map((token) => {
        const l = latest.get(token.symbol)
        const shares = token.walletAmount * (l?.multiplier ?? 1)
        const markets = collateral.filter((c) => c.symbol === token.symbol)
        const peers = groups.find((g) => g.ticker === token.ticker)?.tokens ?? []
        const accepted = peers.find((p) => p.symbol !== token.symbol && collateral.some((c) => c.symbol === p.symbol))
        return {
          token,
          value: l?.sell_px ? shares * l.sell_px : null,
          markets,
          peerAccepted: accepted ? accepted.symbol : null,
        }
      }).sort((a, b) => b.markets.length - a.markets.length))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => { isDemo().then((d) => { modeRef.current = d; if (d) load() }) }, [load])

  // Connecting on any tab connects the whole app, so load the holdings as soon as the wallet is there.
  useEffect(() => {
    if (!account?.address) return
    isDemo().then((d) => { if (!d) load() })
  }, [account?.address])

  // Tabs stay mounted, so re-sync the demo/wallet mode whenever this tab gains focus.
  useFocusEffect(useCallback(() => {
    isDemo().then((d) => {
      if (modeRef.current === null || d === modeRef.current) return
      modeRef.current = d
      setRows(null); setError(null)
      if (d || account?.address) load()
    })
  }, [account, load]))

  const supported = rows?.filter((r) => r.markets.length > 0) ?? []
  const blocked = rows?.filter((r) => r.markets.length === 0) ?? []
  const marketCount = supported.reduce((n, r) => n + r.markets.length, 0)
  const bestLtv = supported.flatMap((r) => r.markets).reduce((m, c) => Math.max(m, c.maxLtv), 0)
  const collateralValue = supported.reduce((n, r) => n + (r.value ?? 0), 0)

  return (
    <ScrollView ref={scrollRef as any} style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={T.dim} />}>

      <View style={s.header}>
        <Text style={s.title}>DeFi</Text>
        <Text style={s.sub}>What you can do with what you own</Text>
      </View>

      {!rows && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>Your tokenized stocks can be collateral</Text>
            <Text style={s.tiny}>
              Some issuers are accepted on Kamino lending markets, others are not. Connect your wallet to see which of
              your holdings can be used, at what loan-to-value, and at what borrowing rate.
            </Text>
          </View>
          {account?.address ? (
            <View style={{ paddingVertical: 12, alignItems: 'center' }}>
              {busy ? <ActivityIndicator color={T.accent} /> : <Text style={s.tiny}>Pull down to load your holdings.</Text>}
            </View>
          ) : (
            <Pressable style={s.primary} onPress={load} disabled={busy}>
              {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
            </Pressable>
          )}
        </>
      )}

      {error && <ErrorState message={error} onRetry={load} />}

      {rows && rows.length > 0 && (
        <>
          <View style={s.metricsRow}>
            <View style={[s.card, s.metricCard]}>
              <Text style={[s.metricValue, num, { color: T.accent }]}>{supported.length}</Text>
              <Text style={s.metricLabel}>supported{'\n'}assets</Text>
            </View>
            <View style={[s.card, s.metricCard]}>
              <Text style={[s.metricValue, num]}>{marketCount}</Text>
              <Text style={s.metricLabel}>lending{'\n'}markets</Text>
            </View>
            <View style={[s.card, s.metricCard]}>
              <Text style={[s.metricValue, num]}>{bestLtv > 0 ? `${Math.round(bestLtv * 100)}%` : '—'}</Text>
              <Text style={s.metricLabel}>highest{'\n'}max LTV</Text>
            </View>
          </View>

          {collateralValue > 0 && (
            <Text style={s.tiny}>
              ${collateralValue.toFixed(2)} of your holdings can be posted as collateral today.
            </Text>
          )}

          {supported.length > 0 && <Text style={s.sectionLabel}>AVAILABLE AS COLLATERAL</Text>}

          {supported.map((r) => {
            const best = r.markets.reduce((a, b) => (a.borrowApy <= b.borrowApy ? a : b))
            const ratio = Math.max(...r.markets.map((m) => m.borrowApy)) / Math.max(0.0001, Math.min(...r.markets.map((m) => m.borrowApy)))
            return (
              <View key={r.token.symbol} style={s.card}>
                <View style={s.assetHead}>
                  <TokenIcon icon={r.token.icon} symbol={r.token.symbol} label={r.token.ticker} issuer={r.token.issuer} size={40} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.symbol}>{r.token.symbol}</Text>
                    <Text style={[s.issuer, { color: issuerColor(r.token.issuer) }]}>{r.token.issuer}</Text>
                  </View>
                  <Text style={s.tiny}>{r.markets.length} market{r.markets.length === 1 ? '' : 's'}</Text>
                </View>

                {r.markets.map((m) => {
                  const biggest = r.markets.reduce((a, b) => (a.marketUsd >= b.marketUsd ? a : b))
                  const isBest = r.markets.length > 1 && best.market === m.market
                  const isBiggest = r.markets.length > 1 && biggest.market === m.market && biggest.market !== best.market
                  const solo = r.markets.length === 1
                  if (isBest || isBiggest || solo) {
                    return (
                      <View key={m.market} style={[s.marketBlock, isBest && s.marketBest, isBiggest && s.marketBig]}>
                        <View style={s.lineRow}>
                          <Text style={s.marketName}>{m.market}</Text>
                          {isBest && <Text style={s.bestTag}>LOWEST RATE</Text>}
                          {isBiggest && <Text style={s.bigTag}>LARGEST MARKET</Text>}
                        </View>
                        <View style={s.marketMetrics}>
                          <View>
                            <Text style={[s.ltv, num]}>{Math.round(m.maxLtv * 100)}%</Text>
                            <Text style={s.tinyLabel}>max LTV</Text>
                          </View>
                          <View>
                            <Text style={[s.apy, num, isBest && { color: T.accent }]}>{(m.borrowApy * 100).toFixed(2)}%</Text>
                            <Text style={s.tinyLabel}>{m.debtSymbol ? `${m.debtSymbol} borrow APY` : 'borrow APY'}</Text>
                          </View>
                          <View>
                            <Text style={[s.apy, num, { color: m.supplyApy >= 0.005 ? T.accent : T.dim }]}>{(m.supplyApy * 100).toFixed(2)}%</Text>
                            <Text style={s.tinyLabel}>supply APY</Text>
                          </View>
                          <View style={{ flex: 1, alignItems: 'flex-end' }}>
                            <Text style={[s.size, num]}>${(m.marketUsd / 1e6).toFixed(1)}M</Text>
                            <Text style={s.tinyLabel}>market size</Text>
                          </View>
                        </View>
                        <View style={s.tagRow}>
                          <Text style={s.tag}>Collateral ✓</Text>
                          {m.debt && m.debt.length > 0 && <Text style={s.tag}>Borrow {m.debt.map((d) => d.symbol).join(' · ')}</Text>}
                        </View>
                      </View>
                    )
                  }
                  return (
                    <View key={m.market} style={s.marketRow}>
                      <Text style={s.marketRowName} numberOfLines={1}>{m.market}</Text>
                      <Text style={[s.marketRowDetail, num]}>
                        {Math.round(m.maxLtv * 100)}% LTV · {(m.borrowApy * 100).toFixed(2)}% {m.debtSymbol ?? ''} borrow · {(m.supplyApy * 100).toFixed(2)}% supply · ${(m.marketUsd / 1e6).toFixed(1)}M
                      </Text>
                    </View>
                  )
                })}

                {r.markets.length > 1 && (
                  <Text style={s.tiny}>
                    Same collateral, {r.markets.length} markets. Borrowing costs {ratio.toFixed(1)}× more on the expensive one.
                  </Text>
                )}

                {r.markets.length > 1 && (() => {
                  const biggest = r.markets.reduce((a, b) => (a.marketUsd >= b.marketUsd ? a : b))
                  if (biggest.market === best.market) return null
                  return (
                    <Text style={s.tiny}>
                      Rates move with how much of a market is borrowed. The cheaper one here is also the smaller one
                      (${(best.marketUsd / 1e6).toFixed(1)}M against ${(biggest.marketUsd / 1e6).toFixed(1)}M), so its rate may be less settled.
                    </Text>
                  )
                })()}

                <Pressable onPress={() => Linking.openURL(kaminoBorrowUrl(r.token.mint))}>
                  <Text style={s.link}>Open in Kamino ›</Text>
                </Pressable>
              </View>
            )
          })}

          {blocked.length > 0 && <Text style={s.sectionLabel}>NOT AVAILABLE AS COLLATERAL</Text>}

          {blocked.map((r) => (
            <View key={r.token.symbol} style={s.blockedCard}>
              <View style={s.assetHead}>
                <TokenIcon icon={r.token.icon} symbol={r.token.symbol} label={r.token.ticker} issuer={r.token.issuer} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={s.symbol}>{r.token.symbol}</Text>
                  <Text style={[s.issuer, { color: issuerColor(r.token.issuer) }]}>{r.token.issuer}</Text>
                </View>
              </View>
              <Text style={s.blockedText}>
                Not accepted in the Kamino markets StockPass tracks.
                {r.peerAccepted ? ` ${r.peerAccepted} is accepted.` : ''}
              </Text>
            </View>
          ))}

          <View style={s.card}>
            <Text style={s.cardTitle}>How it works</Text>
            <Text style={s.tiny}>
              Lending markets accept some tokenized stocks as collateral, letting you borrow against a position instead
              of selling it. Loan-to-value sets how much you can borrow. What you borrow is a stablecoin such as USDC, and the borrow rate shown is that stablecoin's rate in each market.
            </Text>
            <Text style={s.tiny}>
              Tokenized stocks currently earn close to nothing as collateral, because almost nobody borrows them. The
              real cost of a position is the borrow rate you pay, not offset by supply yield.
            </Text>
            <Text style={s.tiny}>
              StockPass shows this information only. It does not deposit or borrow on your behalf, and the data comes
              from Kamino's public API, which can change at any time.
            </Text>
          </View>
        </>
      )}

      {rows && rows.length === 0 && (
        <View style={s.card}>
          <Text style={s.tiny}>No tokenized stocks in this wallet yet.</Text>
        </View>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },

  header: { paddingVertical: 8 },
  title: { color: T.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  sub: { color: T.dim, fontSize: 14, marginTop: 2 },

  metricsRow: { flexDirection: 'row', gap: 9 },
  metricCard: { flex: 1, alignItems: 'center', gap: 3, paddingVertical: 14, paddingHorizontal: 8 },
  metricValue: { color: T.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  metricLabel: { color: T.faint, fontSize: 12, textAlign: 'center', lineHeight: 15 },

  sectionLabel: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 1 },

  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 10 },
  cardTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  assetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { fontSize: 13, fontWeight: '600', marginTop: 1 },

  marketBlock: { backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 13, gap: 8 },
  marketBest: { borderWidth: 1.5, borderColor: T.accent },
  marketBig: { borderWidth: 1.5, borderColor: T.borderBright },
  bigTag: { color: T.dim, fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  bestTag: { color: T.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  tag: { color: T.accent, fontSize: 12, fontWeight: '600', backgroundColor: '#1A2410', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, overflow: 'hidden' },
  marketRow: { gap: 3, paddingVertical: 11, borderTopWidth: 1, borderTopColor: T.border },
  marketRowName: { color: T.text, fontSize: 14, fontWeight: '600' },
  marketRowDetail: { color: T.dim, fontSize: 13 },
  marketRowValue: { color: T.text, fontSize: 15, fontWeight: '600' },
  marketName: { color: T.dim, fontSize: 13, fontWeight: '600' },
  marketMetrics: { flexDirection: 'row', gap: 18, alignItems: 'flex-start' },
  ltv: { color: T.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  apy: { color: T.text, fontSize: 19, fontWeight: '700' },
  size: { color: T.dim, fontSize: 16, fontWeight: '600' },
  tinyLabel: { color: T.faint, fontSize: 11, marginTop: 1 },

  blockedCard: { backgroundColor: T.surface, borderWidth: 1, borderColor: '#3A2020', borderRadius: 16, padding: 16, gap: 9 },
  blockedText: { color: '#F8A0A0', fontSize: 13, lineHeight: 18 },

  tiny: { color: T.faint, fontSize: 13, lineHeight: 18 },
  link: { color: T.accent, fontSize: 14, fontWeight: '600' },
  warn: { color: T.warn, fontSize: 13 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})



