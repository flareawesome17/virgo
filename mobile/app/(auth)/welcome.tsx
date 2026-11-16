import { View, Text, Image } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/src/hooks';
import { AuthButton, AuthFooter, AuthFrame } from '@/components/auth/AuthFrame';

/** What Virgo is for, in three plain lines. No icons: the words carry it. */
const REASONS = [
  { title: 'Deliver the work', line: 'Albums your clients open with a link' },
  { title: 'Find the next job', line: 'A board of shoots that need your role' },
  { title: 'Know what you earned', line: 'Fees, expenses and what to set aside' },
] as const;

export default function WelcomeScreen() {
  const { user } = useAuth();

  // Declarative redirect, not router.replace(). Calling replace() here ran a
  // navigation side effect during render, which updates the navigation
  // container while React is rendering this component — the "Cannot update a
  // component while rendering a different component" error. <Redirect> defers
  // the navigation until after the commit.
  if (process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE !== 'designer' && user) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <AuthFrame
      footer={
        <AuthFooter>
          {/* There was a "Continue with Google" button here. It was wired to
              the email sign-in screen — tapping Google asked for a password,
              which is the kind of thing that makes people think they have the
              wrong app. There is no OAuth client behind it. It comes back when
              it works. */}
          <AuthButton label="Sign up with email" onPress={() => router.push('/sign-up')} />
          <AuthButton label="Sign in" quiet onPress={() => router.push('/sign-in')} />

          {/* Terms. Both used to be styled as links and were not tappable — the
              document lives outside (app) precisely so it can be read before
              signing in. */}
          <Text className="text-muted-foreground text-[12px] leading-4 text-center mt-1">
            By continuing you agree to the{' '}
            <Text className="text-primary font-semibold" onPress={() => router.push('/legal')}>
              Terms
            </Text>{' '}
            and the{' '}
            <Text className="text-primary font-semibold" onPress={() => router.push('/legal?tab=privacy')}>
              Privacy Policy
            </Text>
            .
          </Text>
        </AuthFooter>
      }
    >
      {/* A little more room than a form gets: there is no bar above this one,
          and it is the first thing anybody sees. */}
      <View className="px-1 pt-[22px] gap-6">
        <View className="flex-row items-center gap-3">
          {/*
            The real mark, not a letter in a box.

            This was a "V" set in the app's own font on an orange tile — a
            stand-in from before the logo existed, and the first thing anybody
            sees. Shown bare rather than inside a tile, which is what the web
            sign-in already does: the mark carries its own colour and a
            container behind it only competes with it.
          */}
          <Image
            source={require('@/assets/splash-icon.png')}
            style={{ width: 48, height: 48 }}
            resizeMode="contain"
            accessibilityLabel="Virgo"
          />
          <Text className="text-foreground text-[24px] leading-[30px] font-bold tracking-[-0.5px]">Virgo</Text>
        </View>

        <View className="gap-2.5">
          <Text
            accessibilityRole="header"
            className="text-foreground text-[32px] leading-[38px] font-bold tracking-[-1px]"
          >
            Your shoots, your clients, your money. One place.
          </Text>
          <Text className="text-muted-foreground text-[15px] leading-[22px]">
            Made for photographers and videographers in the Philippines.
          </Text>
        </View>

        <View className="border-y border-border/60">
          {REASONS.map((reason, i) => (
            <View key={reason.title} className={`py-3.5 gap-0.5 ${i > 0 ? 'border-t border-border/60' : ''}`}>
              <Text className="text-foreground text-[15px] leading-5 font-semibold">{reason.title}</Text>
              <Text className="text-muted-foreground text-[13px] leading-[18px]">{reason.line}</Text>
            </View>
          ))}
        </View>
      </View>
    </AuthFrame>
  );
}
