import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ISSUERS } from '../constants/issuers'
import { num, T } from '../constants/theme'
import { compact, getStats, History, Latest } from '../lib/stats'

const STATE_LABEL: Record<string, string> = {
  open: 'Market open', pre: 'Pre-market', after: 'After hours', closed: 'Overnight', weekend: 'Weekend',
}

export default function PassportScreen() {
  const router = useRouter()
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? 'SPYx'
  const [latest, setLatest] = useState<Latest | null>(null)
  const [hist, setHist] = useState<History[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((s) => {
        setLatest(s.latest.find((r) => r.symbol === sym) ?? null)
        setHist(s.history.filter((r) => r.symbol === sym).sort((a, b) => b.samples - a.samples))
      })
      .catch((e) => setError((e as Error).message))
  }, [sym])

  const issuerName = sym.endsWith('on') ? 'Ondo' : 'xStocks'
  const info = ISSUERS[issuerName]
  const samples = hist.reduce((n, h) => n + h.samples, 0)
  const avail = samples > 0 ? hist.reduce((n, h) => n + h.availability * h.samples, 0) / samples : null
  const maxAvg = Math.max(1, ...hist.map((h) => h.avg_entry))

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Pressable onPress={() => router.back()} style={s.back}><Text style={s.backText}>‹ Back</Text></Pressable>

      <Text style={s.kicker}>TOKEN PASSPORT</Text>
      <Text style={s.title}>{sym}</Text>
      <View style={s.badge}><Text style={s.badgeText}>{issuerName}</Text></View>

      <View style={s.card}>
        <View style={s.grid}>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Multiplier</Text>
            <Text style={[s.cellValue, num]}>{latest ? `×${latest.multiplier.toFixed(5)}` : '—'}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Supply</Text>
            <Text style={[s.cellValue, num]}>{latest ? compact(latest.supply) : '—'}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Entry now</Text>
            <Text style={[s.cellValue, num, { color: T.accent }]}>
              {latest ? (latest.quotable ? `${latest.entry_bps} bps` : 'no quote') : '—'}
            </Text>
          </View>
        </View>
        <Text style={s.faint}>
          One token equals {latest ? latest.multiplier.toFixed(5) : '—'} shares. Wallets usually show the raw count.
        </Text>
      </View>

      {hist.length > 0 && (
        <View style={s.card}>
          <Text style={s.section}>Cost to enter by market state</Text>
          {hist.map((h) => (
            <View key={h.market_state} style={s.barRow}>
              <Text style={s.barLabel}>{STATE_LABEL[h.market_state] ?? h.market_state}</Text>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round((h.avg_entry / maxAvg) * 100)}%` }]} />
              </View>
              <Text style={[s.barValue, num]}>{h.avg_entry.toFixed(0)}</Text>
            </View>
          ))}
          <Text style={s.faint}>
            {samples} measurements{avail !== null ? ` · quote available ${(avail * 100).toFixed(0)}% of the time` : ''}
          </Text>
        </View>
      )}

      <View style={s.card}>
        {[
          ['Issuer', info.legalName],
          ['Backing', info.backing],
          ['Dividends', info.dividends],
          ['Redemption', info.redemption],
          ['Eligibility', info.eligibility],
          ['Standard', info.standard],
        ].map(([k, v]) => (
          <View key={k} style={s.row}>
            <Text style={s.label}>{k}</Text>
            <Text style={s.value}>{v}</Text>
          </View>
        ))}
      </View>

      <Text style={s.faint}>
        {error ? error : latest ? `Last measured ${new Date(latest.ts * 1000).toLocaleString()}` : 'Loading…'}
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: T.bg },
  content: { padding: 20, paddingBottom: 40, gap: T.gap },
  back: { paddingVertical: 8, alignSelf: 'flex-start' },
  backText: { color: T.dim, fontSize: 15 },
  kicker: { color: T.faint, fontSize: 11, letterSpacing: 1.4 },
  title: { color: T.text, fontSize: 38, fontWeight: '700', letterSpacing: -1 },
  badge: { alignSelf: 'flex-start', backgroundColor: T.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { color: T.text, fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 12 },
  grid: { flexDirection: 'row', gap: 12 },
  cell: { flex: 1, gap: 4 },
  cellLabel: { color: T.faint, fontSize: 12 },
  cellValue: { color: T.text, fontSize: 18, fontWeight: '600' },
  section: { color: T.text, fontSize: 15, fontWeight: '600' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { color: T.dim, fontSize: 13, width: 92 },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: T.border },
  fill: { height: 8, borderRadius: 4, backgroundColor: T.accent },
  barValue: { color: T.text, fontSize: 13, width: 28, textAlign: 'right' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: T.dim, fontSize: 14 },
  value: { color: T.text, fontSize: 14, textAlign: 'right', flexShrink: 1 },
  faint: { color: T.faint, fontSize: 12 },
})
