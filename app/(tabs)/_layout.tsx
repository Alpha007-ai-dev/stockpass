import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { T } from '@/constants/theme'

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: T.bg, borderTopColor: T.border },
        tabBarActiveTintColor: T.accent,
        tabBarInactiveTintColor: T.faint,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⌂</Text> }} />
      <Tabs.Screen name="index" options={{ title: 'Markets', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>▤</Text> }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet', tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>◈</Text> }} />
    </Tabs>
  )
}
