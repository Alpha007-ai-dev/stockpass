import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
import { T } from '@/constants/theme'

export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
}: {
  height?: number
  width?: number | string
  radius?: number
  style?: ViewStyle
}) {
  const pulse = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  return (
    <Animated.View
      style={[
        { height, width: width as any, borderRadius: radius, backgroundColor: T.surfaceAlt, opacity: pulse },
        style,
      ]}
    />
  )
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={s.card}>
      <Skeleton height={13} width="40%" />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={20} width={i === 0 ? '70%' : '55%'} />
      ))}
    </View>
  )
}

export function SkeletonRow() {
  return (
    <View style={s.row}>
      <Skeleton height={40} width={40} radius={20} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton height={15} width="45%" />
        <Skeleton height={12} width="65%" />
      </View>
      <Skeleton height={18} width={64} />
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderRadius: 18, borderWidth: 1, borderColor: T.border, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
})
