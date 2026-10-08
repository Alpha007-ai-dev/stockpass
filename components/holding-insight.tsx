import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { TokenIcon } from '@/components/token-icon'
import { issuerColor, num, T } from '@/constants/theme'
import { getSeries, HoldingRow, Latest, SeriesPoint } from '@/lib/stats'

type Props = { holding: HoldingRow & { shares: number }; latest: Latest | undefined }

export function HoldingInsight({ holding, latest }: Props) {
  const router = useRouter()
  const [series, setSeries] = useState<SeriesPoint[] | null>(null)

  useEffect(() => {
    getSeries(holding.ticker, 24)
      .then((p) => setSeries(p.filter((x) => x.symbol === holding.symbol && x.quotable)))
      .catch(() => setSeries([]))
  }, [holding.ticker, holding.symbol])

  const entry = latest?.quotable ? latest.entry_bps : null
  const exit = latest?.quotable ? latest.exit_bps : null

  let priceChange: number | null = null
  let entryChange: number | null = null
  let exitChange: number | null = null

  if (series && series.length > 1) {
    const first = series[0]
    const last = series[series.length - 1]
    if (first.buy_px && last.buy_px) priceChange = (last.buy_px / first.buy_px - 1) * 100
    if (first.entry_bps !== null && last.entry_bps !== null)
      entryChange = (last.entry_bps as number) - (first.entry_bps as number)
    if (first.exit_bps !== null && last.exit_bps !== null)
      exitChange = (last.exit_bps as number) - (first.exit_bps as number)
  }

  const note = (() => {
    if (entryChange !== null && Math.abs(entryChange) >= 2) {
      return `Entry cost is ${Math.abs(entryChange)} bps ${entryChange < 0 ? 'lower' : 'higher'} than 24h ago.`
    }
    if (exitChange !== null && Math.abs(exitChange) >= 2) {
      return `Exit cost is ${Math.abs(exitChange)} bps ${exitChange < 0 ? 'lower' : 'higher'} than 24h ago.`
    }
    if (priceChange !== null && Math.abs(priceChange) >= 0.3) {
      return `Price moved ${priceChange > 0 ? 'up' : 'down'} ${Math.abs(priceChange).toFixed(2)}% since yesterday.`
    }
    return null
  })()

  return (
    <Pressable style={s.wrap} onPress={() => router.push(`/passport?symbol=${holding.symbol}`)}>
      <View style={s.head}>
        <TokenIcon
          icon={holding.icon}
          symbol={holding.symbol}
          label={holding.ticker}
          issuer={holding.issuer}
          size={36}
        />

        <View style={{ flex: 1 }}>
          <Text style={s.symbol}>{holding.symbol}</Text>
          <Text style={s.faint}>You hold {holding.shares.toFixed(4)} shares</Text>
        </View>
        {priceChange !== null && (
          <Text style={[s.change, num, { color: priceChange >= 0 ? T.accent : T.down }]}>
            {priceChange >= 0 ? '+' : ''}
            {priceChange.toFixed(2)}%
          </Text>
        )}
      </View>

      <View style={s.metrics}>
        <View>
          <Text style={s.label}>ENTRY</Text>
          <Text style={[s.metric, num]}>{entry !== null ? `${entry} bps` : '—'}</Text>
        </View>
        <View>
          <Text style={s.label}>EXIT</Text>
          <Text style={[s.metric, num]}>{exit !== null ? `${exit} bps` : '—'}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', justifyContent: 'center' }}>
          <View style={[s.dot, { backgroundColor: issuerColor(holding.issuer) }]} />
        </View>
      </View>

      {note && <Text style={s.note}>{note}</Text>}
    </Pressable>
  )
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  symbol: { color: T.text, fontSize: 18, fontWeight: '700' },
  change: { fontSize: 18, fontWeight: '700' },
  metrics: { flexDirection: 'row', gap: 28, alignItems: 'center', minHeight: 44 },
  label: { color: T.faint, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 },
  metric: { color: T.text, fontSize: 20, fontWeight: '700', marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  note: { color: T.dim, fontSize: 14, lineHeight: 19 },
  faint: { color: T.faint, fontSize: 13 },
})
