import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'stockpass.portfolio.snapshot'

export type Snapshot = { total: number; at: number; demo: boolean }

export async function getLastPortfolio(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Snapshot>
    if (typeof parsed.total !== 'number' || typeof parsed.at !== 'number') return null
    // Snapshots written before demo tracking existed are discarded rather than
    // compared against a different portfolio.
    if (typeof parsed.demo !== 'boolean') return null
    return parsed as Snapshot
  } catch {
    return null
  }
}

export async function savePortfolio(total: number, demo: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ total, at: Date.now(), demo }))
  } catch {}
}
