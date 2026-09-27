import { Tabs } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Text } from 'react-native'
import 'react-native-reanimated'
import { AppProviders } from '@/components/app-providers'
import { T } from '@/constants/theme'

export default function RootLayout() {
  return (
    <AppProviders>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: T.bg, borderTopColor: T.border },
          tabBarActiveTintColor: T.accent,
          tabBarInactiveTintColor: T.faint,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⌂</Text> }}
        />
        <Tabs.Screen
          name="index"
          options={{ title: 'Markets', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>▤</Text> }}
        />
        <Tabs.Screen
          name="wallet"
          options={{ title: 'Wallet', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◈</Text> }}
        />
        <Tabs.Screen name="passport" options={{ href: null }} />
        <Tabs.Screen name="buy" options={{ href: null }} />
        <Tabs.Screen name="compare" options={{ href: null }} />
      </Tabs>
      <StatusBar style="light" />
    </AppProviders>
  )
}


