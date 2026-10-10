/** Kamino's borrow page, optionally filtered to markets that accept the given token (mint) as collateral. */
export function kaminoBorrowUrl(collateralMint?: string): string {
  if (!collateralMint) return 'https://kamino.com/borrow'
  return `https://kamino.com/borrow?collateralFilter=${encodeURIComponent(collateralMint)}&filterWalletAssets=false&featuredFilter=false`
}
