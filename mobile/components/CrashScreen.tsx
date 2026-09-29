import { Pressable, ScrollView, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PALETTES } from '@/theme';

/**
 * What the app shows instead of closing when a screen fails to draw.
 *
 * There was no error boundary above the showcase screen's own, so a render
 * error anywhere else took the whole app down — and a release build says
 * nothing on the way out, so nobody heard about it either.
 *
 * Drawn with plain styles and its own safe-area provider on purpose. The root
 * layout's boundary replaces the layout itself, and with it the theme, the
 * query client and the safe-area context: nothing here may depend on them.
 *
 * The plain sentence comes first. The technical line under it is marked as
 * something to pass on, which is the only use it has — the same trade the
 * showcase screen's boundary makes.
 */
export function CrashScreen({
  error,
  onRetry,
  onHome,
}: {
  error: Error;
  onRetry: () => void;
  /** Leave out where there is no navigator left to go home with. */
  onHome?: () => void;
}) {
  const palette = useColorScheme() === 'dark' ? PALETTES.dark : PALETTES.light;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}
        >
          <Text style={{ color: palette.foreground, fontSize: 17, fontWeight: '700' }}>
            Something went wrong on this screen
          </Text>
          <Text
            style={{ color: palette.mutedForeground, fontSize: 13, lineHeight: 20, marginTop: 8 }}
          >
            {onHome
              ? 'Nothing you saved is lost. Try again, or go back to the start. If it keeps happening, send support the line below.'
              : 'Nothing you saved is lost. Try again, and if it keeps happening, send support the line below.'}
          </Text>

          <View
            style={{ marginTop: 20, borderRadius: 12, backgroundColor: palette.card, padding: 16 }}
          >
            <Text
              style={{ color: palette.primary, fontSize: 10, fontWeight: '700', letterSpacing: 1.5 }}
            >
              WHAT WENT WRONG
            </Text>
            <Text
              selectable
              style={{ color: palette.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 8 }}
            >
              {error?.message || 'No message'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 24 }}>
            <Pressable
              onPress={onRetry}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 44,
                borderRadius: 12,
                backgroundColor: palette.action,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Text style={{ color: palette.actionForeground, fontSize: 13, fontWeight: '700' }}>
                Try again
              </Text>
            </Pressable>
            {onHome && (
              <Pressable
                onPress={onHome}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: palette.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text style={{ color: palette.foreground, fontSize: 13, fontWeight: '700' }}>
                  Go to start
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
