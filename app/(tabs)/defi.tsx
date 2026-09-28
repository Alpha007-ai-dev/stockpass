import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { Collateral, getCollateral, getHoldings, getStats, HoldingRow, Latest } from '@/lib/stats'

type Row = {
  token: HoldingRow
  value: number | null
  markets: Collateral[]
  peerAccepted: boolean
}

export default function DefiScreen() {
  const { account, connect } = useMobileWallet() as any
  const [rows, setRows] = useState<Row[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        const peerAccepted = peers.some((p) => p.symbol !== token.symbol && collateral.some((c) => c.symbol === p.symbol))
        return { token, value: l?.buy_px ? shares * l.buy_px : null, markets, peerAccepted }
      }).sort((a, b) => b.markets.length - a.markets.length))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }, [account, connect])

  useEffect(() => { isDemo().then((d) => { if (d) load() }) }, [load])

  const usable = rows?.filter((r) => r.markets.length > 0).length ?? 0
  const blocked = rows ? rows.length - usable : 0
  const collateralValue = rows?.filter((r) => r.markets.length > 0).reduce((n, r) => n + (r.value ?? 0), 0) ?? 0
  const bestLtv = rows?.flatMap((r) => r.markets).reduce((m, c) => Math.max(m, c.maxLtv), 0) ?? 0

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={T.dim} />}>

      <Text style={s.title}>DeFi</Text>
      <Text style={s.sub}>What you can do with what you own</Text>

      {!rows && (
        <>
          <View style={s.card}>
            <Text style={s.cardTitle}>Your tokenized stocks can be collateral</Text>
            <Text style={s.faint}>
              Some issuers are accepted on Kamino lending markets, others are not. Connect your wallet to see which of
              your holdings can be used, at what loan-to-value, and at what borrowing rate.
            </Text>
          </View>
          <Pressable style={s.primary} onPress={load} disabled={busy}>
            {busy ? <ActivityIndicator color={T.bg} /> : <Text style={s.primaryText}>Connect wallet</Text>}
          </Pressable>
        </>
      )}

      {error && <Text style={s.warn}>{error}</Text>}

      {rows && rows.length > 0 && (
        <>
          <View style={s.statsRow}>
            <View style={s.stat}>
              <Text style={[s.statNum, num, { color: T.accent }]}>{usable}</Text>
              <Text style={s.statLabel}>usable as collateral</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statNum, num, { color: T.warn }]}>{blocked}</Text>
              <Text style={s.statLabel}>not accepted</Text>
            </View>
            <View style={s.stat}>
              <Text style={[s.statNum, num]}>{Math.round(bestLtv * 100)}%</Text>
              <Text style={s.statLabel}>best max LTV</Text>
            </View>
          </View>

          {collateralValue > 0 && (
            <Text style={s.faint}>
              ${collateralValue.toFixed(2)} of your holdings can be posted as collateral today.
            </Text>
          )}

          {rows.map((r) => {
            const best = r.markets.length ? r.markets.reduce((a, b) => (a.borrowApy <= b.borrowApy ? a : b)) : null
            return (
              <View key={r.token.symbol} style={s.card}>
                <View style={s.head}>
                  <TokenIcon icon={r.token.icon} symbol={r.token.symbol} label={r.token.ticker} issuer={r.token.issuer} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.symbol}>{r.token.symbol}</Text>
                    <Text style={[s.faint, { color: issuerColor(r.token.issuer) }]}>{r.token.issuer}</Text>
                  </View>
                  <Text style={[s.value, num]}>{r.value !== null ? `$${r.value.toFixed(2)}` : ''}</Text>
                </View>

                {r.markets.length > 0 ? (
                  <>
                    {r.markets.map((m) => (
                      <View key={m.market} style={s.marketRow}>
                        <Text style={s.market}>{m.market}</Text>
                        <Text style={[s.small, num]}>{Math.round(m.maxLtv * 100)}% LTV</Text>
                        <Text style={[s.small, num, best?.market === m.market && { color: T.accent }]}>
                          {(m.borrowApy * 100).toFixed(2)}%
                        </Text>
                      </View>
                    ))}
                    {r.markets.length > 1 && (
                      <Text style={s.faint}>
                        Same token, {r.markets.length} markets. Borrowing costs{' '}
                        {(Math.max(...r.markets.map((m) => m.borrowApy)) / Math.max(0.0001, Math.min(...r.markets.map((m) => m.borrowApy)))).toFixed(1)}× more on the
                        expensive one.
                      </Text>
                    )}
                    <Pressable onPress={() => Linking.openURL('https://app.kamino.finance/')}>
                      <Text style={s.link}>Open in Kamino ›</Text>
                    </Pressable>
                  </>
                ) : (
                  <View style={s.blocked}>
                    <Text style={s.blockedText}>
                      Not accepted as collateral on Kamino.
                      {r.peerAccepted ? ` Another issuer of ${r.token.ticker} is accepted.` : ''}
                    </Text>
                  </View>
                )}
              </View>
            )
          })}

          <Text style={s.faint}>
            Collateral data comes from Kamino's public API and may change. Information only, not financial advice.
            StockPass does not deposit or borrow on your behalf.
          </Text>
        </>
      )}

      {rows && rows.length === 0 && (
        <Text style={s.faint}>No tokenized stocks in this wallet yet.</Text>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5, marginTop: 8 },
  sub: { color: T.dim, fontSize: 14 },
  statsRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, backgroundColor: T.surface, borderRadius: 16, borderWidth: 1, borderColor: T.border, padding: 12, alignItems: 'center', gap: 2 },
  statNum: { color: T.text, fontSize: 24, fontWeight: '700' },
  statLabel: { color: T.faint, fontSize: 11, textAlign: 'center' },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 9 },
  cardTitle: { color: T.text, fontSize: 16, fontWeight: '700' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  symbol: { color: T.text, fontSize: 16, fontWeight: '700' },
  value: { color: T.text, fontSize: 15, fontWeight: '600' },
  marketRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: T.border, paddingTop: 9 },
  market: { color: T.dim, fontSize: 13, flex: 1 },
  small: { color: T.text, fontSize: 14, fontWeight: '600' },
  blocked: { backgroundColor: '#2A1414', borderRadius: 12, padding: 10 },
  blockedText: { color: '#F8A0A0', fontSize: 12, lineHeight: 17 },
  faint: { color: T.faint, fontSize: 12, lineHeight: 17 },
  warn: { color: T.warn, fontSize: 13 },
  link: { color: T.accent, fontSize: 13, fontWeight: '600' },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})
