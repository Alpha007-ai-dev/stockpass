import { USDC_MINT, StockToken } from '../constants/stocks'

const ULTRA_ORDER = 'https://lite-api.jup.ag/ultra/v1/order'
const CALL_DELAY_MS = 700

export type Quote = { buy: number; sell: number }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function orderOut(inputMint: string, outputMint: string, amount: string): Promise<string> {
  const res = await fetch(`${ULTRA_ORDER}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.outAmount) throw new Error(json?.error ?? 'No quote')
  return String(json.outAmount)
}

// Quote only - no transaction, no wallet
export async function quoteToken(token: StockToken, sizeUsd = 1000): Promise<Quote> {
  const tokenRaw = await orderOut(USDC_MINT, token.mint, String(Math.round(sizeUsd * 1e6)))
  await sleep(CALL_DELAY_MS)
  const units = Number(tokenRaw) / 10 ** token.decimals
  const backRaw = await orderOut(token.mint, USDC_MINT, tokenRaw)
  await sleep(CALL_DELAY_MS)
  return { buy: sizeUsd / units, sell: Number(backRaw) / 1e6 / units }
}

export function compare(a: Quote, b: Quote) {
  const midA = (a.buy + a.sell) / 2
  const midB = (b.buy + b.sell) / 2
  return {
    midDiffBps: Math.round((midB / midA - 1) * 10000),
    switchAtoB: Math.round((a.sell / b.buy - 1) * 10000),
    switchBtoA: Math.round((b.sell / a.buy - 1) * 10000),
  }
}
