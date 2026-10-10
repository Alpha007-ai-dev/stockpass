import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { T } from '@/constants/theme'
import { describeChange, getMultiplierChanges, MultiplierChange } from '@/lib/insights'

export function MultiplierNotice({ symbol }: { symbol: string }) {
  const [c, setC] = useState<MultiplierChange | null>(null)
  useEffect(() => {
    let live = true
    getMultiplierChanges().then((all) => {
      if (live) setC(all.find((x) => x.symbol === symbol) ?? null)
    })
    return () => {
      live = false
    }
  }, [symbol])
  if (!c) return null
  return (
    <View style={s.card}>
      <Text style={s.text}>{describeChange(c)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.warn, borderRadius: 16, padding: 14 },
  text: { color: T.warn, fontSize: 14, lineHeight: 20, fontWeight: '600' },
})
