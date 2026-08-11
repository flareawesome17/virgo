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
          <View
            className="w-20 h-20 rounded-[22px] bg-primary items-center justify-center mb-5"
            style={{
              shadowColor: '#B66A40',
              shadowOpacity: 0.3,
              shadowRadius: 20,
              shadowOffset: { width: 0, height: 6 },
              elevation: 8,
            }}
          >
            <Text className="text-white text-3xl font-extrabold tracking-tight">V</Text>
          </View>
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
            className="bg-card rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <MailIcon size={18} className="text-primary" />
            <Text className="text-foreground text-base font-semibold">Sign in with email</Text>
          </Pressable>

          {/* Create account */}
          <Pressable
            onPress={() => router.push('/sign-up')}
            className="bg-primary rounded-2xl py-4 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{
              shadowColor: '#B66A40',
              shadowOpacity: 0.3,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Text className="text-white text-base font-bold">Create Account</Text>
            <ArrowRightIcon size={18} className="text-white" />
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
