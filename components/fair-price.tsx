import { ReactNode, useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { num, T } from '@/constants/theme'
import { FairToken, getFair } from '@/lib/fair'

const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} bps`

const SOURCE: Record<string, string> = {
  alpaca: 'the live Wall Street quote',
  perp: '24/7 perp markets',
  last_close: 'the last reliable Wall Street quote',
}

export function fairText(t: FairToken): { title: string; body: string; color: string } {
  if (t.reason === 'thin') {
    const sides =
      t.buy_vs_ref_bps !== undefined && t.sell_vs_ref_bps !== undefined
        ? ` Buying is ${signed(t.buy_vs_ref_bps)} and selling ${signed(t.sell_vs_ref_bps)} against the stock price.`
        : ''
    return {
      title: 'ONE SIDE IS THIN',
      body: `Buy and sell back would cost ${Math.round(t.round_trip_bps ?? 0)} bps right now, so there is no fair midpoint to judge.${sides}`,
      color: T.warn,
    }
  }
  if (t.verdict === 'unknown' || t.premium_bps === undefined || !t.band) {
    return {
      title: 'NO FAIR-PRICE READING',
      body: 'There is no recent measurement with a real market or no reference price to compare with right now.',
      color: T.faint,
    }
  }
  const p = t.premium_bps
  const width = Math.round(t.band.hi)
  const vs = `${signed(p)} vs. the stock price (${SOURCE[t.reference?.src ?? ''] ?? 'reference'})`
  if (t.verdict === 'fair') {
    return { title: 'FAIR PRICE', body: `${vs}, within the usual ±${width} bps.`, color: T.accent }
  }
  if (t.verdict === 'premium') {
    return {
      title: 'ABOVE THE STOCK PRICE',
      body: `${vs}, outside the usual ±${width} bps. Buying now means paying more than the stock is worth.`,
      color: T.warn,
    }
  }
  return {
    title: 'BELOW THE STOCK PRICE',
    body: `${vs}, outside the usual ±${width} bps. Selling now gets less than the stock is worth.`,
    color: T.warn,
  }
}

/**
 * "Is the price fair right now?" for one token. The trading cost is not part of this number (that is the
 * cost cards' job): it is only where the token's price sits against the stock. Renders `fallback` while the
 * collector cannot answer (e.g. an older collector without /fair), so the screen never loses the comparison.
 */
export function FairPrice({ symbol, ticker, fallback }: { symbol: string; ticker: string; fallback?: ReactNode }) {
  const [t, setT] = useState<FairToken | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    setT(undefined)
    getFair(ticker)
      .then((all) => {
        if (live) setT(all?.find((x) => x.symbol === symbol) ?? null)
      })
      .catch(() => {
        if (live) setT(null)
      })
    return () => {
      live = false
    }
  }, [symbol, ticker])

  if (t === undefined) return null
  if (t === null) return <>{fallback ?? null}</>

  const { title, body, color } = fairText(t)
  const hours = t.reference?.hours_since
  return (
    <View style={[s.card, { borderColor: t.verdict === 'unknown' && t.reason !== 'thin' ? T.border : color }]}>
      <Text style={[s.kicker, { color }]}>{title}</Text>
      {t.premium_bps !== undefined && t.verdict !== 'unknown' && (
        <Text style={[s.value, num, { color }]}>{signed(t.premium_bps)}</Text>
      )}
      <Text style={s.body}>{body}</Text>
      {t.basis === 'estimated' && hours !== undefined && (
        <Text style={s.tiny}>
          No live stock price right now: compared with the last reliable Wall Street quote,{' '}
          {hours < 1 ? 'under an hour' : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`} old. The band
          is wider because the stock may have moved since.
        </Text>
      )}
      {t.usual_premium_bps !== undefined && t.usual_premium_bps !== null && Math.abs(t.usual_premium_bps) >= 5 && (
        <Text style={s.tiny}>This token usually trades at {signed(t.usual_premium_bps)} against this reference.</Text>
      )}
      <Text style={s.tiny}>Trading cost not included. Data, not advice.</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  value: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  body: { color: T.dim, fontSize: 14, lineHeight: 20 },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
})
