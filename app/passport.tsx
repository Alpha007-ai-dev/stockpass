import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { AnomalyCard } from '@/components/anomaly-card'
import { CostAlert } from '@/components/cost-alert'
import { CostTimeline } from '@/components/cost-timeline'
import { NormalizationHero } from '@/components/normalization-hero'
import { TokenVerdict } from '@/components/token-verdict'
import { SizeCurve } from '@/components/size-curve'
import { MultiplierNotice } from '@/components/multiplier-notice'
import { TokenIcon } from '@/components/token-icon'
import { ISSUERS } from '@/constants/issuers'
import { stockInfo } from '@/constants/stock-info'
import { EarningsIcon } from '@/components/event-icons'
import { issuerColor, num, T } from '@/constants/theme'
import { bpsLabel, isUsable, NO_MARKET_BPS } from '@/lib/cost'
import { DEMO_HOLDINGS, isDemo } from '@/lib/demo'
import { getGroups } from '@/lib/pairs'
import { compact, getCollateral, getHoldings, getStats, getReliability, getUnderlying, History, Latest, TokenReliability, TokenRow, UnderlyingEvent, UnderlyingProfile } from '@/lib/stats'
import { useMobileWallet } from '@wallet-ui/react-native-kit'

type Tab = 'overview' | 'costs' | 'details'

const STATE_LABEL: Record<string, string> = {
  open: 'Market open', pre: 'Pre-market', after: 'After hours', closed: 'Overnight', weekend: 'Weekend',
}

export default function PassportScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? 'SPYx'
  const { account } = useMobileWallet() as any

  const [tab, setTab] = useState<Tab>('overview')
  const [mine, setMine] = useState<Latest | null>(null)
  const [peer, setPeer] = useState<Latest | null>(null)
  const [tokenCount, setTokenCount] = useState(2)
  const [hist, setHist] = useState<History[]>([])
  const [reference, setReference] = useState<any | null>(null)
  const [token, setToken] = useState<TokenRow | null>(null)
  const [balance, setBalance] = useState<number | null>(null)
  const [markets, setMarkets] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [under, setUnder] = useState<{ profile: UnderlyingProfile | null; events: UnderlyingEvent[] }>({ profile: null, events: [] })
  const [rel, setRel] = useState<TokenReliability | null>(null)

  const isOndo = sym.endsWith('on')
  const isBp = sym.endsWith('bp')
  const ticker = isOndo || isBp ? sym.slice(0, -2) : sym.slice(0, -1)
  const issuerName = isOndo ? 'Ondo' : isBp ? 'Backpack' : 'xStocks'
  const info = ISSUERS[issuerName] ?? ISSUERS.xStocks

  useEffect(() => {
    getStats()
      .then((s) => {
        setMine(s.latest.find((r) => r.symbol === sym) ?? null)
        // With three issuers, compare against the cheapest alternative, not whichever row comes first.
        const others = s.latest.filter((r) => r.ticker === ticker && r.symbol !== sym && r.buy_px)
        const pool = others.filter((r) => isUsable(r.entry_bps, r.quotable))
        const choices = pool.length ? pool : others
        setPeer(choices.length ? choices.reduce((x, y) => ((x.buy_px as number) <= (y.buy_px as number) ? x : y)) : null)
        setTokenCount(others.length + 1)
        setHist(s.history.filter((r) => r.symbol === sym))
        setReference((s as any).reference?.find((r: any) => r.ticker === ticker) ?? null)
      })
      .catch((e) => setError((e as Error).message))

    getGroups()
      .then((gs) => setToken(gs.flatMap((g) => g.tokens).find((t) => t.symbol === sym) ?? null))
      .catch(() => {})

    getCollateral()
      .then((c) => setMarkets(c.filter((m) => m.symbol === sym).length))
      .catch(() => {})

    getUnderlying(ticker).then(setUnder).catch(() => {})
    getReliability(sym).then(setRel).catch(() => {})
  }, [sym, ticker])

  useEffect(() => {
    ;(async () => {
      try {
        if (await isDemo()) {
          const d = DEMO_HOLDINGS.find((x) => x.symbol === sym)
          setBalance(d ? d.walletAmount : null)
          return
        }
        const addr = account?.address
        if (!addr) return
        const rows = await getHoldings(String(addr))
        setBalance(rows.find((r) => r.symbol === sym)?.walletAmount ?? null)
      } catch {}
    })()
  }, [sym, account])

  const ok = mine ? isUsable(mine.entry_bps, mine.quotable) : false
  // Deviation is measured on the token's mid price (between buy and sell), so it does not contain the entry cost; the total below uses the buy price.
  const tokenMid = mine && mine.buy_px && mine.sell_px ? (mine.buy_px + mine.sell_px) / 2 : (mine?.buy_px ?? 0)
  const devBps = reference && tokenMid ? Math.round((tokenMid / Number(reference.mid) - 1) * 10000) : 0
  const samples = hist.reduce((n, h) => n + h.samples, 0)
  const avail = samples > 0 ? hist.reduce((n, h) => n + h.availability * h.samples, 0) / samples : null
  const valid = hist.filter((h) => h.avg_entry !== null && h.avg_entry < NO_MARKET_BPS)
  const maxAvg = Math.max(1, ...valid.map((h) => h.avg_entry))
  const shares = balance !== null && mine ? balance * mine.multiplier : null

  const tabs: [Tab, string][] = [['overview', 'Overview'], ['costs', 'Costs'], ['details', 'Details']]

  return (
    <ScrollView style={s.screen} contentContainerStyle={[s.content, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={s.back}>
        <Text style={s.backText}>‹ Back</Text>
      </Pressable>

      <View style={s.idCard}>
        <TokenIcon icon={token?.icon} symbol={sym} label={ticker} issuer={issuerName} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={s.symbol}>{sym}</Text>
          <Text style={[s.issuer, { color: issuerColor(issuerName) }]} numberOfLines={1}>
            {issuerName}{token?.name ? ` · ${token.name}` : ''}
          </Text>
        </View>
      </View>

      <View style={s.tabs}>
        {tabs.map(([key, label]) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[s.tab, tab === key && s.tabOn]}>
            <Text style={[s.tabText, tab === key && s.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'overview' && mine && (
        <>
          <TokenVerdict mine={mine} availability={samples >= 50 && avail !== null ? Math.round(avail * 100) : null} />
          <MultiplierNotice symbol={sym} />
          <AnomalyCard symbol={sym} />

          {peer && mine.buy_px && peer.buy_px && (
            <NormalizationHero symbol={sym} mine={mine} peer={peer} reference={reference} total={tokenCount} ticker={ticker} />
          )}

          <View style={s.pairRow}>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.kicker}>COST TO BUY</Text>
              <Text style={[s.metric, num, { color: T.accent }]}>{!ok ? '—' : (mine.entry_bps as number) < 0 ? '~0 bps' : `${mine.entry_bps} bps`}</Text>
              <Text style={s.tiny}>{ok ? `≈ $${(Math.max(0, mine.entry_bps as number) / 10).toFixed(2)} per $1,000` : 'no quote'}</Text>
            </View>
            <View style={[s.card, { flex: 1 }]}>
              <Text style={s.kicker}>COST TO SELL</Text>
              <Text style={[s.metric, num]}>{!ok ? '—' : (mine.exit_bps as number) < 0 ? '~0 bps' : `${mine.exit_bps} bps`}</Text>
              <Text style={s.tiny}>{ok ? `≈ $${(Math.max(0, mine.exit_bps as number) / 10).toFixed(2)} per $1,000` : 'no quote'}</Text>
            </View>
          </View>

          <CostAlert symbol={sym} currentBps={ok ? Math.max(0, mine.entry_bps as number) : null} />

          {reference && mine.buy_px && (
            <View style={s.card}>
              <Text style={s.kicker}>TOKEN VS. WALL STREET</Text>
              <View style={s.row}><Text style={s.label}>Stock price on Wall Street</Text><Text style={[s.value, num]}>${Number(reference.mid).toFixed(2)}</Text></View>
              <View style={s.row}><Text style={s.label}>Token mid price per share</Text><Text style={[s.value, num]}>${tokenMid.toFixed(2)}</Text></View>
              <View style={s.row}>
                <Text style={s.label}>Token vs. Wall Street</Text>
                <Text style={[s.value, num]}>
                  {reference.stale ? 'Wall Street closed' : `${devBps >= 0 ? '+' : ''}${devBps} bps`}
                </Text>
              </View>
              <View style={s.row}><Text style={s.label}>Trading cost to buy</Text><Text style={[s.value, num]}>{bpsLabel(mine.entry_bps, ok)}</Text></View>

              {!reference.stale && ok && (
                <View style={s.totalBox}>
                  <Text style={s.kicker}>PRICE VS. WALL STREET, TRADING COST INCLUDED</Text>
                  <Text style={[s.total, num]}>
                    {Math.round((mine.buy_px / Number(reference.mid) - 1) * 10000) >= 0 ? '+' : ''}
                    {Math.round((mine.buy_px / Number(reference.mid) - 1) * 10000)} bps
                  </Text>
                  <Text style={s.tiny}>
                    ≈ ${(Math.abs(Math.round((mine.buy_px / Number(reference.mid) - 1) * 10000)) / 10).toFixed(2)} on $1,000. The price per share you pay already contains the trading cost.
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}

      {tab === 'costs' && (
        <>
          <CostTimeline ticker={ticker} />
          <SizeCurve symbol={sym} state={mine?.market_state ?? 'open'} />

          {valid.length > 0 && (
            <View style={s.card}>
              <Text style={s.kicker}>COST BY MARKET STATE</Text>
              {valid.map((h) => (
                <View key={h.market_state} style={s.barRow}>
                  <Text style={s.barLabel}>{STATE_LABEL[h.market_state] ?? h.market_state}</Text>
                  <View style={s.track}><View style={[s.fill, { width: `${Math.max(0, Math.round((h.avg_entry / maxAvg) * 100))}%` }]} /></View>
                  <Text style={[s.barValue, num]}>{h.avg_entry < 0.5 ? '~0' : h.avg_entry.toFixed(0)}</Text>
                </View>
              ))}
              {(() => {
                const solid = valid.filter((h) => h.samples * h.availability >= 10)
                if (solid.length < 2) return null
                const lo = solid.reduce((a, b) => (a.avg_entry <= b.avg_entry ? a : b))
                const hi = solid.reduce((a, b) => (a.avg_entry >= b.avg_entry ? a : b))
                if (hi.avg_entry - lo.avg_entry < 3) return null
                return (
                  <Text style={s.tiny}>
                    Cheapest on average during {(STATE_LABEL[lo.market_state] ?? lo.market_state).toLowerCase()} ({Math.round(Math.max(0, lo.avg_entry))} bps), most expensive during {(STATE_LABEL[hi.market_state] ?? hi.market_state).toLowerCase()} ({Math.round(hi.avg_entry)} bps). Historical pattern, not a forecast.
                  </Text>
                )
              })()}
            </View>
          )}

          {(() => {
            const o = rel?.open
            const a = rel?.overall
            const blocks: { label: string; now: number | null; tMin: number | null; tMax: number | null; oMin: number | null; oMax: number | null }[] = [
              { label: 'ENTRY COST', now: ok && mine ? (mine.entry_bps as number) : null, tMin: o?.min_entry ?? null, tMax: o?.max_entry ?? null, oMin: a?.min_entry ?? null, oMax: a?.max_entry ?? null },
              { label: 'EXIT COST', now: ok && mine ? (mine.exit_bps as number) : null, tMin: o?.min_exit ?? null, tMax: o?.max_exit ?? null, oMin: a?.min_exit ?? null, oMax: a?.max_exit ?? null },
            ]
            const range = (lo0: number | null, hi0: number | null) => rawRange(lo0 === null ? null : Math.max(0, lo0), hi0 === null ? null : Math.max(0, hi0))
            const rawRange = (lo: number | null, hi: number | null) =>
              lo === null || hi === null ? '—' : hi === 0 ? '~0 bps' : lo === hi ? `${lo} bps` : `${lo === 0 ? '~0' : lo}–${hi} bps`
            return (
              <>
                {blocks.map((b) => (
                  <View key={b.label} style={s.card}>
                    <Text style={s.kicker}>{b.label}</Text>
                    <View style={s.row}>
                      <Text style={s.label}>Today</Text>
                      <Text style={[s.metric, num, b.now === null && { color: T.faint }]}>
                        {b.now === null ? '—' : b.now < 0 ? '~0 bps' : `${b.now} bps`}
                      </Text>
                    </View>
                    <View style={s.row}>
                      <Text style={s.label}>Open-market range</Text>
                      <Text style={[s.value, num]}>{range(b.tMin, b.tMax)}</Text>
                    </View>
                    <View style={s.row}>
                      <Text style={s.label}>Observed range</Text>
                      <Text style={[s.value, num, { color: T.dim }]}>{range(b.oMin, b.oMax)}</Text>
                    </View>
                    {b.now !== null && b.now > 0 && (
                      <View style={s.estBox}>
                        <Text style={s.tiny}>Estimated cost</Text>
                        <Text style={[s.estValue, num]}>~${(b.now / 10).toFixed(2)}</Text>
                        <Text style={s.tiny}>for a $1,000 position</Text>
                      </View>
                    )}
                  </View>
                ))}

                <View style={s.card}>
                  <View style={s.row}>
                    <Text style={s.label}>Quote availability</Text>
                    <Text style={[s.value, num, a?.availability !== null && a?.availability !== undefined && a.availability < 70 && { color: T.warn }]}>
                      {a?.availability !== null && a?.availability !== undefined ? `${a.availability}%` : '—'}
                    </Text>
                  </View>
                  <Text style={s.tiny}>
                    {a?.samples ?? samples} observations
                    {o?.samples ? ` · ${o.samples} during open market` : ''}
                    {o?.since ? `, since ${new Date(o.since * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : ''}
                    . Measured at a $1,000 test size.
                  </Text>
                </View>
              </>
            )
          })()}
        </>
      )}

      {tab === 'details' && mine && (
        <>
          <View style={s.card}>
            <Text style={s.kicker}>OWNERSHIP</Text>
            <Text style={[s.metric, num]}>1 token = {mine.multiplier.toFixed(4)} shares</Text>
            {mine.multiplier > 1.0001 && (
              <Text style={s.accrued}>
                +{((mine.multiplier - 1) * 100).toFixed(2)}% has accrued into the token since launch
              </Text>
            )}
            <Text style={s.tiny}>
              Read on-chain from the Token-2022 multiplier. Reinvested dividends raise it over time, so the same
              token represents more shares than it did at launch.
            </Text>
            <Text style={s.tiny}>
              Divide the token price by this multiplier before comparing issuers. That gives the per-share price.
            </Text>
            {shares !== null && (
              <>
                <View style={s.divider} />
                <View style={s.row}><Text style={s.label}>Your balance</Text><Text style={[s.value, num]}>{balance!.toFixed(4)} {sym}</Text></View>
                <View style={s.row}><Text style={s.label}>Real shares</Text><Text style={[s.value, num]}>{shares.toFixed(4)} {ticker}</Text></View>
              </>
            )}
          </View>

          <View style={s.card}>
            <Text style={s.kicker}>SUPPLY</Text>
            <Text style={[s.metric, num]}>{compact(mine.supply)} {sym}</Text>
            <Text style={s.tiny}>
              ≈ {compact(mine.supply * mine.multiplier)} shares{mine.buy_px ? ` · ≈ $${compact(mine.supply * mine.multiplier * mine.buy_px)}` : ''}
            </Text>
          </View>

          {markets !== null && (
            <Pressable style={s.card} onPress={() => router.push('/defi')}>
              <Text style={s.kicker}>DEFI UTILITY</Text>
              <View style={s.row}>
                <Text style={s.value}>
                  {markets > 0 ? `${markets} lending market${markets === 1 ? '' : 's'}` : 'Not accepted as collateral'}
                </Text>
                <Text style={s.chev}>›</Text>
              </View>
              <Text style={s.tiny}>Kamino data · see the DeFi tab for details</Text>
            </Pressable>
          )}

          {(() => {
            const si = stockInfo(ticker)
            const p = under.profile
            const earn = under.events.find((e) => e.kind === 'earnings' && e.event_date >= new Date().toISOString().slice(0, 10))
            if (!si && !p) return null
            const cap = p?.market_cap ? (p.market_cap >= 1e6 ? `$${(p.market_cap / 1e6).toFixed(2)}T` : `$${(p.market_cap / 1e3).toFixed(1)}B`) : null
            return (
              <View style={s.card}>
                <Text style={s.kicker}>THE UNDERLYING</Text>
                <Text style={s.underName}>{si?.name ?? p?.name}</Text>
                {si && <Text style={s.underMeta}>{si.kind} · {si.exchange} · {si.sector}</Text>}
                {si && <Text style={s.underText}>{si.summary}</Text>}

                {p && (
                  <>
                    <View style={s.divider} />
                    {cap && (
                      <View style={s.row}>
                        <Text style={s.label}>Market cap</Text>
                        <Text style={[s.value, num]}>{cap}</Text>
                      </View>
                    )}
                    {p.industry && (
                      <View style={s.row}>
                        <Text style={s.label}>Industry</Text>
                        <Text style={s.value}>{p.industry}</Text>
                      </View>
                    )}
                    {p.ipo && (
                      <View style={s.row}>
                        <Text style={s.label}>Listed since</Text>
                        <Text style={[s.value, num]}>{p.ipo.slice(0, 4)}</Text>
                      </View>
                    )}
                  </>
                )}

                {earn && (
                  <View style={s.eventRow}>
                    <EarningsIcon size={22} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.eventTitle}>Next earnings</Text>
                      <Text style={s.tiny}>
                        {new Date(earn.event_date + 'T12:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                        {earn.detail ? ` · ${earn.detail}` : ''}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )
          })()}

          <View style={s.card}>
            <Text style={s.kicker}>ABOUT</Text>
            {[['Issuer', info.legalName], ['Backing', info.backing], ['Dividends', info.dividends],
              ['Redemption', info.redemption], ['Eligibility', info.eligibility], ['Standard', info.standard]].map(([k, v]) => (
              <View key={k} style={s.aboutRow}>
                <Text style={s.label}>{k}</Text>
                <Text style={s.aboutValue}>{v}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      {ok && (
        <View style={s.ctaRow}>
          <Pressable style={[s.primary, { flex: 1 }]} onPress={() => router.push(`/buy?symbol=${sym}`)}>
            <Text style={s.primaryText}>Buy {sym}</Text>
          </Pressable>
          {balance !== null && balance > 0 && (
            <Pressable style={[s.secondary, { flex: 1 }]} onPress={() => router.push(`/sell?symbol=${sym}`)}>
              <Text style={s.secondaryText}>Sell</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={s.tiny}>
        {error ?? (mine ? `Measured ${(() => { const m = Math.max(0, Math.round((Date.now() / 1000 - mine.ts) / 60)); return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago` })()}` : 'Loading…')}
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40, gap: 11 },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },

  idCard: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16 },
  symbol: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  issuer: { fontSize: 14, fontWeight: '600', marginTop: 2 },

  tabs: { flexDirection: 'row', gap: 6 },
  tab: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: T.border },
  tabOn: { backgroundColor: T.accent, borderColor: T.accent },
  tabText: { color: T.dim, fontSize: 13, fontWeight: '600' },
  tabTextOn: { color: T.bg, fontWeight: '700' },

  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 8 },
  pairRow: { flexDirection: 'row', gap: 11 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  metric: { color: T.text, fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  tiny: { color: T.faint, fontSize: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  chev: { color: T.faint, fontSize: 18 },
  divider: { height: 1, backgroundColor: T.border, marginVertical: 4 },

  totalBox: { backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 14, alignItems: 'center', gap: 3, marginTop: 6 },
  total: { color: T.accent, fontSize: 34, fontWeight: '800', letterSpacing: -1 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: T.dim, fontSize: 13, width: 92 },
  track: { flex: 1, height: 7, borderRadius: 4, backgroundColor: T.border },
  fill: { height: 7, borderRadius: 4, backgroundColor: T.accent },
  barValue: { color: T.text, fontSize: 13, width: 28, textAlign: 'right' },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 13, marginTop: 6 },
  eventTitle: { color: T.text, fontSize: 15, fontWeight: '700' },
  estBox: { backgroundColor: T.surfaceAlt, borderRadius: 12, padding: 13, marginTop: 6, gap: 1 },
  estValue: { color: T.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  accrued: { color: T.accent, fontSize: 16, fontWeight: '600', marginTop: 2 },
  underName: { color: T.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  underMeta: { color: T.accent, fontSize: 14, fontWeight: '600' },
  underText: { color: T.dim, fontSize: 15, lineHeight: 22, marginTop: 4 },
  aboutRow: { gap: 2, paddingVertical: 5 },
  aboutValue: { color: T.text, fontSize: 14 },

  ctaRow: { flexDirection: 'row', gap: 11, marginTop: 6 },
  primary: { backgroundColor: T.accent, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  secondary: { borderWidth: 1, borderColor: T.borderBright, borderRadius: 14, height: 54, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: T.text, fontSize: 16, fontWeight: '700' },
  primaryText: { color: T.bg, fontSize: 16, fontWeight: '700' },
})


