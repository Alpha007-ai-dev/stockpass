import { StyleSheet, Text, View } from 'react-native'
import { num, T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { Latest } from '@/lib/stats'

export function CostToGoOnChain({ mine, reference }: { mine: Latest; reference: any | null }) {
  const price = mine.buy_px
  if (!price) return null

  const usable = isUsable(mine.entry_bps, mine.quotable)
  const entry = usable ? (mine.entry_bps as number) : null
  const live = reference && !reference.stale
  const premium = live ? Math.round((price / Number(reference.mid) - 1) * 10000) : null
  const total = premium !== null && entry !== null ? premium + entry : null

  return (
    <View style={s.card}>
      <Text style={s.kicker}>COST TO GO ON-CHAIN</Text>

      <View style={s.row}>
        <Text style={s.label}>Traditional reference</Text>
        <Text style={[s.value, num]}>{reference ? `$${Number(reference.mid).toFixed(2)}` : '—'}</Text>
      </View>

      <View style={s.row}>
        <Text style={s.label}>Normalized token price</Text>
        <Text style={[s.value, num]}>${price.toFixed(2)}</Text>
      </View>

      <View style={s.row}>
        <Text style={s.label}>On-chain premium</Text>
        <Text style={[s.value, num]}>{live ? `${premium! >= 0 ? '+' : ''}${premium} bps` : 'market closed'}</Text>
      </View>

      <View style={s.row}>
        <Text style={s.label}>Execution cost (entry)</Text>
        <Text style={[s.value, num]}>{entry !== null ? `${entry} bps` : 'no quote'}</Text>
      </View>

      {total !== null ? (
        <>
          <View style={[s.row, s.totalRow]}>
            <Text style={s.totalLabel}>Total cost to go on-chain</Text>
            <Text style={[s.total, num]}>{total >= 0 ? '+' : ''}{total} bps</Text>
          </View>
          <Text style={s.foot}>
            About ${((Math.abs(total) / 10000) * 1000).toFixed(2)} on a $1,000 position, versus buying the traditional share.
          </Text>
        </>
      ) : (
        <Text style={s.foot}>
          {entry !== null
            ? `Execution costs ${entry} bps right now. The traditional reference is not live, so no total is shown.`
            : 'No executable quote right now.'}
        </Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { paddingVertical: 16, gap: 10, borderTopWidth: 1, borderTopColor: T.border },
  kicker: { color: T.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 },
  totalRow: { borderTopWidth: 1, borderTopColor: T.border, paddingTop: 12, marginTop: 2 },
  label: { color: T.dim, fontSize: 15 },
  value: { color: T.text, fontSize: 16, fontWeight: '600' },
  totalLabel: { color: T.text, fontSize: 15, fontWeight: '700' },
  total: { color: T.accent, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 },
  foot: { color: T.faint, fontSize: 13, lineHeight: 19 },
})
