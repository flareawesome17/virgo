import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { CheckIcon, PlayIcon, XIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { RemoteImage } from '@/components/RemoteImage';
import { LoadFailed } from '@/components/LoadFailed';
import { kindOf, useShowcaseActions, useTheme } from '@/src/hooks';
import { clock } from '@/src/lib/media-grid';
import { MAX_CRAFT_TAGS, MAX_SHOWCASE_ITEMS, storageApi } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [CheckIcon, PlayIcon, XIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** A profile photo is never a piece of work; the server refuses them too. */
const PROFILE_PICTURE_KEY = /^users\/[^/]+\/(avatars|covers)\//;

/** Offered rather than typed: most craft facts are one of a handful. */
const TAG_SUGGESTIONS = [
  '24mm', '35mm', '50mm', '85mm', '135mm',
  'f/1.4', 'f/2', 'f/2.8', 'f/8',
  'Natural light', 'Backlight', 'Golden hour', 'Blue hour', 'Flash', 'One light',
];

/**
 * Posting a showcase.
 *
 * The craft note has its own place rather than being folded into the caption,
 * because it is the thing the feed exists for: a caption says what this is, and
 * the note says what somebody else could do with it.
 */
export default function NewShowcaseScreen() {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { create } = useShowcaseActions();

  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [craftNote, setCraftNote] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [allowComments, setAllowComments] = useState(true);

  const files = useQuery({
    queryKey: ['storage', 'files', 'showcase-picker'],
    queryFn: () => storageApi.listFiles({ limit: 200 }),
  });

  /**
   * What can go in: photographs, and films that have a poster frame.
   *
   * A film's poster is written by the media worker a minute or so after the
   * upload, and the server refuses a film without one — there would be nothing
   * for a feed to draw. Leaving those out of the grid is the same rule stated
   * before it is broken rather than after, which is the difference between
   * "not there yet" and a refusal on the Post button.
   */
  const available = useMemo(
    () =>
      (files.data?.data ?? []).filter((f) => {
        if (PROFILE_PICTURE_KEY.test(f.key)) return false;
        const kind = kindOf(f.contentType);
        if (kind === 'image') return Boolean(f.url);
        return kind === 'video' && Boolean(f.posterUrl);
      }),
    [files.data],
  );

  const toggle = (key: string) =>
    setPicked((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : current.length >= MAX_SHOWCASE_ITEMS
          ? current
          : [...current, key],
    );

  const toggleTag = (tag: string) =>
    setTags((current) =>
      current.includes(tag)
        ? current.filter((t) => t !== tag)
        : current.length >= MAX_CRAFT_TAGS
          ? current
          : [...current, tag],
    );

  const post = () => {
    if (picked.length === 0) return;
    create.mutate(
      {
        fileKeys: picked,
        title: title.trim() || undefined,
        caption: caption.trim() || undefined,
        craftNote: craftNote.trim() || undefined,
        craftTags: tags.length > 0 ? tags : undefined,
        allowComments,
        publish: true,
      },
      {
        onSuccess: () => router.replace('/feed'),
        onError: (error) =>
          Alert.alert("Couldn't post that", profileActionMessage(error, 'showcase')),
      },
    );
  };

  const full = picked.length >= MAX_SHOWCASE_ITEMS;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center border-b border-border pl-1 pr-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="w-11 h-11 items-center justify-center"
        >
          <XIcon size={20} className="text-foreground" />
        </Pressable>
        <Text className="flex-1 text-center text-foreground text-[15px] font-bold">
          New showcase
        </Text>
        <Pressable
          onPress={post}
          disabled={picked.length === 0 || create.isPending}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ busy: create.isPending, disabled: picked.length === 0 }}
          className="min-h-11 px-3 items-center justify-center"
          style={{ opacity: picked.length === 0 || create.isPending ? 0.4 : 1 }}
        >
          <Text className="text-primary text-[14px] font-bold">
            {create.isPending ? 'Posting…' : 'Post'}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-4">
            <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
              THE WORK
            </Text>
            <Text className="text-muted-foreground text-[11px] mt-1">
              {picked.length}/{MAX_SHOWCASE_ITEMS} chosen
              {picked.length > 0 ? ' · the first one is the cover' : ''}
            </Text>
          </View>

          {files.isLoading ? (
            <View className="py-10 items-center">
              <ActivityIndicator color={palette.primary} />
            </View>
          ) : files.isError || files.isPaused ? (
            <View className="px-5 pt-3">
              <LoadFailed what="your work" onRetry={() => files.refetch()} compact />
            </View>
          ) : available.length === 0 ? (
            <View className="px-8 pt-8 items-center gap-4">
              <Text className="text-muted-foreground text-[13px] text-center leading-5">
                Your photographs and films live in albums, and there are none here yet.
                Upload some first and they will show up here.
              </Text>
              <Pressable
                onPress={() => router.push('/albums/upload')}
                accessibilityRole="button"
                className="min-h-11 bg-action rounded-xl px-5 items-center justify-center"
              >
                <Text className="text-action-foreground text-[13px] font-bold">
                  Upload
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              {full && (
                <Text className="text-warning text-[12px] px-5 pt-2">
                  That is all {MAX_SHOWCASE_ITEMS}. Deselect one to swap it.
                </Text>
              )}
              <View className="flex-row flex-wrap gap-1.5 px-5 pt-3">
                {available.map((file) => {
                  const at = picked.indexOf(file.key);
                  const on = at >= 0;
                  const film = kindOf(file.contentType) === 'video';
                  return (
                    <Pressable
                      key={file.key}
                      onPress={() => toggle(file.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={
                        on
                          ? `Chosen, number ${at + 1}. Remove.`
                          : film
                            ? 'Choose this film'
                            : 'Choose this photograph'
                      }
                      style={{
                        width: '31.8%',
                        aspectRatio: 1,
                        borderRadius: 10,
                        overflow: 'hidden',
                        borderWidth: 2,
                        borderColor: on ? palette.primary : 'transparent',
                      }}
                    >
                      <RemoteImage
                        source={{ uri: (film ? file.posterUrl : file.url) as string }}
                        style={{ flex: 1 }}
                      />
                      {film && (
                        <>
                          <View className="absolute inset-0 items-center justify-center">
                            <View className="w-9 h-9 rounded-full bg-foreground/50 items-center justify-center">
                              <PlayIcon size={15} color="#fff" fill="#fff" />
                            </View>
                          </View>
                          {file.durationMs ? (
                            <View className="absolute right-1.5 bottom-1.5 rounded-full bg-foreground/55 px-1.5 py-0.5">
                              <Text className="text-background text-[9px] font-bold">
                                {clock(file.durationMs / 1000)}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      )}
                      {on && (
                        <View className="absolute right-1.5 top-1.5 w-6 h-6 rounded-full bg-action items-center justify-center">
                          <Text className="text-action-foreground text-[11px] font-bold">
                            {at + 1}
                          </Text>
                        </View>
                      )}
                      {at === 0 && (
                        <View className="absolute left-1.5 bottom-1.5 rounded-full bg-action px-2 py-0.5">
                          <Text className="text-action-foreground text-[9px] font-bold">
                            Cover
                          </Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <View className="px-5 pt-6">
            <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">TITLE</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Ten minutes before the rain"
              placeholderTextColor={palette.mutedForeground}
              maxLength={120}
              className="bg-card rounded-xl px-4 min-h-12 mt-2 text-foreground text-[14px] font-semibold"
            />

            <Text className="text-primary text-[10px] font-bold tracking-[1.5px] mt-5">
              CAPTION
            </Text>
            <TextInput
              value={caption}
              onChangeText={setCaption}
              placeholder="Where it was, who it was for"
              placeholderTextColor={palette.mutedForeground}
              multiline
              maxLength={2200}
              className="bg-card rounded-xl px-4 py-3 min-h-20 mt-2 text-foreground text-[13px] leading-5"
              style={{ textAlignVertical: 'top' }}
            />
          </View>

          {/* The field the whole feed is for. */}
          <View className="mx-5 mt-6 rounded-2xl border border-primary/40 bg-primary/5 p-4">
            <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
              HOW IT WAS MADE
            </Text>
            <Text className="text-muted-foreground text-[11px] leading-4 mt-1.5">
              One thing another photographer could use. This is what turns a scroll into
              something worth keeping.
            </Text>
            <TextInput
              value={craftNote}
              onChangeText={setCraftNote}
              placeholder="Backlit into the storm front so the rain read as light, not weather."
              placeholderTextColor={palette.mutedForeground}
              multiline
              maxLength={600}
              className="bg-card rounded-xl px-4 py-3 min-h-20 mt-3 text-foreground text-[13px] leading-5"
              style={{ textAlignVertical: 'top' }}
            />

            <View className="flex-row flex-wrap gap-1.5 mt-3">
              {TAG_SUGGESTIONS.map((tag) => {
                const on = tags.includes(tag);
                return (
                  <Pressable
                    key={tag}
                    onPress={() => toggleTag(tag)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    className={`min-h-9 px-3 rounded-full items-center justify-center flex-row gap-1.5 ${on ? 'bg-action' : 'bg-card border border-border'}`}
                  >
                    {on && <CheckIcon size={11} className="text-action-foreground" />}
                    <Text
                      className={`text-[11px] font-semibold ${on ? 'text-action-foreground' : 'text-secondary-foreground'}`}
                    >
                      {tag}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text className="text-muted-foreground text-[10px] leading-[15px] mt-3">
              Typed by you, never read off the file — what your camera recorded about where
              you were stays private.
            </Text>
          </View>

          {/* allow_comments has been a column since showcases shipped with
              nothing able to set it. This is the switch it was describing. */}
          <View className="mx-5 mt-5 mb-2 rounded-2xl border border-border overflow-hidden">
            <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5">
              <View className="flex-1">
                <Text className="text-foreground text-[13.5px] font-semibold">Comments</Text>
                <Text className="text-muted-foreground text-[11px] leading-4 mt-0.5">
                  You can turn them off later. Nothing said is deleted — it stops being
                  shown, and comes back if you turn them on again.
                </Text>
              </View>
              <Switch
                value={allowComments}
                onValueChange={setAllowComments}
                accessibilityLabel="Allow comments on this showcase"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
