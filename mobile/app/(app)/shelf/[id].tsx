import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeftIcon, BookmarkIcon, EllipsisIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { LoadFailed } from '@/components/LoadFailed';
import { RemoteImage } from '@/components/RemoteImage';
import { NameSheet } from '@/components/NameSheet';
import { ActionSheet } from '@/components/WorkspaceBits';
import { useShelfActions, useShelfEntries, useShelves, useTheme } from '@/src/hooks';
import { ApiError, makerOf } from '@/src/api';
import { PALETTES } from '@/theme';

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

for (const Icon of [ArrowLeftIcon, BookmarkIcon, EllipsisIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * One shelf.
 *
 * Every kept thing names whoever made it and links to their showcase — that
 * credit is the reason keeping somebody's work is something they benefit from
 * rather than something done to them. The note underneath is the keeper's own.
 *
 * Your own shelf can be renamed, made private or public, and deleted from here,
 * and anything on it removed. The API had all of that from the start; the phone
 * could only ever add.
 */
export default function ShelfScreen() {
  const { id, own, name } = useLocalSearchParams<{ id?: string; own?: string; name?: string }>();
  const mine = own !== '0';
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  // Somebody else's shelf reads through the public route, which returns the
  // public ones only. Defaults to your own, which is where most of these open
  // from.
  const { entries, isLoading, loadFailed, error, refetch } = useShelfEntries(id, {
    own: mine,
  });
  // Your shelves are usually cached already (the Taste tab lists them), and
  // this is what keeps the name and privacy current after a change here.
  const { shelves } = useShelves({ enabled: mine });
  const shelf = mine ? shelves.find((s) => s.id === id) : undefined;
  const title = shelf?.name ?? name ?? 'Shelf';
  const { updateShelf, removeShelf, unkeep } = useShelfActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  // mutateAsync throughout: per-call callbacks are dropped if the screen has
  // gone by the time the answer lands, and a failure would vanish with them.
  const rename = (next: string) => {
    setRenaming(false);
    if (!id || next.trim() === shelf?.name) return;
    updateShelf.mutateAsync({ id, name: next.trim() }).catch((e: Error) =>
      Alert.alert('Could not rename it', e.message),
    );
  };

  const togglePrivacy = () => {
    if (!id || !shelf) return;
    updateShelf.mutateAsync({ id, isPublic: !shelf.isPublic }).catch((e: Error) =>
      Alert.alert('Could not change who sees it', e.message),
    );
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert(
      `Delete “${title}”?`,
      'The shelf goes, and so does everything you kept on it. Nobody’s work is touched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeShelf.mutateAsync(id).then(
              () => router.back(),
              (e: Error) => Alert.alert('Could not delete it', e.message),
            );
          },
        },
      ],
    );
  };

  const remove = (showcaseId: string, what: string) => {
    if (!id) return;
    Alert.alert(`Remove ${what} from this shelf?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          unkeep.mutateAsync({ shelfId: id, showcaseId }).catch((e: Error) =>
            Alert.alert('Could not remove it', e.message),
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <View className="flex-row items-center pl-1 pr-3 border-b border-border">
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          className="w-11 h-11 items-center justify-center"
        >
          <ArrowLeftIcon size={20} className="text-foreground" />
        </Pressable>
        <View className="flex-1 min-w-0">
          <Text className="text-foreground text-[15px] font-bold" numberOfLines={1}>
            {title}
          </Text>
          {shelf && !shelf.isPublic ? (
            <Text className="text-muted-foreground text-[11px]">Private · only you see it</Text>
          ) : null}
        </View>
        {shelf ? (
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Shelf options"
            className="w-11 h-11 items-center justify-center"
          >
            <EllipsisIcon size={20} className="text-foreground" />
          </Pressable>
        ) : null}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && entries.length === 0 && isGone(error) ? (
        // Deleted, or made private since the link was shared. Not a
        // connection problem, and a Retry could only fail again.
        <View className="items-center px-10 mt-20">
          <Text className="text-foreground text-[15px] font-bold text-center">
            This shelf is no longer available
          </Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">
            Whoever made it deleted it or made it private.
          </Text>
        </View>
      ) : loadFailed && entries.length === 0 ? (
        <LoadFailed what="this shelf" onRetry={() => refetch()} />
      ) : entries.length === 0 ? (
        <View className="items-center px-10 mt-20">
          <View className="w-16 h-16 rounded-full bg-primary/10 items-center justify-center mb-4">
            <BookmarkIcon size={24} className="text-primary" />
          </View>
          <Text className="text-foreground text-[15px] font-bold">Nothing on this shelf</Text>
          <Text className="text-muted-foreground text-[13px] text-center mt-2 leading-5">
            Work kept here shows up with whoever made it. If they take a piece down, it
            leaves the shelf.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60, gap: 22 }}>
          {entries.map((entry) => (
            <View key={entry.showcaseId}>
              <Pressable
                onPress={() => router.push(`/showcase/${entry.showcaseId}`)}
                accessibilityRole="button"
                accessibilityLabel={entry.title ?? 'Open this showcase'}
              >
                <RemoteImage
                  source={{ uri: entry.url }}
                  style={{ width: '100%', height: 200, borderRadius: 13 }}
                  contentFit="cover"
                />
              </Pressable>

              <View className="flex-row items-center gap-2 mt-2">
                <View className="w-6 h-6 rounded-full bg-primary/15 items-center justify-center">
                  <Text className="text-primary text-[10px] font-bold">
                    {makerOf(entry).displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Pressable
                  onPress={() =>
                    makerOf(entry).handle ? router.push(`/u/${makerOf(entry).handle}`) : undefined
                  }
                  accessibilityRole="button"
                  className="flex-1 min-w-0"
                >
                  <Text className="text-foreground text-[12px] font-bold" numberOfLines={1}>
                    {makerOf(entry).displayName}
                  </Text>
                </Pressable>
                {entry.craftTags.length > 0 && (
                  <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                    {entry.craftTags.slice(0, 2).join(' · ')}
                  </Text>
                )}
                {shelf ? (
                  <Pressable
                    onPress={() => remove(entry.showcaseId, entry.title ? `“${entry.title}”` : 'this')}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${entry.title ?? 'this'} from the shelf`}
                  >
                    <Text className="text-muted-foreground text-[11px] font-semibold">Remove</Text>
                  </Pressable>
                ) : null}
              </View>

              {entry.note ? (
                <View className="mt-1.5 pl-2.5 border-l-2 border-border">
                  <Text className="text-secondary-foreground text-[12px] leading-[17px] italic">
                    {entry.note}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}

      <ActionSheet
        visible={menuOpen}
        title={title}
        onClose={() => setMenuOpen(false)}
        actions={[
          { label: 'Rename', onPress: () => setRenaming(true) },
          {
            label: shelf?.isPublic ? 'Make private' : 'Make public',
            onPress: togglePrivacy,
          },
          { label: 'Delete shelf', destructive: true, onPress: confirmDelete },
        ]}
      />

      <NameSheet
        // A fresh sheet per opening, so the field starts from the current name.
        key={renaming ? `open:${shelf?.name ?? ''}` : 'closed'}
        visible={renaming}
        initial={shelf?.name ?? ''}
        title="Rename shelf"
        label="Shelf name"
        onCancel={() => setRenaming(false)}
        onSave={rename}
      />
    </SafeAreaView>
  );
}
