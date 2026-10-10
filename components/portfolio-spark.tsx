import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg'
import { T } from '@/constants/theme'
import { NO_MARKET_BPS } from '@/lib/cost'
import { getSeries, type SeriesPoint } from '@/lib/stats'

export function PortfolioSpark({ items, up: upProp, width = 96, height = 44 }: {
  /** The held tokens: ticker + symbol to look up, value in USD as the weight. */
  items: { ticker: string; symbol: string; value: number }[]
  up?: boolean
  width?: number
  height?: number
}) {
  const [points, setPoints] = useState<number[] | null>(null)
  const key = items.map((i) => i.symbol).join(',')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const held = items.filter((i) => i.value > 0).slice(0, 8)
        const series = await Promise.all(
          held.map(async (i) => {
            // One failing ticker must not blank the whole chart.
            const rows = (await getSeries(i.ticker, 24).catch((): SeriesPoint[] => []))
              .filter((p) => p.symbol === i.symbol && p.buy_px && p.quotable && p.entry_bps !== null && p.entry_bps < NO_MARKET_BPS)
              // Mid price: the buy price minus the entry cost, so a changing cost does not look like a price move.
              .map((p) => ({ ts: p.ts, px: (p.buy_px as number) / (1 + Math.max(0, p.entry_bps as number) / 10000) }))
              .sort((x, y) => x.ts - y.ts)
            return { weight: i.value, rows }
          }),
        )
        const usable = series.filter((x) => x.rows.length >= 2)
        const nowS = Math.floor(Date.now() / 1000)
        const slots = Array.from({ length: 25 }, (_, k) => nowS - (24 - k) * 3600)
        // Each token becomes an index (first price = 1), carried forward between its samples, then weighted by what you hold.
        const out = slots.map((end) => {
          let sum = 0
          let wsum = 0
          for (const x of usable) {
            const base = x.rows[0].px
            let last = x.rows[0].px
            for (const r of x.rows) { if (r.ts <= end) last = r.px; else break }
            sum += x.weight * (last / base)
            wsum += x.weight
          }
          return wsum > 0 ? sum / wsum : NaN
        })
        if (!cancelled) setPoints(usable.length ? out.filter((v) => Number.isFinite(v)) : [])
      } catch {
        if (!cancelled) setPoints([])
      }
    })()
    return () => { cancelled = true }
  }, [key])

  if (!points || points.length < 3) return <View style={{ width, height }} />

  const min = Math.min(...points)
  const max = Math.max(...points)
  // Never zoom in closer than 1%: executable prices wobble by a few tenths of a percent, and that must look like wobble.
  const mid = (min + max) / 2
  const span = Math.max(0.01, max - min)
  const step = width / (points.length - 1)
  const coords = points.map((v, i) => [i * step, height - 4 - ((v - (mid - span / 2)) / span) * (height - 10)])
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
