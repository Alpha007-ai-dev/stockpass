import { useEffect, useState } from 'react'
import { Image, StyleSheet, Text, View } from 'react-native'
import { SvgUri } from 'react-native-svg'
import { issuerColor, T } from '@/constants/theme'

const PROXY = 'https://stockpass-collector.stockpass-dev.workers.dev/logo?symbol='

export function TokenIcon({ icon, label, issuer, symbol, size = 40 }: {
  symbol?: string
  icon?: string | null
  label: string
  issuer?: string
  size?: number
}) {
  const [failed, setFailed] = useState(false)
  const src = issuer === 'Backpack' && symbol ? PROXY + symbol : icon
  useEffect(() => { setFailed(false) }, [src])
  const color = issuerColor(issuer)
  return (
    <View style={[s.wrap, { width: size, height: size, borderRadius: size / 2, borderColor: color }]}>
      {src && !failed && issuer === 'Backpack' ? (
        <SvgUri uri={src} width={size - 8} height={size - 8} onError={() => setFailed(true)} />
      ) : src && !failed ? (
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





