import Svg, { Circle, Line, Path, Rect } from 'react-native-svg'
import { T } from '@/constants/theme'

type P = { size?: number; color?: string }

export function DividendIcon({ size = 22, color = T.accent }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <Path d="M14.5 9.2c-.5-.9-1.4-1.4-2.5-1.4-1.5 0-2.6.8-2.6 2 0 2.6 5.2 1.3 5.2 4 0 1.3-1.2 2.2-2.7 2.2-1.2 0-2.2-.5-2.7-1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Line x1="12" y1="6" x2="12" y2="18" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}

export function EarningsIcon({ size = 22, color = T.accent }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="4" y="13" width="3.6" height="7" rx="1" stroke={color} strokeWidth="1.6" />
      <Rect x="10.2" y="8" width="3.6" height="12" rx="1" stroke={color} strokeWidth="1.6" />
      <Rect x="16.4" y="4" width="3.6" height="16" rx="1" stroke={color} strokeWidth="1.6" />
    </Svg>
  )
}

export function SplitIcon({ size = 22, color = T.accent }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 19 L19 5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M5 5 L19 19" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Path d="M14.5 5 H19 V9.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M14.5 19 H19 V14.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function WatchIcon({ size = 22, color = T.accent }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="7" cy="14.5" r="4" stroke={color} strokeWidth="1.6" />
      <Circle cx="17" cy="14.5" r="4" stroke={color} strokeWidth="1.6" />
      <Path d="M7 10.5 L9.5 4.5 M17 10.5 L14.5 4.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Line x1="11" y1="14.5" x2="13" y2="14.5" stroke={color} strokeWidth="1.6" />
    </Svg>
  )
}

export function CalendarIcon({ size = 20, color = T.faint }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="5.5" width="17" height="15" rx="2.5" stroke={color} strokeWidth="1.6" />
      <Line x1="3.5" y1="10" x2="20.5" y2="10" stroke={color} strokeWidth="1.6" />
      <Line x1="8" y1="3" x2="8" y2="7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <Line x1="16" y1="3" x2="16" y2="7" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  )
}

export function ClockIcon({ size = 20, color = T.faint }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.6" />
      <Path d="M12 7.5 V12 L15 14" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  )
}

export function eventIcon(kind: string, size = 22, color = T.accent) {
  if (kind === 'dividend') return <DividendIcon size={size} color={color} />
  if (kind === 'earnings') return <EarningsIcon size={size} color={color} />
  if (kind === 'split') return <SplitIcon size={size} color={color} />
  return <WatchIcon size={size} color={color} />
}
