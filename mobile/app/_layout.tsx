import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth, useOffline } from '../src/hooks';
import '@/global.css';
import { useEffect, type ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClient, persistOptions } from '@/src/lib/queryClient'
import { ThemeProvider } from '@/src/providers/ThemeProvider'


/**
 * `index` resolves the session and redirects, so it must be the first route.
 * With `(auth)` first, the sign-in screen mounted on every cold start and only
 * gave way once auth resolved — the flash this replaces.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

// Held until the session is known, so nothing is drawn before the destination
// is decided. Failures are ignored: if the splash cannot be held, the app
// should still start.
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayoutNav() {
  // Initialize offline monitoring
  useOffline();

  const { isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) SplashScreen.hideAsync().catch(() => {});
  }, [isLoading]);

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
      </Stack>
    </>
  );
}

const isDesigner = process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE === 'designer';

function QueryProvider({ children }: { children: ReactNode }) {
  if (isDesigner) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  )
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryProvider>
          <RootLayoutNav />
        </QueryProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
