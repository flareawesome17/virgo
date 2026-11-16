import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { CheckIcon, GlobeIcon, LockIcon, PlusIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { BottomSheet } from '@/components/BottomSheet';
import { FormInput } from '@/components/Form';
import { LoadFailed } from '@/components/LoadFailed';
import { NewShelfForm } from '@/components/shelves/NewShelfForm';
import { Radio, SheetButton } from '@/components/shelves/ShelfBits';
import { ShelfMosaic, shelfCoverUrls } from '@/components/shelves/ShelfMosaic';
import { useShelfActions, useShelves, useTheme } from '@/src/hooks';
import type { FeedItem } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

for (const Icon of [CheckIcon, GlobeIcon, LockIcon, PlusIcon]) {
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
 *
 * It also takes things off again. The shelves come back saying which already
 * hold this showcase; those say "Kept here", and tapping one asks, then
 * removes it, as does Take it off beside the title. Before, a kept post
 * offered "Change where" and could only be kept somewhere else.
 *
 * And it moves them. Choosing another shelf for something already kept offers
 * Move here — kept there, taken off where it was — beside keeping it on both,
 * which was the only thing a second shelf could do before.
 *
 * A new shelf is made in the sheet, in place of the list, and comes back
 * chosen: naming a shelf and keeping to it is one errand.
 */
export function KeepSheet({
  item,
  onClose,
  onKept,
}: {
  item: FeedItem | null;
  onClose: () => void;
  /** Where it went, so the next Keep can go there in one tap. */
  onKept?: (shelf: { id: string; name: string }) => void;
}) {
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { shelves, isLoading, loadFailed, refetch } = useShelves({
    holding: item?.id,
    enabled: item !== null,
  });
  const { keep, unkeep, createShelf } = useShelfActions();
  const keptOn = shelves.filter((shelf) => shelf.holds);
  const kept = keptOn.length > 0;

  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [naming, setNaming] = useState(false);
  // Keeping to the new shelf and taking it off the old ones are separate
  // requests, with a moment between them when neither is pending. So is
  // taking it off several shelves at once.
  const [moving, setMoving] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Each showcase starts fresh: last time's shelf and last time's reason are
  // about the last photograph, not this one.
  useEffect(() => {
    if (item) {
      setChosen(null);
      setNote('');
      setNaming(false);
      setMoving(false);
      setClearing(false);
    }
  }, [item?.id]);

  // With the keyboard up the list has less room, and the note sits at the
  // end of it, so the end is what stays in sight while it is being typed in.
  const list = useRef<ScrollView>(null);
  const typing = useRef(false);

  const busy = keep.isPending || createShelf.isPending || unkeep.isPending || moving || clearing;
  /** Somewhere new chosen for something already kept: it can move there. */
  const canMove = kept && chosen !== null && !keptOn.some((s) => s.id === chosen);

  const takeOff = (shelfId: string, name: string) => {
    if (!item) return;
    Alert.alert(`Take it off ${name}?`, 'It stays in the feed and on their profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Take off',
        style: 'destructive',
        onPress: () =>
          unkeep.mutate(
            // Still "Kept" on the card if another shelf has it too.
            { shelfId, showcaseId: item.id, stillKept: keptOn.length > 1 },
            {
              onError: (error) =>
                Alert.alert("Couldn't take it off", profileActionMessage(error, 'keep')),
            },
          ),
      },
    ]);
  };

  /** Take it off, beside the title: the one shelf it is on, or all of them. */
  const takeOffAll = () => {
    if (!item || !kept) return;
    if (keptOn.length === 1) {
      takeOff(keptOn[0].id, keptOn[0].name);
      return;
    }
    const on = keptOn;
    Alert.alert(
      'Take it off your shelves?',
      `It is on ${on.map((shelf) => shelf.name).join(', ')}. It stays in the feed and on their profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take off',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            try {
              for (const [i, shelf] of on.entries()) {
                await unkeep.mutateAsync({
                  shelfId: shelf.id,
                  showcaseId: item.id,
                  // Only the last one off makes the card say it is not kept.
                  stillKept: i < on.length - 1,
                });
              }
            } catch (error) {
              Alert.alert("Couldn't take it off", profileActionMessage(error, 'keep'));
            } finally {
              setClearing(false);
            }
          },
        },
      ],
    );
  };

  const addShelf = ({ name, isPublic }: { name: string; isPublic: boolean }) => {
    createShelf.mutate(
      { name, isPublic },
      {
        onSuccess: (result) => {
          setNaming(false);
          // Select what was just made, so naming a shelf and keeping to it is
          // one gesture rather than two.
          const made = result.data.find((s) => s.name.toLowerCase() === name.toLowerCase());
          if (made) setChosen(made.id);
        },
        onError: (error) =>
          Alert.alert("Couldn't add that shelf", profileActionMessage(error, 'shelf')),
      },
    );
  };

  const confirm = () => {
    if (!item || !chosen) return;
    const shelf = shelves.find((s) => s.id === chosen);
    keep.mutate(
      {
        shelfId: chosen,
        showcaseId: item.id,
        note: note.trim() || undefined,
        alreadyKept: kept,
      },
      {
        onSuccess: () => {
          if (shelf) onKept?.({ id: shelf.id, name: shelf.name });
          onClose();
        },
        onError: (error) =>
          Alert.alert("Couldn't keep it", profileActionMessage(error, 'keep')),
      },
    );
  };

  const move = async () => {
    if (!item || !chosen) return;
    const shelf = shelves.find((s) => s.id === chosen);
    setMoving(true);
    try {
      // Onto the new shelf first: a failure part-way leaves it kept twice,
      // which is fixable from here, rather than kept nowhere.
      await keep.mutateAsync({
        shelfId: chosen,
        showcaseId: item.id,
        note: note.trim() || undefined,
        alreadyKept: true,
      });
      for (const old of keptOn) {
        await unkeep.mutateAsync({ shelfId: old.id, showcaseId: item.id, stillKept: true });
      }
      if (shelf) onKept?.({ id: shelf.id, name: shelf.name });
      onClose();
    } catch (error) {
      Alert.alert("Couldn't move it", profileActionMessage(error, 'keep'));
    } finally {
      setMoving(false);
    }
  };

  return (
    <BottomSheet visible={item !== null} onClose={() => !busy && onClose()} dismissible={!busy}>
      {naming ? (
        <NewShelfForm
          onCancel={() => setNaming(false)}
          onSubmit={addShelf}
          pending={createShelf.isPending}
        />
      ) : (
        <>
          <View className="px-5">
            <View className="min-h-8 flex-row items-center justify-between">
              <Text
                accessibilityRole="header"
                className="text-foreground text-[18px] leading-[26px] font-bold"
              >
                {/* Known to be kept before the shelves say where. */}
                {kept || (isLoading && item?.keptByMe) ? 'Kept' : 'Keep it on a shelf'}
              </Text>
              {kept ? (
                <Pressable
                  onPress={takeOffAll}
                  disabled={busy}
                  hitSlop={12}
                  accessibilityRole="button"
                  className="active:opacity-60"
                  style={{ opacity: busy ? 0.5 : 1 }}
                >
                  <Text className="text-destructive text-[15px] font-semibold">Take it off</Text>
                </Pressable>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-[13px] leading-[18px] mt-1">
              {keptOn.length === 1
                ? `It is on ${keptOn[0].name}. Choose another shelf to move it, or keep it on both.`
                : kept
                  ? `It is on ${keptOn.map((shelf) => shelf.name).join(', ')}. Choose another shelf to move it there, or tap one it is on to take it off.`
                  : `What you keep always credits ${item?.maker?.displayName ?? 'the maker'}. They can take the work down; it is never copied out of their hands.`}
            </Text>
          </View>

          <ScrollView
            ref={list}
            className="mt-3.5"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20 }}
            onLayout={() => {
              if (typing.current) list.current?.scrollToEnd({ animated: true });
            }}
          >
            {isLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={palette.primary} />
              </View>
            ) : loadFailed && shelves.length === 0 ? (
              // Not "no shelves": that offered only New shelf, and a second
              // shelf of the same name is how a failed load turned into clutter.
              <LoadFailed what="your shelves" onRetry={() => refetch()} compact />
            ) : (
              <View className="rounded-[20px] border border-border/40 bg-card overflow-hidden">
                {shelves.map((shelf, index) => {
                  const on = chosen === shelf.id;
                  const holds = Boolean(shelf.holds);
                  return (
                    <Pressable
                      key={shelf.id}
                      onPress={() => (holds ? takeOff(shelf.id, shelf.name) : setChosen(shelf.id))}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on || holds }}
                      accessibilityHint={holds ? 'Kept here. Double tap to take it off.' : undefined}
                      className={`min-h-[68px] flex-row items-center gap-3 pl-2.5 pr-4 py-2 active:opacity-70 ${
                        index === 0 ? '' : 'border-t border-border/40'
                      }`}
                    >
                      <ShelfMosaic urls={shelfCoverUrls(shelf)} size={48} radius={12} />
                      <View className="flex-1 min-w-0">
                        <Text
                          className="text-foreground text-[15px] leading-5 font-semibold"
                          numberOfLines={1}
                        >
                          {shelf.name}
                        </Text>
                        <View className="flex-row items-center gap-[5px]">
                          {shelf.isPublic ? (
                            <GlobeIcon size={12} className="text-muted-foreground" />
                          ) : (
                            <LockIcon size={12} className="text-muted-foreground" />
                          )}
                          <Text className="text-muted-foreground text-[13px] leading-[18px]">
                            {shelf.count} kept · {shelf.isPublic ? 'Public' : 'Private'}
                          </Text>
                        </View>
                      </View>
                      {holds ? (
                        <View className="flex-row items-center gap-1">
                          <CheckIcon size={14} strokeWidth={2.5} className="text-success" />
                          <Text className="text-success text-[13px] leading-[18px] font-semibold">
                            Kept here
                          </Text>
                        </View>
                      ) : (
                        <Radio on={on} />
                      )}
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => setNaming(true)}
                  disabled={busy}
                  accessibilityRole="button"
                  className={`min-h-[60px] flex-row items-center gap-3 pl-2.5 pr-4 py-1.5 active:opacity-70 ${
                    shelves.length === 0 ? '' : 'border-t border-border/40'
                  }`}
                >
                  <View className="w-12 h-12 rounded-xl bg-muted items-center justify-center">
                    <PlusIcon size={20} className="text-foreground" />
                  </View>
                  <Text className="text-foreground text-[15px] leading-5 font-semibold">
                    New shelf
                  </Text>
                </Pressable>
              </View>
            )}

            {chosen && (
              <View className="pt-4 gap-2">
                <Text className="text-foreground text-[15px] leading-5 font-semibold">
                  Why this one{' '}
                  <Text className="text-muted-foreground font-normal">
                    optional, shown on your shelf
                  </Text>
                </Text>
                <FormInput
                  value={note}
                  onChangeText={setNote}
                  maxLength={200}
                  accessibilityLabel="Why this one. Optional, and shown on your shelf"
                  onFocus={() => {
                    typing.current = true;
                  }}
                  onBlur={() => {
                    typing.current = false;
                  }}
                />
              </View>
            )}
          </ScrollView>

          <View className="px-5 pt-5 pb-3 flex-row gap-2">
            {kept ? (
              <>
                <SheetButton
                  // "Both" is two; a third shelf is another.
                  label={keptOn.length === 1 ? 'Keep on both' : 'Keep here too'}
                  onPress={confirm}
                  disabled={!canMove || busy}
                  busy={keep.isPending && !moving}
                  accessibilityHint="Keeps it on this shelf as well as where it is now"
                />
                <SheetButton
                  label={moving ? 'Moving…' : 'Move here'}
                  onPress={() => void move()}
                  filled
                  disabled={!canMove || busy}
                  busy={moving}
                />
              </>
            ) : (
              <SheetButton
                label={keep.isPending ? 'Keeping…' : 'Keep it'}
                onPress={confirm}
                filled
                disabled={!chosen || busy}
                busy={keep.isPending}
              />
            )}
          </View>
        </>
      )}
    </BottomSheet>
  );
}
