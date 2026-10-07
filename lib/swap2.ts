// Jupiter Swap V2 through the StockPass Worker (the API key never ships in the app), plus the
// automatic choice between the standard route (v1) and Swap V2: whichever returns more wins.
import { getBase64EncodedWireTransaction, getTransactionDecoder } from '@solana/transactions';
import { getBase64Decoder, getBase64Encoder } from '@solana/codecs-strings';
import { buildSwapTx, decodeTx, getQuote, PayToken, Quote } from './swap';

const BASE = 'https://stockpass-collector.stockpass-dev.workers.dev';
/** Swap V2 must beat the standard route by this much to be chosen (it has no StockPass fee, but the standard route is the proven path). */
const V2_EDGE = 0.002;
/** At signing time the fresh quote may be at most this much worse than the one the user reviewed. */
const MAX_REQUOTE_DROP = 0.01;

const ROUTER_LABEL: Record<string, string> = {
  jupiterz: 'Jupiter market maker',
  metis: 'Jupiter Metis',
  dflow: 'DFlow',
  okx: 'OKX',
  iris: 'Jupiter Iris',
};

async function fetchOrder(pay: PayToken, amountRaw: number, outputMint: string, taker?: string): Promise<any | null> {
  const q =
    `inputMint=${pay.mint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=50` +
    (taker ? `&taker=${taker}` : '');
  const r = await fetch(`${BASE}/swap/order?${q}`);
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || j.error || !j.outAmount) return null;
  return j;
}

export async function getQuoteV2(
  pay: PayToken,
  payAmount: number,
  outputMint: string,
  outDecimals: number,
  outSymbol?: string,
): Promise<Quote | null> {
  try {
    if (pay.mint === outputMint) return null;
    const amountRaw = Math.round(payAmount * Math.pow(10, pay.decimals));
    if (!(amountRaw > 0)) return null;
    const j = await fetchOrder(pay, amountRaw, outputMint);
    if (!j) return null;
    const router = String(j.router ?? '');
    return {
      raw: { amountRaw, outputMint, outDecimals },
      outUi: Number(j.outAmount) / Math.pow(10, outDecimals),
      feeUi: 0,
      feeBps: Number(j.feeBps ?? 0),
      feeSymbol: outSymbol || 'tokens',
      priceImpactPct: 0,
      slippageBps: Number(j.slippageBps ?? 50),
      contextSlot: 0,
      outSymbol,
      paySymbol: pay.symbol,
      route: 'v2',
      routeLabel: ROUTER_LABEL[router] ?? (router || 'Jupiter'),
      impactKnown: false,
      payToken: pay,
    };
  } catch {
    return null;
  }
}

/** Both routes in parallel; the one with the higher net output wins. A single available route is used as is. */
export async function getBestQuote(
  pay: PayToken,
  payAmount: number,
  outputMint: string,
  outDecimals: number,
  outSymbol?: string,
  feeBps?: number,
): Promise<Quote | null> {
  const [v1, v2] = await Promise.all([
    getQuote(pay, payAmount, outputMint, outDecimals, outSymbol, feeBps),
    getQuoteV2(pay, payAmount, outputMint, outDecimals, outSymbol),
  ]);
  if (v1 && v2) {
    if (v2.outUi > v1.outUi * (1 + V2_EDGE)) return { ...v2, altOutUi: v1.outUi, altLabel: v1.routeLabel };
    return { ...v1, altOutUi: v2.outUi, altLabel: v2.routeLabel };
  }
  return v1 ?? v2;
}

function toBase64(bytes: Uint8Array): string {
  return getBase64Decoder().decode(bytes);
}

/** The wallet's signTransaction result may be a transaction object, wire bytes or base64, depending on the library version. */
function signedToBase64(signed: any): string {
  if (typeof signed === 'string') return signed;
  if (signed instanceof Uint8Array) return toBase64(signed);
  if (signed?.messageBytes && signed?.signatures) return getBase64EncodedWireTransaction(signed);
  throw new Error('Unexpected signed transaction format');
}

type Wallet = { signAndSendTransaction: any; signTransaction?: any };

/** Signs and submits the quote on whichever route it came from. Returns the transaction signature. */
export async function submitSwap(quote: Quote, address: string, w: Wallet): Promise<string> {
  if (quote.route !== 'v2') {
    const b64 = await buildSwapTx(quote, address);
    if (!b64) throw new Error('Could not build transaction');
    return String(await w.signAndSendTransaction(decodeTx(b64), BigInt(quote.contextSlot)));
  }

  if (typeof w.signTransaction !== 'function') throw new Error('This wallet connection cannot sign for this route');
  const pay = quote.payToken;
  if (!pay) throw new Error('Missing pay token');
  const { amountRaw, outputMint, outDecimals } = quote.raw;
  // Swap V2 transactions are built per taker, so the quote is refreshed now and compared with what was reviewed.
  const j = await fetchOrder(pay, amountRaw, outputMint, address);
  if (!j?.transaction || !j?.requestId) throw new Error('Route unavailable, try again');
  const fresh = Number(j.outAmount) / Math.pow(10, outDecimals);
  if (fresh < quote.outUi * (1 - MAX_REQUOTE_DROP)) {
    throw new Error(`The price moved: you would now receive ${(100 * (1 - fresh / quote.outUi)).toFixed(1)}% less than reviewed. Review again.`);
  }
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(j.transaction));
  const signed = await w.signTransaction(tx);
  const res = await fetch(`${BASE}/swap/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signedTransaction: signedToBase64(signed), requestId: j.requestId }),
  });
  const out: any = await res.json().catch(() => ({}));
  if (!res.ok || (out?.status && out.status !== 'Success')) {
    throw new Error(out?.error ? String(out.error) : `Swap failed (${out?.status ?? res.status})`);
  }
  if (!out?.signature) throw new Error('Swap did not return a signature');
  return String(out.signature);
}
