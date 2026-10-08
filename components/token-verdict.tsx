import { StyleSheet, Text, View } from 'react-native'
import { T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { History, Latest } from '@/lib/stats'

const STATE_LABEL: Record<string, string> = {
  open: 'market hours', pre: 'pre-market', after: 'after hours', closed: 'overnight', weekend: 'the weekend',
}

/** One factual sentence about the token right now, built only from measurements we hold. */
export function buildVerdict(
  mine: Latest,
  hist: History[],
  availability: number | null
): { text: string; tone: 'accent' | 'warn' | 'muted' } {
  if (!isUsable(mine.entry_bps, mine.quotable)) return { text: 'No executable quote right now.', tone: 'warn' }
  if (availability !== null && availability < 50) {
    return { text: `Available now, but quotable only ${Math.round(availability)}% of the time over 30 days.`, tone: 'warn' }
  }
  const entry = Math.max(0, mine.entry_bps)
  const same = hist.find((h) => h.market_state === mine.market_state)
  const usual = same && same.samples * same.availability >= 10 && same.avg_entry !== null && same.avg_entry < 200 ? Math.max(0, same.avg_entry) : null
  if (usual !== null) {
    const d = Math.round(entry - usual)
    if (Math.abs(d) >= 3) {
      return {
        text: `${Math.abs(d)} bps ${d > 0 ? 'more' : 'less'} than usual for ${STATE_LABEL[mine.market_state] ?? mine.market_state} (${Math.round(usual)} bps).`,
        tone: d > 0 ? 'warn' : 'accent',
      }
    }
  }
  return {
    text: usual !== null ? `In line with its usual cost (${Math.round(usual)} bps).` : `Costs ${entry < 0.5 ? '~0' : Math.round(entry)} bps to buy right now.`,
    tone: 'muted',
  }
}

export function TokenVerdict(props: { mine: Latest; hist: History[]; availability: number | null }) {
  const v = buildVerdict(props.mine, props.hist, props.availability)
  const color = v.tone === 'accent' ? T.accent : v.tone === 'warn' ? T.warn : T.dim
  return (
    <View style={s.card}>
      <Text style={[s.text, { color }]}>{v.text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14 },
  text: { fontSize: 15, lineHeight: 21, fontWeight: '600' },
})
