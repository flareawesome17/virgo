import { View, Text, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/src/hooks';
import { ArrowRightIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-background">
      <View className="flex-1 px-8 justify-center" style={{ paddingBottom: 60 }}>
        {/* Logo + Wordmark */}
        <View className="items-center mb-10">
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
            style={{ width: 96, height: 96, marginBottom: 12 }}
            resizeMode="contain"
            accessibilityLabel="Virgo"
          />
          <Text className="text-foreground text-[32px] font-extrabold tracking-tight">
            Virgo
          </Text>
          <Text className="text-primary text-sm font-semibold tracking-[3px] uppercase mt-1">
            Private Creative OS
          </Text>
        </View>

        {/* Message */}
        <Text className="text-muted-foreground text-base leading-relaxed text-center mb-10 px-2">
          Organize workspaces, albums, media deliveries, schedules, and collaborators — all in one private space.
        </Text>

        {/* Buttons */}
        <View className="gap-3">
          {/* There was a "Continue with Google" button here. It was wired to
              the email sign-in screen — tapping Google asked for a password,
              which is the kind of thing that makes people think they have the
              wrong app. There is no OAuth client behind it. It comes back when
              it works. */}

          {/* Sign in with email */}
          <Pressable
            onPress={() => router.push('/sign-in')}
            accessibilityRole="button"
            className="min-h-12 bg-secondary rounded-xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.98]"
          >
            <MailIcon size={18} className="text-primary" />
            <Text className="text-foreground text-base font-semibold">Sign in with email</Text>
          </Pressable>

          {/* Create account */}
          <Pressable
            onPress={() => router.push('/sign-up')}
            accessibilityRole="button"
            className="min-h-12 bg-action rounded-xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Text className="text-action-foreground text-base font-bold">Create Account</Text>
            <ArrowRightIcon size={18} className="text-action-foreground" />
          </Pressable>
        </View>

        {/* Terms. Both used to be styled as links and were not tappable — the
            document lives outside (app) precisely so it can be read before
            signing in. */}
        <Text className="text-muted-foreground text-[11px] text-center mt-8 leading-relaxed px-4">
          By continuing, you agree to Virgo’s{' '}
          <Text
            className="text-primary font-semibold"
            onPress={() => router.push('/legal')}
          >
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text
            className="text-primary font-semibold"
            onPress={() => router.push('/legal?tab=privacy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
    </SafeAreaView>
  );
}
