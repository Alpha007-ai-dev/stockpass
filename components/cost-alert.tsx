import { useCallback, useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useMobileWallet } from '@wallet-ui/react-native-kit'
import { num, T } from '@/constants/theme'
import { CostAlert as Alert, getAlerts, removeAlert, setAlert } from '@/lib/alerts'

// Thresholds offered as a share of today's cost, so every choice is a real improvement.
function options(current: number): number[] {
  const out = new Set<number>()
  for (const f of [0.5, 0.75]) {
    const v = Math.floor(current * f)
    if (v >= 0 && v < current) out.add(v)
  }
  return Array.from(out).sort((a, b) => a - b)
}

export function CostAlert({ symbol, currentBps }: { symbol: string; currentBps: number | null }) {
  const { account } = useMobileWallet() as any
  const owner: string | undefined = account?.address ? String(account.address) : undefined
  const [alert, setAlertState] = useState<Alert | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!owner) { setAlertState(null); return }
    try {
      const all = await getAlerts(owner)
      setAlertState(all.find((a) => a.symbol === symbol) ?? null)
    } catch { /* the row stays hidden state; setting an alert will report errors */ }
  }, [owner, symbol])

  useEffect(() => { load() }, [load])

  const act = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null)
    try { await fn(); await load() } catch (e) { setError('Could not save the alert, try again.') }
    setBusy(false)
  }

  if (!owner) {
    return (
      <View style={s.card}>
        <Text style={s.kicker}>COST ALERT</Text>
        <Text style={s.tiny}>Connect your wallet to be told when {symbol} gets cheaper to buy.</Text>
      </View>
    )
  }

  const opts = currentBps !== null ? options(currentBps) : []

  return (
    <View style={s.card}>
      <Text style={s.kicker}>COST ALERT</Text>
      {alert ? (
        <>
          <View style={s.row}>
            <Text style={s.text}>Tell me when buying costs ≤ <Text style={[s.strong, num]}>{alert.threshold_bps} bps</Text></Text>
            <Pressable onPress={() => act(() => removeAlert(owner, symbol))} disabled={busy}>
              <Text style={s.remove}>Remove</Text>
            </Pressable>
          </View>
          {alert.triggered && <Text style={[s.tiny, { color: T.accent }]}>Triggered: it costs {alert.current_bps} bps right now.</Text>}
        </>
      ) : opts.length > 0 ? (
        <>
          <Text style={s.tiny}>Tell me when buying {symbol} costs at most:</Text>
          <View style={s.chips}>
            {opts.map((v) => (
              <Pressable key={v} style={s.chip} disabled={busy} onPress={() => act(() => setAlert(owner, symbol, v))}>
                <Text style={[s.chipText, num]}>{v} bps</Text>
              </Pressable>
            ))}
          </View>
          <Text style={s.tiny}>Checked when you open the app. No push notification.</Text>
        </>
      ) : (
        <Text style={s.tiny}>{currentBps === null ? 'No quote right now.' : 'It is already about as cheap as it gets.'}</Text>
      )}
      {error && <Text style={[s.tiny, { color: T.down }]}>{error}</Text>}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 16, gap: 8 },
  kicker: { color: T.faint, fontSize: 12, fontWeight: '700', letterSpacing: 1.2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  text: { color: T.dim, fontSize: 15, flexShrink: 1 },
  strong: { color: T.text, fontWeight: '700' },
  remove: { color: T.faint, fontSize: 14, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: T.accent },
  chipText: { color: T.accent, fontSize: 14, fontWeight: '700' },
  tiny: { color: T.faint, fontSize: 12, lineHeight: 17 },
})
