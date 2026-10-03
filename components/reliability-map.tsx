import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { issuerColor, num, T } from '@/constants/theme'
import { getTokenReliability, Latest, TokenRel } from '@/lib/stats'

const TILE = 44

function band(a: number) {
  if (a >= 80) return { bg: '#16301C', fg: '#6BEF92' }
  if (a >= 40) return { bg: '#33290F', fg: '#F5C451' }
  if (a > 0) return { bg: '#3A1B14', fg: '#FB8A5C' }
  return { bg: '#181A18', fg: '#7A8078' }
}

export function ReliabilityMap({ latest }: { latest?: Record<string, Latest> }) {
  const router = useRouter()
  const [tokens, setTokens] = useState<TokenRel[] | null>(null)
  const [mode, setMode] = useState<'history' | 'now'>('history')
  const hasNow = latest && Object.keys(latest).length > 0

  useEffect(() => {
    getTokenReliability().then(setTokens).catch(() => setTokens([]))
  }, [])

  if (!tokens) return <Text style={s.faint}>Loading…</Text>
  if (!tokens.length) return <Text style={s.faint}>Reliability data is not available right now.</Text>

  const issuers = ['xStocks', 'Ondo', 'Backpack'].filter((i) => tokens.some((t) => t.issuer === i))

  return (
    <View style={{ gap: 18 }}>
      <View style={s.intro}>
        <Text style={s.introTitle}>
          {mode === 'now' ? 'What can you trade right now?' : 'How often can you actually trade?'}
        </Text>
        <Text style={s.faint}>
          {mode === 'now'
            ? 'Each tile is one token. Green means an executable quote exists at this moment.'
            : 'Each tile is one token, coloured by the share of all our measurements where an executable quote existed. This is the track record, not what is tradeable right now.'}
        </Text>
      </View>

      {hasNow && (
        <View style={s.toggle}>
          {(['history', 'now'] as const).map((m) => (
            <Pressable key={m} onPress={() => setMode(m)} style={[s.toggleBtn, mode === m && s.toggleOn]}>
              <Text style={[s.toggleText, mode === m && s.toggleTextOn]}>
                {m === 'history' ? 'Track record' : 'Right now'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {issuers.map((issuer) => {
        const list = tokens
          .filter((t) => t.issuer === issuer)
          .sort((a, b) => b.availability - a.availability)
        const reliable = list.filter((t) => t.availability >= 80).length
        const avg = list.reduce((n, t) => n + t.availability, 0) / Math.max(1, list.length)
        const liveCount = list.filter((t) => latest?.[t.symbol]?.quotable).length

        return (
          <View key={issuer} style={{ gap: 9 }}>
            <View style={s.head}>
              <View style={s.headLeft}>
                <View style={[s.dot, { backgroundColor: issuerColor(issuer) }]} />
                <Text style={s.issuer}>{issuer}</Text>
              </View>
              <Text style={[s.headStat, num]}>
                {mode === 'now'
                  ? <>{liveCount}/{list.length} <Text style={s.faint}>tradeable now</Text></>
                  : <>{reliable}/{list.length} <Text style={s.faint}>reliable · {avg.toFixed(0)}% avg</Text></>}
              </Text>
            </View>

            <View style={s.grid}>
              {list.map((t) => {
                const liveOk = mode === 'now' ? !!latest?.[t.symbol]?.quotable : null
                const c = band(liveOk === null ? t.availability : liveOk ? 100 : 0)
                return (
                  <Pressable
                    key={t.symbol}
                    style={[s.tile, { backgroundColor: c.bg }]}
                    onPress={() => router.push(`/passport?symbol=${t.symbol}`)}>
                    <Text style={[s.tileTicker, { color: c.fg }]} numberOfLines={1}>
                      {t.ticker ?? t.symbol}
                    </Text>
                    <Text style={[s.tilePct, num, { color: c.fg }]}>
                      {liveOk === null ? `${t.availability}%` : liveOk ? 'live' : '—'}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
        )
      })}

      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: '#6BEF92' }]} /><Text style={s.faint}>80%+</Text></View>
        <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: '#F5C451' }]} /><Text style={s.faint}>40–80%</Text></View>
        <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: '#FB8A5C' }]} /><Text style={s.faint}>under 40%</Text></View>
        <View style={s.legendItem}><View style={[s.ldot, { backgroundColor: '#7A8078' }]} /><Text style={s.faint}>never quotable</Text></View>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  intro: { gap: 5 },
  toggle: { flexDirection: 'row', backgroundColor: T.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: T.border },
  toggleBtn: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 11 },
  toggleOn: { backgroundColor: T.accent },
  toggleText: { color: T.dim, fontSize: 14, fontWeight: '600' },
  toggleTextOn: { color: T.bg, fontWeight: '700' },
  introTitle: { color: T.text, fontSize: 17, fontWeight: '700' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  issuer: { color: T.text, fontSize: 16, fontWeight: '700' },
  headStat: { color: T.text, fontSize: 14, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tile: { width: TILE, height: TILE, borderRadius: 9, alignItems: 'center', justifyContent: 'center', gap: 1 },
  tileTicker: { fontSize: 9, fontWeight: '800' },
  tilePct: { fontSize: 12, fontWeight: '700' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 2 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ldot: { width: 8, height: 8, borderRadius: 4 },
  faint: { color: T.faint, fontSize: 13, lineHeight: 18 },
})
