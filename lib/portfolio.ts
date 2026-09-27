import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'stockpass.lastPortfolio'

export type Snapshot = { total: number; at: number }

export async function getLastPortfolio(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Snapshot) : null
  } catch {
    return null
  }
}

export async function savePortfolio(total: number): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ total, at: Date.now() }))
  } catch {}
}
