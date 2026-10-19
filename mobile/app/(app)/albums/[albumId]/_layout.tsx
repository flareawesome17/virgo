import { Stack } from 'expo-router';

export default function AlbumMediaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      {/* Fades in and out rather than sliding in from the side: a photo
          opened from the grid is the same photo, larger, not a new page — and
          dragged down to close, the photo leaves downwards on its own, which
          a sideways slide of the whole screen then contradicted. */}
      <Stack.Screen name="viewer" options={{ animation: 'fade' }} />
      <Stack.Screen name="videos" />
      <Stack.Screen name="audio" />
    </Stack>
  );
}
