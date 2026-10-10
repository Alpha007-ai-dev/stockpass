import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { T } from '@/constants/theme'

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: T.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="passport" />
        <Stack.Screen name="compare" />
        <Stack.Screen name="buy" />
        <Stack.Screen name="sell" />
        <Stack.Screen name="analytics" />
      </Stack>
      <StatusBar style="light" />
    </AppProviders>
  )
}
