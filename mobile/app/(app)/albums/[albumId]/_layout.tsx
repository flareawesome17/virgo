import { Stack } from 'expo-router';

export default function AlbumMediaLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="gallery" />
      <Stack.Screen name="viewer" />
      <Stack.Screen name="videos" />
      <Stack.Screen name="audio" />
      <Stack.Screen name="invite/index" />
      <Stack.Screen name="invite/list" />
      <Stack.Screen name="invite/select" />
      <Stack.Screen name="invite/send" />
    </Stack>
  );
}
