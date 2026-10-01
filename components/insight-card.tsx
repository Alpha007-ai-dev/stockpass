import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { bpsLabel, bpsValue } from '@/lib/cost'
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

export function buildInsight(i: InsightItem, hist: History | undefined): { text: string; tone: 'accent' | 'warn' | 'muted' } {
  if (i.entryBps === null || i.exitBps === null) {
    return { text: 'No executable quote right now.', tone: 'muted' }
  }

  const value = i.value
  const usual = hist && hist.samples >= 3 && hist.avg_entry !== null && hist.avg_entry < 200 ? hist.avg_entry : null

  // 1. Van olcsóbb kibocsátó, és a váltás is árazható
  if (i.altEntryBps !== null && i.altEntryBps < i.entryBps && value) {
    const switching = i.exitBps + i.altEntryBps
    const switchUsd = (value * switching) / 10000
    const savingUsd = (value * (i.entryBps - i.altEntryBps)) / 10000
    return {
      text: `${i.altSymbol} is cheaper to enter, worth ${usd(savingUsd)} on this position. Switching would cost ${usd(switchUsd)}.`,
      tone: 'warn',
    }
  }

  // 2. A mostani kilépési költség a szokásoshoz képest
  if (value && usual !== null) {
    const now = (value * bpsValue(i.exitBps)) / 10000
    const usualUsd = (value * usual) / 10000
    const delta = now - usualUsd
    if (Math.abs(delta) >= 0.5) {
      return {
        text: `Exit would cost ~${usd(now)} — ${usd(Math.abs(delta))} ${delta < 0 ? 'less' : 'more'} than usual.`,
        tone: delta < 0 ? 'accent' : 'warn',
      }
    }
    return { text: `Exit would cost ~${usd(now)} today, in line with the usual cost.`, tone: 'muted' }
  }

  // 3. Csak a mostani érték
  if (value) {
    return { text: `Exit would cost ~${usd((value * bpsValue(i.exitBps)) / 10000)} today.`, tone: 'muted' }
  }

  // 4. Ő a legolcsóbb
  if (i.altEntryBps !== null && i.altEntryBps >= i.entryBps) {
    return { text: `You hold the cheapest issuer for ${i.ticker} right now.`, tone: 'accent' }
  }

  return { text: 'Entry ' + bpsLabel(i.entryBps) + ' · exit ' + bpsLabel(i.exitBps) + '.', tone: 'muted' }
}

export function InsightCard({ item, hist }: { item: InsightItem; hist: History | undefined }) {
  const router = useRouter()
  const insight = buildInsight(item, hist)
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
})
