import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ISSUERS } from '../constants/issuers'
import { compact, getStats, History, Latest } from '../lib/stats'

export default function PassportScreen() {
  const { symbol } = useLocalSearchParams<{ symbol?: string }>()
  const sym = symbol ?? 'SPYx'
  const [latest, setLatest] = useState<Latest | null>(null)
  const [hist, setHist] = useState<History[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getStats()
      .then((s) => {
        setLatest(s.latest.find((r) => r.symbol === sym) ?? null)
        setHist(s.history.filter((r) => r.symbol === sym))
      })
      .catch((e) => setError((e as Error).message))
  }, [sym])

  const issuerName = sym.endsWith('on') ? 'Ondo' : 'xStocks'
  const info = ISSUERS[issuerName]
  const samples = hist.reduce((n, h) => n + h.samples, 0)
  const avail = samples > 0 ? hist.reduce((n, h) => n + h.availability * h.samples, 0) / samples : null

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <Text style={s.kicker}>TOKEN PASSPORT</Text>
      <Text style={s.title}>{sym}</Text>
      <Text style={s.muted}>{issuerName}{error ? ` - ${error}` : ''}</Text>

      <View style={s.card}>
        <View style={s.grid}>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Multiplier</Text>
            <Text style={s.cellValue}>{latest ? `x${latest.multiplier.toFixed(5)}` : '-'}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Supply</Text>
            <Text style={s.cellValue}>{latest ? compact(latest.supply) : '-'}</Text>
          </View>
          <View style={s.cell}>
            <Text style={s.cellLabel}>Entry now</Text>
            <Text style={s.cellValue}>{latest ? (latest.quotable ? `${latest.entry_bps} bps` : 'no quote') : '-'}</Text>
          </View>
        </View>
      </View>

      {hist.length > 0 && (
        <View style={s.card}>
          <Text style={s.sectionTitle}>Cost to enter by market state</Text>
          {hist.map((h) => (
            <View key={h.market_state} style={s.row}>
              <Text style={s.label}>{h.market_state}</Text>
              <Text style={s.value}>
                {h.avg_entry.toFixed(0)} bps ({h.min_entry}-{h.max_entry}), {h.samples} samples
              </Text>
            </View>
          ))}
          {avail !== null && (
            <Text style={s.tiny}>Quote available {(avail * 100).toFixed(0)}% of measurements</Text>
          )}
        </View>
      )}

      <View style={s.card}>
        <View style={s.row}><Text style={s.label}>Issuer</Text><Text style={s.value}>{info.legalName}</Text></View>
        <View style={s.row}><Text style={s.label}>Backing</Text><Text style={s.value}>{info.backing}</Text></View>
        <View style={s.row}><Text style={s.label}>Dividends</Text><Text style={s.value}>{info.dividends}</Text></View>
        <View style={s.row}><Text style={s.label}>Redemption</Text><Text style={s.value}>{info.redemption}</Text></View>
        <View style={s.row}><Text style={s.label}>Eligibility</Text><Text style={s.value}>{info.eligibility}</Text></View>
        <View style={s.row}><Text style={s.label}>Standard</Text><Text style={s.value}>{info.standard}</Text></View>
      </View>

      <Text style={s.tiny}>
        Live values read on-chain and from our own measurements.
        {latest ? ` Last measured ${new Date(latest.ts * 1000).toLocaleString()}.` : ''}
      </Text>
    </ScrollView>
  )
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0E0E0D' },
  content: { padding: 20, gap: 12 },
  kicker: { color: '#8A8A84', fontSize: 12, letterSpacing: 1 },
  title: { color: '#F5F5F1', fontSize: 34, fontWeight: '600' },
  card: { borderWidth: 1, borderColor: '#262624', borderRadius: 16, padding: 16, gap: 10, backgroundColor: '#181817' },
  grid: { flexDirection: 'row', justifyContent: 'space-between' },
  cell: { gap: 4, flex: 1 },
  cellLabel: { color: '#8A8A84', fontSize: 12 },
  cellValue: { color: '#F5F5F1', fontSize: 17, fontWeight: '500' },
  sectionTitle: { color: '#F5F5F1', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: '#A7A7A0', fontSize: 14, flexShrink: 0 },
  value: { color: '#F5F5F1', fontSize: 14, flexShrink: 1, textAlign: 'right' },
  muted: { color: '#A7A7A0', fontSize: 13 },
  tiny: { color: '#8A8A84', fontSize: 12 },
})
