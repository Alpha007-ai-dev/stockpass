# StockPass

**What you really pay to own a stock on-chain.**

A Solana Mobile app that measures the real cost of owning tokenized equities. Everyone shows you the token price. StockPass shows you what it actually costs to buy it, hold it, exit it, and what you can do with it once you own it.

Built for the CLOCK IN hackathon (Radiants / Solana Mobile).

---

## The problem

A tokenized stock looks simple. It is not.

**1. Your wallet lies.** Tokenized equities use the Token-2022 scaled-UI-amount extension. Your wallet shows the raw token count; the real share count is that number multiplied by an on-chain multiplier that changes when dividends are reinvested. Holding 10.56 SPYx is not holding 10.56 shares.

**2. Token prices are not comparable.** Two issuers of the same stock apply different multipliers. Raw prices can look ~41 bps apart when the real per-share difference is ~4 bps. The rest is token scaling, not market disagreement.

**3. Price is not cost.** What you pay is the executable round-trip cost on-chain. In our measurements that ranges from 9 to 90+ bps depending on issuer, stock and time of day — and it is invisible on any price chart.

**4. Sometimes there is no market at all.** Many tokens have no executable quote, especially outside US market hours. A price that cannot be traded is not a price.

---

## What the app does

| Screen | Question it answers |
|---|---|
| **Home** | What should I know right now about what I own? |
| **Markets** | What can I buy, and what does entry cost? |
| **DeFi** | What can I do with what I own? |
| **Wallet** | What exactly do I own? |
| **Passport** | What exactly is this token? |
| **Compare** | Which issuer is currently cheaper? |
| **Buy / Sell** | What will this transaction actually cost me? |
| **Portfolio Analytics** | What does my ownership actually cost me? |

### Signature features

- **Price normalization** — raw token price → per-share price, with the multiplier read live from the chain. The 41 bps → 4 bps moment.
- **Cost to go on-chain** — traditional reference price → market deviation → execution cost → total. Three separate metrics, never conflated.
- **Switching cost** — a cheaper issuer is not automatically better for an existing holder. Exit + re-entry is priced explicitly.
- **DeFi utility** — which of your holdings are accepted as collateral, at what LTV and borrow rate, and which are not accepted at all.
- **Marketability** — LIVE / LIMITED / NO MARKET, derived from executable quote availability, not from a made-up health score.

---

## What we measured

All numbers below come from our own collector, not from documentation.

### Execution cost by issuer (round trip, $1,000 size)

| | Weekday (market open) | Weekend |
|---|---|---|
| xStocks | 22–26 bps | 22–27 bps |
| Ondo | 32–37 bps | 41–53 bps |
| Backpack | 25 bps | 25–30 bps |

Ondo's cost roughly doubles when US markets are closed. xStocks stays flat.

### Normalized price difference between issuers

Typically **0–7 bps** with markets open. Weekend outliers up to 25 bps. The apparent 41 bps gap on SPY was almost entirely token scaling, not price disagreement.

### Switching is almost always loss-making

Every observed issuer switch cost more than it saved: **−13 to −84 bps**. This is why the app shows switching cost explicitly instead of recommending "the cheapest issuer".

### No executable quote is common

Many smaller tokens return no quote at all, especially on weekends. One token (TSMx) showed a 467 bps round trip — not a price, a broken market. The app labels these rather than pretending they are tradable.

### Collateral: same token, different terms

NVDAx is accepted on two Kamino markets at the same time. What a holder pays is the rate of the stablecoin they borrow against it, so the table shows that rate (measured 2026-10-10):

| Market | Max LTV | Borrow asset | Borrow APY |
|---|---|---|---|
| Kamino xStocks Market | 55% | USDC | 5.27% |
| Kamino Sentora xStocks | 62% | PYUSD | 0.74% |

The rates are for **different assets**, so this is not a like-for-like comparison, and the Sentora market is smaller ($0.5M against $2.5M), so its rate may be less settled. Not every token accepted as collateral can itself be borrowed. Ondo tokens are not accepted as collateral in either market.

---

## Architecture

```
Solana Mobile (Seeker)
        │
   React Native / Expo SDK 55
   Expo Router · Solana Kit · Mobile Wallet Adapter
        │
        ├── Jupiter Ultra API ──── measured buy/sell quotes (collector)
        ├── Jupiter Swap v1 + v2 ─ execution; the app picks the better net route
        ├── Solana RPC ─────────── Token-2022 multiplier, supply, holdings
        ├── Kamino public API ──── collateral terms
        └── StockPass Collector ── historical measurements
                │
        Cloudflare Worker + D1
        every 5 minutes, rotating across 120+ tokens
```

The collector is a separate repo: [stockpass-collector](https://github.com/Alpha007-ai-dev/stockpass-collector)

### Issuers tracked

- **xStocks** (Backed Assets JE) — 55 stocks
- **Ondo Global Markets** — 55 stocks
- **Backpack Securities** — 11 stocks

Issuers are discovered by the collector, not hard-coded there. In the app an issuer's colour and label live in a few constants, so adding a fourth issuer means adding those entries.

---

## Running it

```bash
npm install
npx expo run:android
```

Requires a Solana Mobile device or an Android device with a Mobile Wallet Adapter compatible wallet installed.

The app talks to a deployed collector. No API keys are needed on the client — all keys live in the Worker.

### Demo mode

Tap **Explore with a demo portfolio** on Home. This loads four real tokens with real live prices and multipliers, using sample quantities. It is clearly labelled as a demo, and buying and selling are disabled in this mode.

---

## Fee

**Buying carries no StockPass fee.** Jupiter takes its platform fee in the token that is received, which would need a separate fee account for every stock token, so for now buys are free of a StockPass fee.

**Selling** through the standard Jupiter router carries a StockPass fee of **5 bps**, charged on the USDC side. Wallets holding at least 100 SKR pay **2 bps**. On the Swap v2 route there is no StockPass fee, only Jupiter's own. The fee is shown as a separate line in the cost breakdown, never folded into the issuer's execution cost.

The fee is deliberately low. The real differences between issuers are often only a few bps (see the normalized price difference above), so a higher fee would erase the advantage the app is trying to find.

---

## What we deliberately did not do

- **No invented data.** Where a metric cannot be measured, the app shows `—` or "No executable quote" instead of a plausible-looking number.
- **No purchase-relative P&L.** We have no purchase history, so we never claim one. Portfolio change is labelled "since last snapshot".
- **No risk or health scores.** Every number shown is measured or derived from a measurement.
- **No DeFi execution.** The DeFi tab is informational with outbound links. StockPass does not deposit or borrow on your behalf.
- **Supply is not liquidity.** We show token supply as supply, and never imply it means tradability.

---

## Known limitations

- Measurements are taken at a fixed $1,000 size. Larger or smaller trades may differ, though our earlier tests across $100 / $1,000 / $10,000 showed minimal variation.
- The traditional reference feed uses a free IEX-based tier, which does not cover the full US market. Stale or wide quotes are flagged and excluded rather than shown as a premium.
- Market holidays and early closes follow the NYSE calendar through hard-coded rules, checked against nyse.com for 2026 and 2027. Pre-market and after-hours are not modelled on holidays: the whole day counts as closed.
- Each token is measured roughly every 50 minutes, so the app shows recent, not real-time, historical context. Live quotes at the moment of trading come directly from Jupiter.
- **Two routes.** The collector measures costs through Jupiter Ultra; the app executes through the standard Jupiter router and, where it returns more, Jupiter Swap v2 (market makers). On the Swap v2 route there is no StockPass fee, only Jupiter's own. Swap v2 does not report a price impact. On Sell, the app blocks any route that returns far less than the measured price; on Buy, a high price impact on the standard route blocks signing. If no route can fill an amount, the app says so instead of showing a number.

---

## Roadmap

What comes next, in the order we would build it. Nothing below is claimed as shipped.

**Near term**
- **Push cost alerts.** Cost alerts already exist and are checked when the app opens. Push notifications (so the app can bring you back when a token gets cheaper) need a notification service and a new native build.
- **Buy-side fee.** Charge the StockPass fee on buys again, either with a fee account per stock token or as a separate USDC transfer in the same transaction.
- **Real SKR utility.** Today holding 100 SKR lowers the StockPass sell fee from 5 to 2 bps. Next: a holder view with extended history and more alerts.
- **A selectable trade size** instead of the fixed $1,000 measurement size.
- **Plain-language notes on unusual costs.** The Worker already finds measurements outside a token's normal range; the written explanation needs a Claude API key and only ever describes the evidence, never a cause.

**Later**
- **Real-world assets (RWA) beyond stocks.** Tokenized stocks are the first market, not the last. The same measurement (what it costs to get in and out, by market state) applies to any tokenized real-world asset: treasuries, gold, funds. Same collector, new tickers, same cost-first view in the app.
- **More issuers and routes** as they appear on Solana, measured the same way so they stay comparable.
- **An open measurement API**, so other apps can show the cost before the trade.

**Why RWA:** tokenizing an asset is no longer the hard part. Knowing what it costs to hold and exit is, and the longer the collector runs the more history only we have.

---

## Licence

MIT
