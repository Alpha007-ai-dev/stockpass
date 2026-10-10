import { useEffect, useState } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { num, T } from '@/constants/theme'
import { Collateral, getCollateral } from '@/lib/stats'
import { kaminoBorrowUrl } from '@/lib/kamino'

export function CollateralSection({ symbol, otherSymbol }: { symbol: string; otherSymbol: string }) {
  const [rows, setRows] = useState<Collateral[] | null>(null)

  useEffect(() => {
    getCollateral()
      .then(setRows)
      .catch(() => setRows([]))
  }, [])
  if (!rows) return null

  const mine = rows.filter((r) => r.symbol === symbol)
  const other = rows.filter((r) => r.symbol === otherSymbol)
  const best = mine.length ? mine.reduce((a, b) => (a.borrowApy <= b.borrowApy ? a : b)) : null

  return (
    <View style={s.card}>
      <Text style={s.title}>Use it as collateral</Text>

      {mine.length === 0 ? (
        <Text style={s.faint}>
          {symbol} is not accepted as collateral on Kamino.
          {other.length > 0 ? ` ${otherSymbol} is — up to ${Math.round(other[0].maxLtv * 100)}% LTV.` : ''}
        </Text>
      ) : (
        <>
          {mine.map((r) => (
            <View key={r.market} style={[s.row, best?.market === r.market && s.rowBest]}>
              <View style={{ flex: 1 }}>
                <Text style={s.market}>{r.market}</Text>
                <Text style={s.faint}>${(r.marketUsd / 1e6).toFixed(2)}M supplied</Text>
              </View>
              <View style={s.stats}>
                <Text style={[s.stat, num]}>{Math.round(r.maxLtv * 100)}%</Text>
                <Text style={s.statLabel}>max LTV</Text>
              </View>
              <View style={s.stats}>
                <Text style={[s.stat, num, best?.market === r.market && s.accent]}>
                  {(r.borrowApy * 100).toFixed(2)}%
                </Text>
                <Text style={s.statLabel}>borrow</Text>
              </View>
              <Text style={s.extLink}>&#8599;</Text>
            </View>
          ))}

          {mine.length > 1 && (
            <View style={s.notice}>
              <Text style={s.noticeIcon}>&#9888;</Text>
              <Text style={s.noticeText}>
                Same token. Different lending markets. The borrowing rate is{' '}
                {(
                  Math.max(...mine.map((r) => r.borrowApy)) /
                  Math.max(0.0001, Math.min(...mine.map((r) => r.borrowApy)))
                ).toFixed(1)}
                × higher depending on the market.
              </Text>
            </View>
          )}

          {other.length === 0 && (
            <View style={s.blocked}>
              <Text style={s.blockedTitle}>
                &#8856; Not accepted ({otherSymbol.endsWith('on') ? 'Ondo' : 'xStocks'})
              </Text>
              <Text style={s.faint}>{otherSymbol} is currently not accepted as collateral on Kamino markets.</Text>
            </View>
          )}

          <Pressable onPress={() => Linking.openURL(kaminoBorrowUrl())}>
            <Text style={s.link}>Open in Kamino ›</Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderRadius: 20, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  title: { color: T.text, fontSize: 15, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.border,
    padding: 12,
  },
  rowBest: { borderColor: T.accent },
  market: { color: T.text, fontSize: 14, fontWeight: '600' },
  notice: { flexDirection: 'row', gap: 10, backgroundColor: '#2A2110', borderRadius: 14, padding: 12 },
  noticeIcon: { color: T.warn, fontSize: 16 },
  noticeText: { color: '#E8D6A8', fontSize: 13, lineHeight: 19, flex: 1 },
  blocked: { backgroundColor: '#2A1414', borderRadius: 14, padding: 12, gap: 4 },
  blockedTitle: { color: T.down, fontSize: 13, fontWeight: '700' },
  stats: { alignItems: 'flex-end', width: 62 },
  stat: { color: T.text, fontSize: 16, fontWeight: '700' },
  statLabel: { color: T.faint, fontSize: 10 },
  accent: { color: T.accent },
  faint: { color: T.faint, fontSize: 13 },
  link: { color: T.accent, fontSize: 13, fontWeight: '600' },
  extLink: { color: T.faint, fontSize: 16, marginLeft: 4 },
})
