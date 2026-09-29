import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { BookmarkIcon, CheckIcon, GlobeIcon, LockIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { RemoteImage } from '@/components/RemoteImage';
import { useShelfActions, useShelves, useTheme } from '@/src/hooks';
import type { FeedItem } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [BookmarkIcon, CheckIcon, GlobeIcon, LockIcon, PlusIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Keeping somebody's work on a shelf.
 *
 * A shelf is a named group — the grouping is the taste, not the saving. And a
 * note on why you kept it is the part worth reading later; a bare save is a
 * number.
 *
 * What is kept is a pointer, never a copy. The sheet says so, because people
 * are right to wonder what happens to their work when a stranger keeps it.
 */
export function KeepSheet({ item, onClose }: { item: FeedItem | null; onClose: () => void }) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { shelves, isLoading } = useShelves();
  const { keep, createShelf } = useShelfActions();

  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');

  // Each showcase starts fresh: last time's shelf and last time's reason are
  // about the last photograph, not this one.
  useEffect(() => {
    if (item) {
      setChosen(null);
      setNote('');
      setNaming(false);
      setNewName('');
    }
  }, [item?.id]);

  // With the keyboard up the list has less room, and both fields sit at the
  // end of it, so the end is what stays in sight while one is being typed in.
  const list = useRef<ScrollView>(null);
  const typing = useRef(false);
  const typingProps = {
    onFocus: () => {
      typing.current = true;
    },
    onBlur: () => {
      typing.current = false;
    },
  };

  const busy = keep.isPending || createShelf.isPending;

  const addShelf = () => {
    const name = newName.trim();
    if (!name) return;
    createShelf.mutate(
      { name },
      {
        onSuccess: (result) => {
          setNaming(false);
          setNewName('');
          // Select what was just made, so naming a shelf and keeping to it is
          // one gesture rather than two.
          const made = result.data.find((s) => s.name.toLowerCase() === name.toLowerCase());
          if (made) setChosen(made.id);
        },
        onError: (error) =>
          Alert.alert("Couldn't add that shelf", profileActionMessage(error, 'showcase')),
      },
    );
  };

  const confirm = () => {
    if (!item || !chosen) return;
    keep.mutate(
      { shelfId: chosen, showcaseId: item.id, note: note.trim() || undefined },
      {
        onSuccess: onClose,
        onError: (error) =>
          Alert.alert("Couldn't keep it", profileActionMessage(error, 'showcase')),
      },
    );
  };

  return (
    <BottomSheet
      visible={item !== null}
      onClose={() => !busy && onClose()}
      dismissible={!busy}
      surface="background"
    >
      <View className="px-5 pt-2">
        <Text className="text-foreground text-[19px] font-semibold">Keep it on a shelf</Text>
        <Text className="text-muted-foreground text-[12px] leading-[17px] mt-1">
          What you keep is public and always credits{' '}
          {item?.maker?.displayName ?? 'the maker'}. They can take the work down; it is
          never copied out of their hands.
        </Text>
      </View>

      <ScrollView
        ref={list}
        className="mt-3"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 8 }}
        onLayout={() => {
          if (typing.current) list.current?.scrollToEnd({ animated: true });
        }}
      >
        {isLoading ? (
          <View className="py-8 items-center">
            <ActivityIndicator color={palette.primary} />
          </View>
        ) : (
          <View className="px-3">
            {shelves.map((shelf) => {
              const on = chosen === shelf.id;
              return (
                <Pressable
                  key={shelf.id}
                  onPress={() => setChosen(shelf.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className={`min-h-16 flex-row items-center gap-3 rounded-2xl px-2.5 ${on ? 'bg-secondary' : ''}`}
                >
                  {shelf.coverUrl ? (
                    <RemoteImage
                      source={{ uri: shelf.coverUrl }}
                      style={{ width: 46, height: 46, borderRadius: 10 }}
                    />
                  ) : (
                    <View className="w-[46px] h-[46px] rounded-[10px] bg-muted items-center justify-center">
                      <BookmarkIcon size={17} className="text-muted-foreground" />
                    </View>
                  )}
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-[14px] font-bold" numberOfLines={1}>
                      {shelf.name}
                    </Text>
                    <View className="flex-row items-center gap-1.5 mt-0.5">
                      {shelf.isPublic ? (
                        <GlobeIcon size={11} className="text-muted-foreground" />
                      ) : (
                        <LockIcon size={11} className="text-muted-foreground" />
                      )}
                      <Text className="text-muted-foreground text-[11px]">
                        {shelf.count} kept · {shelf.isPublic ? 'Public' : 'Private'}
                      </Text>
                    </View>
                  </View>
                  {on && (
                    <View className="w-6 h-6 rounded-full bg-action items-center justify-center">
                      <CheckIcon size={13} className="text-action-foreground" />
                    </View>
                  )}
                </Pressable>
              );
            })}

            {naming ? (
              <View className="px-2.5 pt-3">
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Name it for what it teaches you"
                  placeholderTextColor={palette.mutedForeground}
                  autoFocus
                  maxLength={60}
                  returnKeyType="done"
                  onSubmitEditing={addShelf}
                  {...typingProps}
                  className="bg-card rounded-xl px-4 min-h-12 text-foreground text-[14px]"
                />
                <View className="flex-row gap-2 mt-2">
                  <Pressable
                    onPress={() => setNaming(false)}
                    accessibilityRole="button"
                    className="min-h-11 px-4 rounded-xl border border-border items-center justify-center"
                  >
                    <Text className="text-foreground text-[13px] font-bold">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={addShelf}
                    disabled={!newName.trim() || createShelf.isPending}
                    accessibilityRole="button"
                    accessibilityState={{ busy: createShelf.isPending }}
                    className="flex-1 min-h-11 rounded-xl bg-action items-center justify-center active:opacity-90"
                    style={{ opacity: !newName.trim() || createShelf.isPending ? 0.5 : 1 }}
                  >
                    <Text className="text-action-foreground text-[13px] font-bold">
                      {createShelf.isPending ? 'Adding…' : 'Add shelf'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setNaming(true)}
                accessibilityRole="button"
                className="min-h-16 flex-row items-center gap-3 rounded-2xl px-2.5"
              >
                <View className="w-[46px] h-[46px] rounded-[10px] bg-muted items-center justify-center">
                  <PlusIcon size={18} className="text-muted-foreground" />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-[14px] font-bold">New shelf</Text>
                  <Text className="text-muted-foreground text-[11px] mt-0.5">
                    Group it with the rest of what you keep
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
        )}

        {chosen && (
          <View className="px-5 pt-3">
            <Text className="text-primary text-[10px] font-bold tracking-[1.5px]">
              WHY THIS ONE
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Optional, and shown on your shelf"
              placeholderTextColor={palette.mutedForeground}
              maxLength={200}
              {...typingProps}
              className="bg-card rounded-xl px-4 min-h-12 mt-2 text-foreground text-[13px]"
            />
          </View>
        )}
      </ScrollView>

      <View className="px-4 pt-3 pb-3 flex-row gap-2.5">
        <Pressable
          onPress={() => !busy && onClose()}
          accessibilityRole="button"
          className="min-h-12 px-5 rounded-xl border border-border items-center justify-center"
        >
          <Text className="text-foreground text-[13px] font-bold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={confirm}
          disabled={!chosen || busy}
          accessibilityRole="button"
          accessibilityState={{ busy: keep.isPending, disabled: !chosen }}
          className="flex-1 min-h-12 rounded-xl bg-action items-center justify-center active:opacity-90"
          style={{ opacity: !chosen || busy ? 0.5 : 1 }}
        >
          <Text className="text-action-foreground text-[13px] font-bold">
            {keep.isPending ? 'Keeping…' : 'Keep it'}
          </Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
