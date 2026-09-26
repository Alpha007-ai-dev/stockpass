export type IssuerInfo = {
  legalName: string
  backing: string
  dividends: string
  redemption: string
  eligibility: string
  standard: string
}

export const ISSUERS: Record<string, IssuerInfo> = {
  xStocks: {
    legalName: 'Backed Assets (JE) Limited, Jersey',
    backing: '1:1 underlying shares, per issuer',
    dividends: 'Reinvested via on-chain multiplier',
    redemption: 'Through the issuer, qualified investors',
    eligibility: 'Not available in the US, Canada and other restricted regions',
    standard: 'Token-2022, Scaled UI Amount',
  },
  Ondo: {
    legalName: 'Ondo Global Markets (BVI) Limited',
    backing: '1:1 securities held at US broker-dealers',
    dividends: 'Reinvested after withholding tax (total return)',
    redemption: 'Mint and redeem through Ondo, eligible users',
    eligibility: 'Eligible non-US users only',
    standard: 'Token-2022, Scaled UI Amount',
  },
}
