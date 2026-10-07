import { useCallback, useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import { num, T } from '@/constants/theme'
import { CostAlert, getAlerts } from '@/lib/alerts'

/** Home card: the alerts whose threshold has been reached, checked whenever the tab gains focus. */
export function AlertsCard({ owner }: { owner: string | undefined }) {
  const router = useRouter()
  const [hits, setHits] = useState<CostAlert[]>([])
  const at = useRef(0)

  useFocusEffect(useCallback(() => {
    if (!owner) { setHits([]); return }
    if (Date.now() - at.current < 30000) return
    at.current = Date.now()
    getAlerts(owner).then((all) => setHits(all.filter((a) => a.triggered))).catch(() => {})
  }, [owner]))

  if (!owner || hits.length === 0) return null
  return (
    <View style={s.card}>
      <Text style={s.kicker}>YOUR ALERTS</Text>
      {hits.map((a) => (
        <Pressable key={a.symbol} style={s.row} onPress={() => router.push(`/buy?symbol=${a.symbol}`)}>
          <Text style={s.text}>
            <Text style={s.strong}>{a.symbol}</Text> now costs <Text style={[s.strong, num]}>{a.current_bps} bps</Text> to buy, under your {a.threshold_bps} bps
          </Text>
          <Text style={s.chev}>›</Text>
        </Pressable>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.accent, borderRadius: 16, padding: 14, gap: 8, marginBottom: 12 },
  kicker: { color: T.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  text: { color: T.dim, fontSize: 15, flexShrink: 1, lineHeight: 21 },
  strong: { color: T.text, fontWeight: '700' },
  chev: { color: T.faint, fontSize: 22 },
})
