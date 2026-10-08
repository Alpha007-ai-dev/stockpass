import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { SvgXml } from 'react-native-svg'
import { issuerColor, T } from '@/constants/theme'

const PROXY = 'https://stockpass-collector.stockpass-dev.workers.dev/logo?symbol='

const svgCache = new Map<string, string>()

/** Backpack logos come as SVG files of varying size; make sure they scale to the box instead of being cropped. */
function fitSvg(xml: string): string {
  const m = xml.match(/<svg\b[^>]*>/i)
  if (!m) return xml
  let tag = m[0]
  const num = (name: string) => {
    const a = tag.match(new RegExp(`\\s${name}\\s*=\\s*["']\\s*([0-9.]+)\\s*(?:px)?\\s*["']`, 'i'))
    return a ? Number(a[1]) : null
  }
  const w = num('width')
  const h = num('height')
  if (!/\sviewBox\s*=/i.test(tag) && w && h) tag = tag.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`)
  tag = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '')
  if (!/preserveAspectRatio/i.test(tag)) tag = tag.replace(/<svg/i, '<svg preserveAspectRatio="xMidYMid meet"')
  return xml.replace(m[0], tag)
}

/** True when the logo only uses black (or the default fill), which disappears on the dark icon circle. */
function isDarkOnly(xml: string): boolean {
  const fills = [...xml.matchAll(/fill\s*[=:]\s*["']?\s*([^"';\s>]+)/gi)].map((m) => m[1].toLowerCase())
  const dark = new Set(['black', '#000', '#000000', '#000000ff', 'currentcolor', 'none', 'transparent'])
  return fills.every((f) => dark.has(f))
}

function useSvg(uri: string | null | undefined) {
  const [xml, setXml] = useState<string | null>(uri ? svgCache.get(uri) ?? null : null)
  const [bad, setBad] = useState(false)
  useEffect(() => {
    setBad(false)
    if (!uri) { setXml(null); return }
    const hit = svgCache.get(uri)
    if (hit) { setXml(hit); return }
    setXml(null)
    let live = true
    fetch(uri)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((txt) => {
        if (!/<svg/i.test(txt)) throw new Error('not svg')
        const fixed = fitSvg(txt)
        svgCache.set(uri, fixed)
        if (live) setXml(fixed)
      })
      .catch(() => { if (live) setBad(true) })
    return () => { live = false }
  }, [uri])
  return { xml, bad }
}

export function TokenIcon({ icon, label, issuer, symbol, size = 40 }: {
  symbol?: string
  icon?: string | null
  label: string
  issuer?: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const isBp = issuer === 'Backpack' && !!symbol
  const src = isBp ? PROXY + symbol : icon
  const svg = useSvg(isBp ? src : null)
  useEffect(() => { setFailed(false) }, [src])
  const color = issuerColor(issuer)
  const inner = size - 8
  return (
    <View style={[s.wrap, { width: size, height: size, borderRadius: size / 2, borderColor: color }, isBp && svg.xml && isDarkOnly(svg.xml) && { backgroundColor: '#F2F2F2' }]}>
      {isBp && svg.xml && !svg.bad ? (
        <SvgXml xml={svg.xml} width={inner} height={inner} />
      ) : !isBp && src && !failed ? (
        <Image source={{ uri: src }} onError={() => setFailed(true)} style={{ width: size - 6, height: size - 6, borderRadius: (size - 6) / 2 }} />
      ) : (
        <Text style={[s.text, { color, fontSize: size * 0.28 }]} numberOfLines={1}>{label.slice(0, 4)}</Text>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: T.surfaceAlt, overflow: 'hidden' },
  text: { fontWeight: '800' },
})





