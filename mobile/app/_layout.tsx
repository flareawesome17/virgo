import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuth, useOffline } from "../src/hooks";
import "@/global.css";
import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryClient, persistOptions } from "@/src/lib/queryClient";
import { ThemeProvider } from "@/src/providers/ThemeProvider";
import { wireQueryFocusToAppState } from "@/src/lib/query-focus";
import { wireOtaUpdates } from "@/src/lib/ota-updates";
import { UploadProvider } from "@/src/providers/UploadProvider";

/**
 * `index` resolves the session and redirects, so it must be the first route.
 * With `(auth)` first, the sign-in screen mounted on every cold start and only
 * gave way once auth resolved — the flash this replaces.
 */
export const unstable_settings = {
  initialRouteName: "index",
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

  // Here rather than in QueryProvider: this is about the app's own code being
  // current, not about its data. A no-op in Expo Go and development builds,
  // where the bundle comes from Metro.
  useEffect(() => wireOtaUpdates(), []);

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

const isDesigner = process.env.EXPO_PUBLIC_RAPIDNATIVE_MODE === "designer";

function QueryProvider({ children }: { children: ReactNode }) {
  // Once, app-wide. Without it `refetchOnWindowFocus` is inert on a phone —
  // there is no window, so React Query never hears about coming back to the
  // app and the screen keeps whatever it had when you locked it.
  useEffect(() => wireQueryFocusToAppState(), []);

  if (isDesigner) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryProvider>
            {/* Inside QueryProvider, because the queue invalidates album and
                usage queries as files land — and above the navigator, so an
                upload started on one screen is not owned by it. */}
            <UploadProvider>
              <RootLayoutNav />
            </UploadProvider>
          </QueryProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
