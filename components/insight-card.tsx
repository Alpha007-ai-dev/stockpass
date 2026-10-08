import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { bpsLabel } from '@/lib/cost'
import { History } from '@/lib/stats'

export type InsightItem = {
  symbol: string
  ticker: string
  issuer: string
  icon?: string | null
  value: number | null
  entryBps: number | null
  exitBps: number | null
  altSymbol: string | null
  altIssuer: string | null
  altEntryBps: number | null
}

function usd(n: number) {
  return `$${n.toFixed(2)}`
}

export function buildInsight(i: InsightItem, hist: History | undefined, availability?: number | null): { text: string; tone: 'accent' | 'warn' | 'muted'; rank: number } | null {
  if (i.entryBps === null || i.exitBps === null) {
    return { text: 'No executable quote right now.', tone: 'warn', rank: 5 }
  }
  if (availability !== null && availability !== undefined && availability < 50) {
    return { text: `Available now, but quotable only ${Math.round(availability)}% of the time over 30 days.`, tone: 'warn', rank: 2 }
  }
  const value = i.value
  const usual = hist && hist.samples * hist.availability >= 10 && hist.avg_entry !== null && hist.avg_entry < 200 ? hist.avg_entry : null
  if (value && usual !== null) {
    const delta = i.exitBps - usual
    if (Math.abs(delta) >= 3) {
      const d = Math.round(delta)
      return {
        text: `Exit cost is ${d > 0 ? 'higher' : 'lower'} than usual by ${Math.abs(d)} bps.`,
        tone: d > 0 ? 'warn' : 'accent',
        rank: 1,
      }
    }
  }
  return null
}

const STATE_WORD: Record<string, string> = {
  open: 'market hours', pre: 'pre-market', after: 'after hours', closed: 'overnight', weekend: 'the weekend',
}

/** When this token has historically been cheapest to sell (the exit cost mirrors the measured entry cost). */
export function exitTip(states: History[] | undefined, currentState: string | undefined): string | null {
  const solid = (states ?? []).filter((h) => h.samples * h.availability >= 10 && h.avg_entry !== null && h.avg_entry < 200)
  if (solid.length < 2) return null
  const lo = solid.reduce((a, b) => (a.avg_entry <= b.avg_entry ? a : b))
  const now = solid.find((h) => h.market_state === currentState)
  if (!now || lo.market_state === currentState || now.avg_entry - lo.avg_entry < 3) return null
  return `Over 30 days, selling has been cheapest during ${STATE_WORD[lo.market_state] ?? lo.market_state} (about ${Math.round(Math.max(0, lo.avg_entry))} bps, against ${Math.round(Math.max(0, now.avg_entry))} bps now). Historical pattern, not a forecast.`
}

export function InsightCard({ item, hist, availability, states, state }: { item: InsightItem; hist: History | undefined; availability?: number | null; states?: History[]; state?: string }) {
  const router = useRouter()
  const insight = buildInsight(item, hist, availability)
  if (!insight) return null
  const tip = exitTip(states, state)
  const color = insight.tone === 'accent' ? T.accent : insight.tone === 'warn' ? T.warn : T.dim
  return (
    <Pressable style={s.card} onPress={() => router.push(`/passport?symbol=${item.symbol}`)}>
      <View style={s.head}>
        <TokenIcon icon={item.icon} symbol={item.symbol} label={item.ticker} issuer={item.issuer} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={s.symbol}>{item.symbol}</Text>
          <Text style={[s.issuer, { color: issuerColor(item.issuer) }]}>{item.issuer}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.entry, num, item.entryBps === null && { color: T.faint }]}>
            {bpsLabel(item.entryBps)}
          </Text>
          <Text style={s.entryLabel}>entry</Text>
        </View>
        <Text style={s.chev}>›</Text>
      </View>
      <Text style={[s.insight, { color }]}>{insight.text}</Text>
      {tip && <Text style={s.tip}>{tip}</Text>}
    </Pressable>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  symbol: { color: T.text, fontSize: 17, fontWeight: '700' },
  issuer: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  entry: { color: T.text, fontSize: 18, fontWeight: '700' },
  entryLabel: { color: T.faint, fontSize: 11 },
  chev: { color: T.faint, fontSize: 18 },
  insight: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  tip: { color: T.dim, fontSize: 13, lineHeight: 18 },
})
