import { Pressable, StyleSheet, Text, View } from 'react-native'
import { T } from '@/constants/theme'

export function ErrorState({ message, onRetry }: { message?: string | null; onRetry?: () => void }) {
  const offline = !message || /network|fetch|timeout|failed|connect/i.test(message)

  return (
    <View style={s.card}>
      <Text style={s.title}>{offline ? "Can't reach StockPass" : 'Something went wrong'}</Text>
      <Text style={s.body}>
        {offline ? 'Check your connection and try again. Measurements keep running in the background.' : message}
      </Text>
      {onRetry && (
        <Pressable style={s.button} onPress={onRetry}>
          <Text style={s.buttonText}>Try again</Text>
        </Pressable>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  card: { backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, borderRadius: 16, padding: 18, gap: 8 },
  title: { color: T.text, fontSize: 16, fontWeight: '700' },
  body: { color: T.faint, fontSize: 14, lineHeight: 20 },
  button: {
    borderWidth: 1,
    borderColor: T.borderBright,
    borderRadius: 12,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonText: { color: T.text, fontSize: 15, fontWeight: '600' },
})
