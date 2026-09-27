import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'stockpass.lastPurchase'

export type Purchase = {
  ticker: string
  symbol: string
  issuer: string
  sizeUsd: number
  entryBps: number
  feeBps: number
  altBps: number | null
  savedBps: number | null
  signature: string
  at: number
}

export async function savePurchase(p: Purchase): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(p))
  } catch {}
}

export async function getLastPurchase(): Promise<Purchase | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Purchase) : null
  } catch {
    return null
  }
}
