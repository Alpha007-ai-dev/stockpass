export const T = {
  bg: '#0A0B0A',
  surface: '#141614',
  surfaceAlt: '#1B1E1B',
  border: '#1F231F',
  borderBright: '#2C312C',
  text: '#F2F5F0',
  dim: '#B4B9B0',
  faint: '#8C928A',
  accent: '#B8F23C',
  warn: '#F2B23C',
  down: '#F87171',
  radius: 18,
  gap: 12,
}

// 12 / 14 / 16 / 20 / 28 skála
export const F = {
  micro: 12,
  small: 14,
  body: 16,
  title: 20,
  hero: 28,
}

export const ISSUER_COLOR: Record<string, string> = {
  xStocks: '#4ADE80',
  Ondo: '#38BDF8',
  Backpack: '#A78BFA',
}

export function issuerColor(issuer?: string): string {
  return (issuer && ISSUER_COLOR[issuer]) || T.dim
}

export function costTint(bps: number | null): { bg: string; fg: string } {
  if (bps === null) return { bg: '#181A18', fg: '#7A8078' }
  if (bps <= 15) return { bg: '#16301C', fg: '#6BEF92' }
  if (bps <= 30) return { bg: '#33290F', fg: '#F5C451' }
  return { bg: '#3A1B14', fg: '#FB8A5C' }
}

export const num = { fontVariant: ['tabular-nums' as const] }
