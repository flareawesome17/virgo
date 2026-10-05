import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ApiError,
  retentionInput,
  retentionOf,
  retentionReady,
  retentionSummary,
  sameRetention,
  type Album,
  type Retention,
} from '@/src/api';
import { useAlbum, useAuth, useUpdateAlbum } from '@/src/hooks';
import { DetailFallback } from '@/components/DetailFallback';
import { RetentionPicker } from '@/components/RetentionPicker';
import { ScreenHeader } from '@/components/ScreenHeader';

/**
 * How long an album keeps its files, changed after it was made.
 *
 * It could only be set once, on the create screen, from a short list. An
 * album delivered in March whose contract says "until 30 June" had no way to
 * say so, then or later.
 *
 * A screen rather than a sheet: the calendar is tall, and the field for a
 * number of days brings up a keyboard a sheet would sit behind.
 */
export default function AlbumRetentionScreen() {
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const album = useAlbum(albumId);

  if (!album.data) {
    return (
      <DetailFallback
        title="Keep the files"
        what="this album"
        gone="It was deleted, or it is no longer shared with you."
        error={album.error}
        failed={album.isError || album.isPaused}
        onRetry={() => void album.refetch()}
      />
    );
  }

  // Keyed by album, so what is picked starts from the album's own setting.
  return <RetentionEditor key={album.data.id} album={album.data} />;
}

function RetentionEditor({ album }: { album: Album }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const update = useUpdateAlbum();
  const current = retentionOf(album);
  const [retention, setRetention] = useState<Retention>(current);

  const isOwner = !!user && album.user_id === user.id;
  const changed = !sameRetention(current, retention);
  const ready = isOwner && changed && retentionReady(retention) && !update.isPending;

  const save = () =>
    update.mutate(
      { id: album.id, ...retentionInput(retention) },
      {
        onSuccess: () => router.back(),
        onError: (error) =>
          Alert.alert(
            "Couldn't save it",
            error instanceof ApiError && error.message ? error.message : 'Please try again.',
          ),
      },
    );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <ScreenHeader title="Keep the files" subtitle={album.name} />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32, gap: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View className="rounded-2xl bg-muted px-4 py-3">
            <Text className="text-muted-foreground text-[12px] font-bold uppercase tracking-[1.5px]">Now</Text>
            <Text className="text-foreground text-[15px] leading-6 mt-1">{retentionSummary(current)}</Text>
          </View>

          {isOwner ? (
            <RetentionPicker value={retention} onChange={setRetention} />
          ) : (
            <Text className="text-muted-foreground text-[14px] leading-6">
              Only the album’s owner can change this.
            </Text>
          )}

          {isOwner && retention.mode !== 'forever' && (
            <Text className="text-muted-foreground text-[13px] leading-5">
              Anything already past it is removed in the next overnight clean-up, and you’ll get a
              note saying how many files went. Removed files can’t be brought back.
            </Text>
          )}

          {isOwner && (
            <Pressable
              onPress={save}
              disabled={!ready}
              accessibilityRole="button"
              accessibilityState={{ disabled: !ready, busy: update.isPending }}
              className="rounded-2xl min-h-[52px] items-center justify-center bg-action active:opacity-85"
              style={{ opacity: ready ? 1 : 0.45 }}
            >
              {update.isPending ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-action-foreground text-[15px] font-bold">
                  {changed ? 'Save' : 'No changes'}
                </Text>
              )}
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
