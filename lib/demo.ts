import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'stockpass.demoMode'

// Valós tokenek, kitalált mennyiségekkel. Az árakat és a szorzókat
// a mérésekből vesszük, tehát csak a darabszám a demóé.
export const DEMO_HOLDINGS: { symbol: string; walletAmount: number }[] = [
  { symbol: 'SPYx', walletAmount: 10.5 },
  { symbol: 'NVDAx', walletAmount: 25 },
  { symbol: 'HOODbp', walletAmount: 120 },
  { symbol: 'TSLAon', walletAmount: 3.2 },
]

let cached: boolean | null = null

export async function isDemo(): Promise<boolean> {
  if (cached !== null) return cached
  try {
    cached = (await AsyncStorage.getItem(KEY)) === '1'
  } catch {
    cached = false
  }
  return cached
}

export async function setDemo(on: boolean): Promise<void> {
  cached = on
  try {
    await AsyncStorage.setItem(KEY, on ? '1' : '0')
  } catch {}
}
