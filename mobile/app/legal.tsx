import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';
import { CONTACT_EMAIL, LAST_UPDATED, PRIVACY, TERMS } from '@/src/lib/legal-content';

for (const Icon of [ArrowLeftIcon, MailIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Terms and privacy, in one place.
 *
 * Two tabs rather than two screens: people arriving from either link usually
 * want to glance at both, and a policy that requires going back a screen to
 * read its other half gets read half as often.
 *
 * The text lives in src/lib/legal-content.ts, shared byte for byte with the
 * web app. This screen only lays it out.
 */
export default function LegalScreen() {
  const { isDark } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<'terms' | 'privacy'>(
    tab === 'privacy' ? 'privacy' : 'terms',
  );

  const clauses = active === 'terms' ? TERMS : PRIVACY;
  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as const;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={4}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Legal
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Last updated {LAST_UPDATED}
            </Text>
          </View>
        </View>

        <View className="px-5 mt-4">
          <View className="flex-row bg-muted rounded-2xl p-1">
            {(['terms', 'privacy'] as const).map((key) => {
              const on = active === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setActive(key)}
                  className={`flex-1 py-2.5 rounded-xl items-center active:scale-[0.97] ${on ? 'bg-card' : ''}`}
                  style={on ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : undefined}
                >
                  <Text
                    className={`text-sm font-bold ${on ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {key === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-5 mt-5 gap-5">
          {clauses.map((clause) => (
            <View key={clause.heading}>
              <Text className="text-foreground text-base font-bold mb-2">
                {clause.heading}
              </Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 gap-3" style={cardShadow}>
                {clause.body.map((paragraph, i) => (
                  <Text
                    key={i}
                    className="text-muted-foreground text-sm leading-6"
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View className="px-5 mt-6">
          <Pressable
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
            style={cardShadow}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#B66A4014', alignItems: 'center', justifyContent: 'center' }}>
              <MailIcon size={15} color="#B66A40" />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                Questions about this?
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {CONTACT_EMAIL}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text
          className="text-muted-foreground text-[11px] px-6 mt-5 leading-5"
          style={{ opacity: isDark ? 0.7 : 0.8 }}
        >
          By continuing to use Virgo you accept these terms.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
