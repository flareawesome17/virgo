import {
  View,
  Text,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArchiveIcon, ArrowLeftIcon, CheckIcon, ChevronDownIcon, Trash2Icon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAlbums, useDeleteWorkspace, useTheme, useUpdateWorkspace, useWorkspace } from '@/src/hooks';
import { ACCENT_COLORS, deleteConsequence } from '@/src/lib/workspaces';
import { RemoteImage } from '@/components/RemoteImage';
import { ChoiceSheet } from '@/components/WorkspaceBits';
import { PALETTES } from '@/theme';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ArchiveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/** The cover choice for "no album chosen". */
const NEWEST = 'newest';

/**
 * Everything about a workspace that is its owner's to change: its name,
 * description, colour and cover; archiving it; deleting it.
 *
 * The colour could only be chosen when the workspace was made, and there was
 * no way to rename one on the phone at all.
 */
export default function EditWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const insets = useSafeAreaInsets();
  const { data: workspace, isLoading } = useWorkspace(id);
  const { albums } = useAlbums({ workspace_id: id, orderBy: 'created_at', direction: 'desc', limit: 100 }, { enabled: !!id });
  const update = useUpdateWorkspace();
  const remove = useDeleteWorkspace();

  // Null until edited: the workspace's own values show until then, so the
  // form is right from the render the workspace arrives.
  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [choosingCover, setChoosingCover] = useState(false);

  if (isLoading || !workspace) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background items-center justify-center">
        {isLoading ? (
          <ActivityIndicator />
        ) : (
          <Text className="text-muted-foreground text-sm">This workspace isn’t available.</Text>
        )}
      </SafeAreaView>
    );
  }

  const nameNow = name ?? workspace.name;
  const descriptionNow = description ?? workspace.description ?? '';
  const colorNow = color ?? workspace.accent_color;
  const coverNow = cover ?? workspace.cover_album_id ?? NEWEST;
  const withCovers = albums.filter((a) => a.cover_url);
  const coverUrl =
    coverNow === NEWEST ? withCovers[0]?.cover_url : albums.find((a) => a.id === coverNow)?.cover_url;
  const coverLabel =
    coverNow === NEWEST ? 'The newest album’s' : `From ${albums.find((a) => a.id === coverNow)?.name ?? 'an album'}`;
  const dirty =
    nameNow.trim() !== workspace.name ||
    descriptionNow.trim() !== (workspace.description ?? '') ||
    colorNow !== workspace.accent_color ||
    coverNow !== (workspace.cover_album_id ?? NEWEST);
  const ready = dirty && nameNow.trim().length > 0 && !update.isPending;
  const archived = !!workspace.archived_at;

  const save = () =>
    update.mutate(
      {
        id: workspace.id,
        name: nameNow.trim(),
        description: descriptionNow.trim() || null,
        accent_color: colorNow,
        cover_album_id: coverNow === NEWEST ? null : coverNow,
      },
      {
        onSuccess: () => router.back(),
        onError: (err: Error) => Alert.alert('Could not save', err.message),
      },
    );

  const toggleArchive = () =>
    update.mutate(
      { id: workspace.id, archived: !archived },
      {
        onSuccess: () => {
          if (!archived) {
            Alert.alert(
              `${workspace.name} is archived`,
              'Find it under Archived at the bottom of your workspaces. Albums and sharing are as they were.',
            );
            router.replace('/(app)/(tabs)/workspaces');
          }
        },
        onError: (err: Error) => Alert.alert('Could not change that', err.message),
      },
    );

  const confirmDelete = () =>
    Alert.alert(`Delete ${workspace.name}?`, `${deleteConsequence(workspace)} This cannot be undone.`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          remove.mutate(workspace.id, {
            onSuccess: () => router.replace('/(app)/(tabs)/workspaces'),
            onError: (err: Error) => Alert.alert('Could not delete', err.message),
          }),
      },
    ]);

  const field = 'bg-card rounded-2xl px-4 py-3.5 text-foreground text-base border border-border/40';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <View className="px-2 pt-1 flex-row items-center gap-1">
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Back"
            className="w-11 h-11 items-center justify-center active:opacity-60"
          >
            <ArrowLeftIcon size={20} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[17px] font-semibold">Workspace settings</Text>
        </View>

        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 32, gap: 18 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Name</Text>
            <TextInput
              value={nameNow}
              onChangeText={setName}
              maxLength={200}
              className={field}
              accessibilityLabel="Name"
            />
          </View>

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">
              Description
            </Text>
            <TextInput
              value={descriptionNow}
              onChangeText={setDescription}
              placeholder="Optional"
              placeholderTextColor={palette.mutedForeground}
              maxLength={2000}
              multiline
              textAlignVertical="top"
              className={field}
              style={{ minHeight: 76 }}
              accessibilityLabel="Description"
            />
          </View>

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Colour</Text>
            <View className="flex-row flex-wrap gap-3 px-1" accessibilityRole="radiogroup">
              {ACCENT_COLORS.map((c) => {
                const on = c.hex.toLowerCase() === colorNow.toLowerCase();
                return (
                  <Pressable
                    key={c.hex}
                    onPress={() => setColor(c.hex)}
                    accessibilityRole="radio"
                    accessibilityLabel={c.name}
                    accessibilityState={{ checked: on }}
                    className="w-10 h-10 rounded-full items-center justify-center"
                    style={{
                      backgroundColor: c.hex,
                      borderWidth: on ? 3 : 0,
                      borderColor: palette.background,
                    }}
                  >
                    {on && <CheckIcon size={18} className="text-white" />}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[1.5px] mx-1">Cover</Text>
            <Pressable
              onPress={() => setChoosingCover(true)}
              accessibilityRole="button"
              className="flex-row items-center gap-3 bg-card rounded-2xl p-2.5 border border-border/40 active:opacity-80"
            >
              <View
                className="w-20 h-12 rounded-xl overflow-hidden"
                style={{ backgroundColor: coverUrl ? palette.muted : `${colorNow}26` }}
              >
                {coverUrl ? <RemoteImage source={{ uri: coverUrl }} style={{ width: 80, height: 48 }} /> : null}
              </View>
              <Text className="text-foreground text-sm flex-1" numberOfLines={1}>
                {coverLabel}
              </Text>
              <ChevronDownIcon size={16} className="text-muted-foreground" />
            </Pressable>
          </View>

          <Pressable
            onPress={save}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
            className={`h-[50px] rounded-2xl items-center justify-center flex-row gap-2 ${ready ? 'bg-action' : 'bg-muted'}`}
          >
            {update.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className={`text-base font-bold ${ready ? 'text-action-foreground' : 'text-muted-foreground'}`}>
              Save
            </Text>
          </Pressable>

          <View className="flex-row items-center gap-3 p-3.5 rounded-2xl bg-secondary">
            <ArchiveIcon size={18} className="text-secondary-foreground" />
            <View className="flex-1">
              <Text className="text-foreground text-[13px] font-semibold">{archived ? 'Archived' : 'Archive'}</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {archived
                  ? 'Out of your list since the job finished. Bring it back to work in it again.'
                  : 'Moves it out of your list when the job is done. Albums and sharing stay as they are.'}
              </Text>
            </View>
            <Pressable
              onPress={toggleArchive}
              disabled={update.isPending}
              accessibilityRole="button"
              className="h-9 px-3 rounded-xl bg-card border border-border items-center justify-center active:scale-[0.96]"
            >
              <Text className="text-foreground text-[13px] font-semibold">{archived ? 'Bring back' : 'Archive'}</Text>
            </Pressable>
          </View>

          <View className="gap-3 p-3.5 rounded-2xl border border-destructive/30">
            <View className="flex-row items-center gap-3">
              <Trash2Icon size={18} className="text-destructive" />
              <Text className="text-destructive text-[13px] font-semibold flex-1">Delete workspace</Text>
            </View>
            <Text className="text-muted-foreground text-xs leading-[17px]">{deleteConsequence(workspace)}</Text>
            <Pressable
              onPress={confirmDelete}
              disabled={remove.isPending}
              accessibilityRole="button"
              className="h-10 rounded-xl bg-destructive/10 items-center justify-center active:scale-[0.98]"
            >
              <Text className="text-destructive text-sm font-bold">Delete…</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ChoiceSheet<string>
        visible={choosingCover}
        title="Cover"
        hint="The picture on this workspace’s card."
        options={[
          { value: NEWEST, label: 'The newest album’s' },
          ...withCovers.map((album) => ({ value: album.id, label: `From ${album.name}` })),
        ]}
        value={coverNow}
        onChoose={setCover}
        onClose={() => setChoosingCover(false)}
      />
    </SafeAreaView>
  );
}
