import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { issuerColor, num, T } from '@/constants/theme'
import { TokenIcon } from '@/components/token-icon'
import { isUsable } from '@/lib/cost'
import { getGroups, Group } from '@/lib/pairs'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getHoldings } from '@/lib/stats'
import { compact, getStats, Latest } from '@/lib/stats'

const ISSUER_NOTE: Record<string, string> = {
  xStocks: 'Trades in on-chain pools. Dividends via multiplier.',
  Ondo: 'Quotes from RFQ market makers. Total-return tracker.',
  Backpack: 'Issued by Backpack Securities.',
}

export default function CompareScreen() {
  const router = useRouter()
  const { ticker } = useLocalSearchParams<{ ticker?: string }>()
  const tk = ticker ?? 'SPY'
  const [group, setGroup] = useState<Group | null>(null)
  const [latest, setLatest] = useState<Record<string, Latest>>({})
  const [error, setError] = useState<string | null>(null)
  const { account } = useMobileWallet() as any
  const [held, setHeld] = useState<{ symbol: string; amount: number } | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        if (await isDemo()) {
          const d = DEMO_HOLDINGS.find((h) => h.symbol.startsWith(tk))
          setHeld(d ? { symbol: d.symbol, amount: d.walletAmount } : null)
          return
        }
        const addr = account?.address
        if (!addr) return
        const rows = await getHoldings(String(addr))
        const row = rows.find((r) => r.ticker === tk)
        setHeld(row ? { symbol: row.symbol, amount: row.walletAmount } : null)
      } catch {}
    })()
  }, [tk, account])

  useEffect(() => {
    Promise.all([getStats(), getGroups()])
      .then(([s, groups]) => {
        const map: Record<string, Latest> = {}
        s.latest.forEach((r) => { map[r.symbol] = r })
        setLatest(map)
        setGroup(groups.find((g) => g.ticker === tk) ?? null)
      })
      .catch((e) => setError((e as Error).message))
  }, [tk])

  const tokens = group?.tokens ?? []
  const rows = tokens.map((t) => ({ token: t, l: latest[t.symbol] as Latest | undefined }))
  const usable = rows.filter((r) => r.l && isUsable(r.l.entry_bps, r.l.quotable)) as { token: any; l: Latest }[]
  const best = usable.length ? usable.reduce((a, b) => (a.l.entry_bps! <= b.l.entry_bps! ? a : b)) : null
  const worst = usable.length > 1 ? usable.reduce((a, b) => (a.l.entry_bps! >= b.l.entry_bps! ? a : b)) : null
  const spread = best && worst ? worst.l.entry_bps! - best.l.entry_bps! : null
  const maxBps = Math.max(1, ...usable.map((r) => r.l.entry_bps!))
  const multipliers = new Set(rows.filter((r) => r.l).map((r) => r.l!.multiplier.toFixed(4)))

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <Text style={s.h1}>Compare</Text>
      <Text style={s.h2}>Same underlying.{'\n'}Different representation.</Text>
      <Text style={s.faint}>{tk} · {rows.length} issuer{rows.length === 1 ? '' : 's'} on Solana</Text>

      {rows.length > 1 && rows.length <= 3 && (
        <View style={s.race}>
          {rows.map(({ token, l }) => {
            const ok = !!l && isUsable(l.entry_bps, l.quotable)
            const isBest = best?.token.symbol === token.symbol && usable.length > 1
            const h = ok ? Math.max(8, Math.round(((l!.entry_bps as number) / maxBps) * 70)) : 0
            return (
              <View key={token.symbol} style={[s.raceCol, isBest && s.raceBest]}>
                {isBest && <Text style={s.bestTag}>BEST</Text>}
                <Text style={[s.raceIssuer, { color: issuerColor(token.issuer) }]}>{token.issuer}</Text>
                <Text style={[s.raceCost, num, isBest && { color: T.accent }]}>
                  {ok ? `${l!.entry_bps}` : '—'}
                </Text>
                <Text style={s.faint}>{ok ? 'bps' : 'no quote'}</Text>
                <View style={s.barWrap}>
                  <View style={[s.bar, { height: h, backgroundColor: issuerColor(token.issuer) }]} />
                </View>
                <Text style={[s.racePrice, num]}>{l?.buy_px ? `$${l.buy_px.toFixed(2)}` : '—'}</Text>
                <Text style={s.faint}>{l ? `×${l.multiplier.toFixed(4)}` : ''}</Text>
              </View>
            )
          })}
        </View>
      )}

      {rows.map(({ token, l }) => {
        const ok = !!l && isUsable(l.entry_bps, l.quotable)
        const isBest = best?.token.symbol === token.symbol && usable.length > 1
        const width = ok && l ? Math.max(6, Math.round((l.entry_bps! / maxBps) * 100)) : 0
        return (
          <Pressable key={token.symbol} style={[s.card, isBest && s.cardBest]}
            onPress={() => router.push(`/passport?symbol=${token.symbol}`)}>
            <View style={s.cardHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TokenIcon icon={token.icon} symbol={token.symbol} label={token.ticker} issuer={token.issuer} size={36} />
                <View>
                <Text style={s.symbol}>{token.symbol}</Text>
                <Text style={[s.issuer, { color: issuerColor(token.issuer) }]}>{token.issuer}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.cost, num, isBest && s.accent]}>
                  {!l ? 'collecting' : ok ? `${l.entry_bps} bps` : l.quotable ? 'no real market' : 'no quote'}
                </Text>
                <Text style={s.faint}>entry cost</Text>
              </View>
            </View>

            <View style={s.track}><View style={[s.fill, { width: `${width}%`, backgroundColor: issuerColor(token.issuer) }]} /></View>

            <View style={s.metaRow}>
              <Text style={s.faint}>{l?.buy_px ? `$${l.buy_px.toFixed(2)} per share` : 'no price yet'}</Text>
              <Text style={s.faint}>{l ? `×` : ''}</Text>
              <Text style={s.faint}>{l ? `supply ` : ''}</Text>
            </View>

            <Text style={s.note}>{ISSUER_NOTE[token.issuer] ?? ''}</Text>
          </Pressable>
        )
      })}

      <View style={s.banner}>
        {best && spread !== null && spread > 0 ? (
          <>
            <Text style={s.bannerStrong}>{best.token.issuer} is {spread} bps cheaper to enter than the most expensive option.</Text>
            <Text style={s.faint}>${((spread / 10000) * 1000).toFixed(2)} on a $1,000 position, before our fee.</Text>
          </>
        ) : best ? (
          <Text style={s.bannerStrong}>Only {best.token.issuer} has a usable quote right now.</Text>
        ) : (
          <Text style={s.bannerStrong}>No usable quote right now.</Text>
        )}
      </View>

      {(() => {
        if (!held) return null
        const mineRow = rows.find((r) => r.token.symbol === held.symbol)
        if (!mineRow?.l) return null
        const l = mineRow.l
        const ok = isUsable(l.exit_bps, l.quotable)
        const shares = held.amount * l.multiplier
        const value = l.sell_px ? shares * l.sell_px : null
        const costUsd = ok && value ? (value * (l.exit_bps as number)) / 10000 : null
        return (
          <View style={s.switchCard}>
            <Text style={s.switchKicker}>YOU HOLD {held.symbol}</Text>
            <Text style={s.body}>
              {shares.toFixed(4)} {tk}{value ? ` · $${value.toFixed(2)}` : ""}
            </Text>
            <View style={s.switchDivider} />
            <View style={s.row}>
              <Text style={s.switchLabel}>Cost to exit to USDC</Text>
              <Text style={[s.switchValue, num]}>{ok ? `${l.exit_bps} bps` : "no quote"}</Text>
            </View>
            {costUsd !== null && (
              <Text style={s.body}>
                About ${costUsd.toFixed(2)} to sell this position back to USDC right now.
              </Text>
            )}
          </View>
        )
      })()}

      {multipliers.size > 1 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Why the raw prices differ</Text>
          <Text style={s.body}>
            These tokens use different multipliers, so one token is not one share everywhere. All prices above are per share.
          </Text>
        </View>
      )}

      {best && (
        <Pressable style={s.primary} onPress={() => router.push(`/buy?ticker=${tk}`)}>
          <Text style={s.primaryText}>Buy via {best.token.issuer}</Text>
        </Pressable>
      )}

      <Text style={s.faint}>{error ?? (rows.find((r) => r.l) ? `Last measured ${new Date(rows.find((r) => r.l)!.l!.ts * 1000).toLocaleString()}` : 'Loading…')}</Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  h1: { color: T.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.6 },
  h2: { color: T.text, fontSize: 22, fontWeight: '600', lineHeight: 28, letterSpacing: -0.4 },
  race: { flexDirection: 'row', gap: 8 },
  raceCol: { flex: 1, backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, alignItems: 'center', gap: 3 },
  raceBest: { borderColor: T.accent, borderWidth: 1.5 },
  bestTag: { color: T.bg, backgroundColor: T.accent, fontSize: 10, fontWeight: '800', letterSpacing: 0.8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  raceIssuer: { fontSize: 13, fontWeight: '700' },
  raceCost: { color: T.text, fontSize: 34, fontWeight: '700', letterSpacing: -1 },
  barWrap: { height: 60, justifyContent: 'flex-end', marginVertical: 8 },
  bar: { width: 26, borderRadius: 6 },
  racePrice: { color: T.dim, fontSize: 14, fontWeight: '600' },
  card: { backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 14, gap: 8 },
  cardBest: { borderColor: T.accent, borderWidth: 1.5, backgroundColor: '#161C12' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { color: T.dim, fontSize: 13 },
  cost: { color: T.text, fontSize: 20, fontWeight: '700' },
  accent: { color: T.accent },
  track: { height: 6, borderRadius: 3, backgroundColor: T.border },
  fill: { height: 6, borderRadius: 3 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  note: { color: T.faint, fontSize: 12, lineHeight: 17 },
  banner: { backgroundColor: '#1F2A12', borderRadius: 16, padding: 14, gap: 4 },
  bannerStrong: { color: T.accent, fontSize: 15, fontWeight: '600' },
  switchCard: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.borderBright, padding: 16, gap: 9 },
  switchKicker: { color: T.warn, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  switchDivider: { height: 1, backgroundColor: T.border, marginVertical: 2 },
  switchLabel: { color: T.text, fontSize: 15, fontWeight: '700' },
  switchValue: { color: T.warn, fontSize: 22, fontWeight: '800' },
  switchNote: { color: T.faint, fontSize: 12, fontStyle: 'italic' },
  label: { color: T.dim, fontSize: 14 },
  value: { color: T.text, fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  section: { gap: 6 },
  sectionTitle: { color: T.text, fontSize: 15, fontWeight: '600' },
  body: { color: T.dim, fontSize: 13, lineHeight: 19 },
  faint: { color: T.faint, fontSize: 12 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 56, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})



















