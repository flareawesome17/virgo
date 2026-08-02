import { Redirect } from 'expo-router';
import { useAuth } from '@/src/hooks';

/**
 * Decides where a cold start lands.
 *
 * The root Stack previously listed `(auth)` first, so Expo Router mounted the
 * welcome screen immediately and only redirected once the session resolved —
 * an authenticated user saw the sign-in UI flash before the home screen.
 *
 * This route is the entry point instead. It renders nothing while the session
 * is being read, which keeps the splash screen up (the root layout holds it
 * until auth settles), so the first thing drawn is already the right screen.
 */
export default function Index() {
  const { isAuthenticated, isLoading, isSessionError } = useAuth();

  // Splash is still covering the app; drawing anything here is what caused the
  // flash in the first place.
  if (isLoading) return null;

  // An unreachable server is not proof of being signed out. Send those into
  // the app group, whose guard offers a retry rather than a login form.
  if (isSessionError && !isAuthenticated) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Redirect href={isAuthenticated ? '/(app)/(tabs)' : '/(auth)/welcome'} />;
}
