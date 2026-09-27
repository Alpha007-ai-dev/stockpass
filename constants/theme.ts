export const T = {
  bg: '#0A0B0A',
  surface: '#141614',
  surfaceAlt: '#1B1E1B',
  border: '#232723',
  borderBright: '#33382F',
  text: '#F2F5F0',
  dim: '#A8ADA4',
  faint: '#7E847B',
  accent: '#B8F23C',
  warn: '#F2B23C',
  down: '#F87171',
  radius: 16,
  gap: 12,
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
  if (bps === null) return { bg: '#181A18', fg: '#6E736C' }
  if (bps <= 15) return { bg: '#16301C', fg: '#5BE585' }
  if (bps <= 30) return { bg: '#33290F', fg: '#F5C451' }
  return { bg: '#3A1B14', fg: '#FB8A5C' }
}

export const num = { fontVariant: ['tabular-nums' as const] }
