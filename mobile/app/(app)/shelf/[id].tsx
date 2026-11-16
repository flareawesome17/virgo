import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { BookmarkIcon, EllipsisIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { KeptGrid } from '@/components/KeptGrid';
import { LoadFailed } from '@/components/LoadFailed';
import { NameSheet } from '@/components/NameSheet';
import { ShelfBar, ShelfHeading } from '@/components/shelves/ShelfHeading';
import { ShelfMenuSheet } from '@/components/shelves/ShelfMenuSheet';
import { useShelfActions, useShelfEntries, useShelves, useTheme } from '@/src/hooks';
import { ApiError } from '@/src/api';
import { profileActionMessage } from '@/src/lib/profile-media';
import { PALETTES } from '@/theme';

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

for (const Icon of [BookmarkIcon, EllipsisIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * One shelf, as a grid of what is on it (see KeptGrid).
 *
 * Every kept thing opens to its post with whoever made it at the top — that
 * credit is the reason keeping somebody's work is something they benefit from
 * rather than something done to them. The keeper's note sits above it.
 *
 * Your own shelf can be renamed, made private or public, and deleted from here,
 * and anything on it removed from its post. The API had all of that from the
 * start; the phone could only ever add.
 *
 * The bar says only "Shelf". The shelf's name is the heading under it, with
 * how much is kept, who sees it and whose it is; on the grid it scrolls away
 * with the first row.
 */
export default function ShelfScreen() {
  const { id, own, name, by } = useLocalSearchParams<{
    id?: string;
    own?: string;
    name?: string;
    /** Whose shelf it is, when it is somebody else's and the opener knew. */
    by?: string;
  }>();
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
    // In words for the person holding the phone, not the server's.
    updateShelf.mutateAsync({ id, name: next.trim() }).catch((e: unknown) =>
      Alert.alert("Couldn't rename it", profileActionMessage(e, 'shelf')),
    );
  };

  const togglePrivacy = () => {
    if (!id || !shelf) return;
    updateShelf.mutateAsync({ id, isPublic: !shelf.isPublic }).catch((e: unknown) =>
      Alert.alert("Couldn't change who sees it", profileActionMessage(e, 'setting')),
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
              (e: unknown) => Alert.alert("Couldn't delete it", profileActionMessage(e, 'shelf')),
            );
          },
        },
      ],
    );
  };

  // Asked about, and its failure said, by the post sheet it is offered from.
  const remove = (showcaseId: string) => {
    if (!id) return Promise.resolve();
    return unkeep.mutateAsync({ shelfId: id, showcaseId });
  };

  const loaded = !isLoading && !loadFailed;
  const count = entries.length > 0 ? entries.length : loaded ? 0 : (shelf?.count ?? 0);
  // Somebody else's shelf is public or it would not have loaded; until it
  // has, nothing is claimed about it.
  const isPublic = mine ? shelf?.isPublic : loaded ? true : undefined;
  const heading = (
    <ShelfHeading
      name={title}
      isPublic={isPublic}
      meta={[
        count > 0 ? `${count} kept` : null,
        isPublic === undefined ? null : isPublic ? 'Public' : 'Private',
        mine ? (shelf ? 'by you' : null) : by ? `by ${by}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
    />
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ShelfBar
        title="Shelf"
        right={
          shelf ? (
            <Pressable
              onPress={() => setMenuOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Shelf options"
              className="w-11 h-11 items-center justify-center active:opacity-60"
            >
              <EllipsisIcon size={22} className="text-foreground" />
            </Pressable>
          ) : null
        }
      />
      {/* On the grid it is the list's header, and scrolls with it. */}
      {entries.length === 0 ? heading : null}

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={palette.primary} />
        </View>
      ) : loadFailed && entries.length === 0 && isGone(error) ? (
        // Deleted, or made private since the link was shared. Not a
        // connection problem, and a Retry could only fail again.
        <View className="items-center px-10 mt-12">
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
        <View className="items-center px-10 mt-12">
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
        <KeptGrid
          entries={entries}
          header={heading}
          onRemove={shelf ? remove : undefined}
          onRefresh={() => refetch()}
          // Yours says so, and calls the note yours; anybody else's keeps the
          // post's own title.
          postTitle={mine ? 'From your shelf' : undefined}
          noteLabel={mine ? 'Why you kept it' : 'Why it was kept'}
        />
      )}

      <ShelfMenuSheet
        visible={menuOpen}
        name={title}
        isPublic={shelf?.isPublic ?? true}
        count={shelf?.count ?? entries.length}
        onClose={() => setMenuOpen(false)}
        onRename={() => setRenaming(true)}
        onTogglePrivacy={togglePrivacy}
        onDelete={confirmDelete}
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
