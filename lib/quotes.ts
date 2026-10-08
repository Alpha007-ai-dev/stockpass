import { USDC_MINT, StockToken } from '../constants/stocks'
import { getMintInfo } from './multipliers'

const ULTRA_ORDER = 'https://lite-api.jup.ag/ultra/v1/order'
const CALL_DELAY_MS = 700

export type Quote = {
  buy: number // price per share when buying
  sell: number // price per share when selling
  entryBps: number // cost of getting in
  exitBps: number // cost of getting out
  supply: number
  next: number | null
  nextAt: number | null
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function orderOut(inputMint: string, outputMint: string, amount: string): Promise<string> {
  const res = await fetch(`${ULTRA_ORDER}?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (!json?.outAmount) throw new Error(json?.error ?? 'No quote')
  return String(json.outAmount)
}

export async function quoteToken(token: StockToken, sizeUsd = 1000): Promise<Quote> {
  const info = (await getMintInfo())[token.mint]
  const m = info?.multiplier ?? 1
  const tokenRaw = await orderOut(USDC_MINT, token.mint, String(Math.round(sizeUsd * 1e6)))
  await sleep(CALL_DELAY_MS)
  const shares = (Number(tokenRaw) / 10 ** token.decimals) * m
  const backRaw = await orderOut(token.mint, USDC_MINT, tokenRaw)
  await sleep(CALL_DELAY_MS)

  const buy = sizeUsd / shares
  const sell = Number(backRaw) / 1e6 / shares
  const mid = (buy + sell) / 2

  return {
    buy,
    sell,
    entryBps: Math.round((buy / mid - 1) * 10000),
    exitBps: Math.round((1 - sell / mid) * 10000),
    supply: info?.supply ?? 0,
    next: info?.next ?? null,
    nextAt: info?.nextAt ?? null,
  }
}

export function compare(a: Quote, b: Quote) {
  const midA = (a.buy + a.sell) / 2
  const midB = (b.buy + b.sell) / 2
  return {
    midDiffBps: Math.round((midB / midA - 1) * 10000),
    entryDiffBps: b.entryBps - a.entryBps,
    switchAtoB: Math.round((a.sell / b.buy - 1) * 10000),
    switchBtoA: Math.round((b.sell / a.buy - 1) * 10000),
  }
}
