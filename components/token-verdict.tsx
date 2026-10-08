import { StyleSheet, Text, View } from 'react-native'
import { T } from '@/constants/theme'
import { isUsable } from '@/lib/cost'
import { Latest } from '@/lib/stats'

/**
 * A one-line warning at the top of the Passport, only for what nothing else on that screen says:
 * there is no executable quote, or the token is available now but was rarely quotable over 30 days.
 * Cost deviations are covered by the anomaly card, so everything else returns null.
 */
const STALE_S = 3 * 3600

export function buildVerdict(mine: Latest, availability: number | null): string | null {
  const age = Date.now() / 1000 - mine.ts
  if (age > STALE_S) {
    const h = Math.round(age / 3600)
    return `No recent measurement. The last one is ${h < 48 ? `${h} h` : `${Math.round(h / 24)} days`} old, so these numbers may be out of date.`
  }
  if (!isUsable(mine.entry_bps, mine.quotable)) return 'No executable quote right now.'
  if (availability !== null && availability < 50) {
    return `Available now, but quotable only ${Math.round(availability)}% of the time over 30 days.`
  }
  return null
}

export function TokenVerdict(props: { mine: Latest; availability: number | null }) {
  const text = buildVerdict(props.mine, props.availability)
  if (!text) return null
  return (
    <View style={s.card}>
      <Text style={s.text}>{text}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 14 },
  text: { color: T.warn, fontSize: 15, lineHeight: 21, fontWeight: '600' },
})
