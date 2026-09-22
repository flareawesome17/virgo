import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useCollaboratorAlbums,
  useDeleteCollaborator,
  useSetCollaboratorAlbums,
  useTheme,
  useUpdateCollaborator,
  useWorkspace,
  useWorkspaceMembers,
} from '@/src/hooks';
import type { CollaboratorRole, MediaAccess } from '@/src/api';
import {
  ACCESS_HINT,
  ACCESS_LABEL,
  ACCESS_LEVELS,
  INVITE_ROLES,
  ROLE_LABEL,
  firstName,
  plural,
} from '@/src/lib/workspaces';
import { LoadFailed } from '@/components/LoadFailed';
import { ChoiceSheet, PersonAvatar } from '@/components/WorkspaceBits';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** No grant, then the levels. */
type Level = MediaAccess | 'none';

/**
 * One member of your workspace: their role, what they can do in each album,
 * and what albums you add later give them.
 *
 * Save waits for the albums to load. The sheet on Network that did this
 * before let Save go first — and a selection is the whole list, so an early
 * tap removed every album the person had.
 */
export default function MemberAccessScreen() {
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const insets = useSafeAreaInsets();

  const { data: workspace } = useWorkspace(id);
  const { members, isLoading: loadingMembers } = useWorkspaceMembers(id);
  const member = members.find((m) => m.id === memberId && m.status === 'accepted');
  const albumsQuery = useCollaboratorAlbums(memberId ?? null);
  const albums = albumsQuery.albums;

  const updateRole = useUpdateCollaborator();
  const saveAlbums = useSetCollaboratorAlbums();
  const remove = useDeleteCollaborator();

  // What they have today is where every choice starts: derived, so it is right
  // from the render the data arrives, and only copied once something changes.
  const current: Record<string, Level> = {};
  for (const album of albums) current[album.id] = album.shared ? (album.media_access ?? 'view') : 'none';
  const [picked, setPicked] = useState<Record<string, Level> | null>(null);
  const levels = picked ?? current;
  const [role, setRole] = useState<CollaboratorRole | null>(null);
  const [later, setLater] = useState<Level | null>(null);
  const [choosing, setChoosing] = useState<{ albumId: string | null } | null>(null);

  if (loadingMembers) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!member) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">
        <Header />
        <View className="flex-1 items-center justify-center px-10 gap-2 pb-24">
          <Text className="text-foreground text-lg font-bold text-center">Not in this workspace any more</Text>
          <Text className="text-muted-foreground text-sm text-center">
            They may have left, or been removed.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const name = firstName(member.name);
  const currentRole = member.role;
  const currentLater: Level = member.access?.new_albums ?? 'none';
  const roleNow = role ?? currentRole;
  const laterNow = later ?? currentLater;
  const albumsChanged = picked !== null && albums.some((a) => (picked[a.id] ?? 'none') !== current[a.id]);
  const dirty = albumsChanged || roleNow !== currentRole || laterNow !== currentLater;
  const saving = updateRole.isPending || saveAlbums.isPending;
  const ready = albumsQuery.isSuccess && dirty && !saving;

  const save = async () => {
    try {
      if (roleNow !== currentRole) await updateRole.mutateAsync({ id: member.id!, role: roleNow });
      if (albumsChanged || laterNow !== currentLater) {
        await saveAlbums.mutateAsync({
          id: member.id!,
          albums: albums
            .filter((a) => levels[a.id] && levels[a.id] !== 'none')
            .map((a) => ({ album_id: a.id, media_access: levels[a.id] as MediaAccess })),
          newAlbumAccess: laterNow === 'none' ? null : laterNow,
        });
      }
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const confirmRemove = () =>
    Alert.alert(
      `Remove ${name} from ${workspace?.name ?? 'this workspace'}?`,
      `${name} loses access to this workspace and all of its albums. Anything ${name} uploaded stays in your albums, and ${name} stays in your friends.`,
      [
        { text: `Keep ${name}`, style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            remove.mutate(member.id!, {
              onSuccess: () => router.back(),
              onError: (err: Error) => Alert.alert('Could not remove', err.message),
            }),
        },
      ],
    );

  const levelOptions = (includeNone: string) => [
    { value: 'none' as Level, label: includeNone },
    ...ACCESS_LEVELS.map((level) => ({
      value: level as Level,
      label: ACCESS_LABEL[level],
      description: ACCESS_HINT[level],
    })),
  ];

  const choosingAlbum = choosing?.albumId ? albums.find((a) => a.id === choosing.albumId) : null;
  const since = member.responded_at
    ? new Date(member.responded_at).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
    : null;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <Header />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-3 px-1">
          <PersonAvatar name={member.name} url={member.avatar_url} size={52} />
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[22px] font-bold" numberOfLines={1}>
              {member.name}
            </Text>
            <Text className="text-muted-foreground text-[13px] mt-0.5" numberOfLines={1}>
              {workspace ? `In ${workspace.name}` : 'In this workspace'}
              {since ? ` since ${since}` : ''}
            </Text>
          </View>
        </View>

        <View className="gap-2">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Role</Text>
          <View className="flex-row flex-wrap gap-2">
            {INVITE_ROLES.map((r) => {
              const on = r === roleNow;
              return (
                <Pressable
                  key={r}
                  onPress={() => setRole(r)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  className={`h-9 px-3.5 rounded-full justify-center ${on ? 'bg-foreground' : 'bg-card border border-border'}`}
                >
                  <Text className={`text-[13px] ${on ? 'text-background font-bold' : 'text-foreground font-medium'}`}>
                    {ROLE_LABEL[r]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-muted-foreground text-xs mx-1">
            A role is a label. What {name} can do is set album by album below.
          </Text>
        </View>

        <View className="gap-2">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">
            What {name} can do in each album
          </Text>
          <View className="bg-card rounded-2xl border border-border/40 overflow-hidden">
            {albumsQuery.isLoading ? (
              <ActivityIndicator className="py-8" />
            ) : albumsQuery.loadFailed && !albumsQuery.isSuccess ? (
              <LoadFailed what="the albums" onRetry={() => albumsQuery.refetch()} compact />
            ) : albums.length === 0 ? (
              <Text className="text-muted-foreground text-sm p-4">
                No albums yet. Choose below what {name} gets when you add one.
              </Text>
            ) : (
              albums.map((album, i) => {
                const value = levels[album.id] ?? 'none';
                return (
                  <Pressable
                    key={album.id}
                    onPress={() => setChoosing({ albumId: album.id })}
                    accessibilityRole="button"
                    accessibilityLabel={`${album.name}: ${value === 'none' ? 'can’t see' : ACCESS_LABEL[value]}`}
                    className="flex-row items-center gap-2.5 px-3.5 py-3 active:opacity-70"
                    style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : undefined}
                  >
                    <View className="flex-1 min-w-0">
                      <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                        {album.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">{plural(album.item_count, 'file')}</Text>
                    </View>
                    <Text className={`text-[13px] font-semibold ${value === 'none' ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {value === 'none' ? 'Can’t see' : ACCESS_LABEL[value]}
                    </Text>
                    <ChevronDownIcon size={16} className="text-muted-foreground" />
                  </Pressable>
                );
              })
            )}
          </View>
        </View>

        <Pressable
          onPress={() => setChoosing({ albumId: null })}
          accessibilityRole="button"
          className="flex-row items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-secondary active:opacity-80"
        >
          <View className="flex-1">
            <Text className="text-foreground text-[13px] font-semibold">Albums you add later</Text>
            <Text className="text-muted-foreground text-xs mt-0.5">
              {laterNow === 'none' ? `Stay private until you share them with ${name}` : `Shared with ${name} straight away`}
            </Text>
          </View>
          <Text className="text-foreground text-[13px] font-semibold">
            {laterNow === 'none' ? 'Don’t share' : ACCESS_LABEL[laterNow]}
          </Text>
          <ChevronDownIcon size={16} className="text-muted-foreground" />
        </Pressable>

        <Pressable
          onPress={save}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          className={`h-[50px] rounded-2xl items-center justify-center flex-row gap-2 ${ready ? 'bg-action' : 'bg-muted'}`}
        >
          {saving && <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>
            {saving ? 'Saving…' : 'Save'}
          </Text>
        </Pressable>

        <Pressable
          onPress={confirmRemove}
          disabled={remove.isPending}
          accessibilityRole="button"
          className="h-[46px] rounded-2xl bg-destructive/10 flex-row items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Trash2Icon size={16} className="text-destructive" />
          <Text className="text-destructive text-sm font-bold">Remove from workspace</Text>
        </Pressable>
      </ScrollView>

      <ChoiceSheet<Level>
        visible={!!choosing}
        title={
          choosingAlbum
            ? `What ${name} can do in ${choosingAlbum.name}`
            : `Albums you add later`
        }
        hint={choosingAlbum ? undefined : `What ${name} gets in each album you make from now on.`}
        options={levelOptions(choosingAlbum ? 'Can’t see it' : 'Don’t share')}
        value={choosingAlbum ? (levels[choosingAlbum.id] ?? 'none') : laterNow}
        onChoose={(value) => {
          if (choosingAlbum) setPicked({ ...levels, [choosingAlbum.id]: value });
          else setLater(value);
        }}
        onClose={() => setChoosing(null)}
      />
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View className="px-2 pt-1">
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
        className="w-11 h-11 items-center justify-center active:opacity-60"
      >
        <ArrowLeftIcon size={20} className="text-foreground" />
      </Pressable>
    </View>
  );
}
