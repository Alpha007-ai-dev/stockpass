export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

export type Issuer = 'xStocks' | 'Ondo'
export type StockToken = { issuer: Issuer; symbol: string; mint: string; decimals: number }
export type Stock = { ticker: string; name: string; tokens: [StockToken, StockToken] }

export const STOCKS: Stock[] = [
  { ticker: 'SPY', name: 'S&P 500 ETF', tokens: [
    { issuer: 'xStocks', symbol: 'SPYx', mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', decimals: 8 },
    { issuer: 'Ondo', symbol: 'SPYon', mint: 'k18WJUULWheRkSpSquYGdNNmtuE2Vbw1hpuUi92ondo', decimals: 9 } ] },
  { ticker: 'QQQ', name: 'Nasdaq-100 ETF', tokens: [
    { issuer: 'xStocks', symbol: 'QQQx', mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ', decimals: 8 },
    { issuer: 'Ondo', symbol: 'QQQon', mint: 'HrYNm6jTQ71LoFphjVKBTdAE4uja7WsmLG8VxB8ondo', decimals: 9 } ] },
  { ticker: 'NVDA', name: 'NVIDIA', tokens: [
    { issuer: 'xStocks', symbol: 'NVDAx', mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', decimals: 8 },
    { issuer: 'Ondo', symbol: 'NVDAon', mint: 'gEGtLTPNQ7jcg25zTetkbmF7teoDLcrfTnQfmn2ondo', decimals: 9 } ] },
  { ticker: 'TSLA', name: 'Tesla', tokens: [
    { issuer: 'xStocks', symbol: 'TSLAx', mint: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', decimals: 8 },
    { issuer: 'Ondo', symbol: 'TSLAon', mint: 'KeGv7bsfR4MheC1CkmnAVceoApjrkvBhHYjWb67ondo', decimals: 9 } ] },
  { ticker: 'AAPL', name: 'Apple', tokens: [
    { issuer: 'xStocks', symbol: 'AAPLx', mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', decimals: 8 },
    { issuer: 'Ondo', symbol: 'AAPLon', mint: '123mYEnRLM2LLYsJW3K6oyYh8uP1fngj732iG638ondo', decimals: 9 } ] },
]
