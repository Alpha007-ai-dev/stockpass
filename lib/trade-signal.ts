// Set when a swap was just sent, so the tabs re-read the wallet the next time they gain focus.
let lastTradeAt = 0
export function markTrade() {
  lastTradeAt = Date.now()
}
export function tradedSince(t: number) {
  return lastTradeAt > t
}
