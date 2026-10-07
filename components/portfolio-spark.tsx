import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { T } from '@/constants/theme'
import { getSeries } from '@/lib/stats'

export function PortfolioSpark({ tickers, up: upProp, width = 96, height = 44 }: {
  tickers: string[]
  up?: boolean
  width?: number
  height?: number
}) {
  const [points, setPoints] = useState<number[] | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const all = await Promise.all(tickers.slice(0, 4).map((t) => getSeries(t, 24).then((arr) => { const base = arr.find((q) => q.buy_px)?.buy_px; return base ? arr.map((q) => ({ ...q, buy_px: q.buy_px ? (q.buy_px / base) * 100 : q.buy_px })) : [] }).catch(() => [])))
        const buckets = new Map<number, { sum: number; n: number }>()
        all.flat().forEach((p) => {
          if (!p.buy_px) return
          const slot = Math.floor(p.ts / 3600)
          const b = buckets.get(slot) ?? { sum: 0, n: 0 }
          b.sum += p.buy_px
          b.n += 1
          buckets.set(slot, b)
        })
        const series = [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b.sum / b.n)
        if (!cancelled) setPoints(series.length >= 3 ? series : [])
      } catch {
        if (!cancelled) setPoints([])
      }
    })()
    return () => { cancelled = true }
  }, [tickers.join(',')])

  if (!points || points.length < 3) return <View style={{ width, height }} />

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = Math.max(0.0001, max - min)
  const step = width / (points.length - 1)
  const coords = points.map((v, i) => [i * step, height - 4 - ((v - min) / span) * (height - 10)])
  const d = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const fill = `${d} L${width},${height} L0,${height} Z`
  const up = upProp ?? points[points.length - 1] >= points[0]
  const color = up ? T.accent : T.down

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="ps" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="0.25" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d={fill} fill="url(#ps)" />
      <Path d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  )
}

const s = StyleSheet.create({})
