import { useCallback, useRef } from 'react'
import { useFocusEffect } from 'expo-router'

/** Tabs stay mounted, so a scrolled screen would keep its position. Scroll back to the top when the tab is left. */
export function useScrollReset() {
  const ref = useRef<{ scrollTo: (o: { x?: number; y?: number; animated?: boolean }) => void } | null>(null)
  useFocusEffect(useCallback(() => () => { ref.current?.scrollTo({ y: 0, animated: false }) }, []))
  return ref
}
