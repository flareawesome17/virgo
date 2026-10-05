import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InsetFrame } from '@/components/InsetFrame';
import { RetentionPicker, retentionReady } from '@/components/RetentionPicker';
import { useAuth, useCreateAlbum, useWorkspaces, useTheme,
  usePlanLimits,
} from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError, retentionInput, type Retention } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { FormHeader } from '@/components/FormHeader';
import { useState } from 'react';
import {
  ImageIcon,
  MusicIcon,
  CheckIcon,
  ChevronDownIcon,
  LayersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { SELLS_PLANS_HERE } from '@/src/lib/store-purchasing';

cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function CreateAlbumScreen() {
  const { isAlbumLimitReached, albumLimit, plan } = usePlanLimits();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [retention, setRetention] = useState<Retention>({ mode: 'forever' });

  // Only your own: an album can only be made in a workspace you own, and
  // offering one shared with you ended in "Unknown workspace" at the end of
  // the form. Archived ones are left out by the list itself.
  const {
    workspaces: listed,
    isSuccess: workspacesLoaded,
    loadFailed: workspacesFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces(
    { orderBy: 'name', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );
  const workspaces = listed.filter((w) => w.user_id === user?.id);

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId || '');
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

  // Auto-select first workspace if none provided
  if (!selectedWorkspaceId && workspaces.length > 0 && !showWorkspacePicker) {
    setSelectedWorkspaceId(workspaces[0].id);
  }

  const selectedWs = workspaces.find((w) => w.id === selectedWorkspaceId);

  // Per workspace, as the plan counts it: this one is full, not every one.
  const atAlbumLimit = !!selectedWs && isAlbumLimitReached(selectedWs.album_total);

  // Albums hold any media type, so there is no source to choose up front.
  // Same reasoning as the workspace form: fail before the work, not after.
  // A window or a date half-chosen is not a choice: "Custom" with nothing
  // tapped used to create the album with no expiry at all.
  const canCreate =
    name.trim().length > 0 &&
    selectedWorkspaceId.length > 0 &&
    !atAlbumLimit &&
    retentionReady(retention);

  const createAlbum = useCreateAlbum();

  const handleCreate = () => {
    createAlbum.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        workspace_id: selectedWorkspaceId,
        ...retentionInput(retention),
        status: 'draft',
      },
      {
        onSuccess: (album) => router.replace(`/albums/${album.id}`),
        // The server's own words when it refused (a full workspace, a name too
        // long); a generic line only when it could not be reached.
        onError: (error) =>
          Alert.alert(
            'Could not create the album',
            error instanceof ApiError && error.status > 0 && error.status < 500
              ? error.message
              : 'Check your connection and try again.',
          ),
      },
    );
  };

  /*
   * No workspace of your own: say so, and offer the way out.
   *
   * New accounts, and people who only collaborate on someone else's, got an
   * empty workspace picker and a Create button that could never turn on, with
   * nothing saying why.
   */
  if (workspacesFailed && listed.length === 0) {
    return (
      <InsetFrame>
        <FormHeader title="New album" />
        <LoadFailed what="your workspaces" onRetry={() => void refetchWorkspaces()} />
      </InsetFrame>
    );
  }
  if (workspacesLoaded && workspaces.length === 0) {
    return (
      <InsetFrame>
        <FormHeader title="New album" />
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-foreground text-[17px] font-bold text-center">
            Make a workspace first
          </Text>
          <Text className="text-muted-foreground text-[14px] leading-[21px] text-center mt-2">
            Albums live in workspaces — one for a client, a brand, or a season of work. Albums
            shared with you stay in the workspace of whoever shared them.
          </Text>
          <Pressable
            onPress={() => router.push('/workspaces/create')}
            accessibilityRole="button"
            className="mt-6 min-h-12 px-6 rounded-xl bg-action items-center justify-center active:opacity-90"
          >
            <Text className="text-action-foreground text-[15px] font-bold">Create a workspace</Text>
          </Pressable>
        </View>
      </InsetFrame>
    );
  }

  return (
    <InsetFrame>
      <FormHeader title="New album" />
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 140 }}
        keyboardShouldPersistTaps="handled"
      >

        {/* Explains the disabled Create button. */}
        {atAlbumLimit && (
          <View className="mx-5 mt-4 rounded-2xl p-4" style={{ backgroundColor: '#C76B4A18' }}>
            <Text className="text-[#C76B4A] text-sm font-bold">{selectedWs?.name} is full</Text>
            <Text className="text-[#C76B4A] text-xs mt-1">
              The {plan} plan allows {albumLimit} album{albumLimit === 1 ? '' : 's'} in each
              workspace. Choose another workspace or delete an album
              {SELLS_PLANS_HERE ? ', or upgrade.' : '.'}
            </Text>
            <Pressable
              onPress={() => router.push('/settings/storage/plans')}
              accessibilityRole="button"
              className="mt-3 rounded-xl py-2.5 items-center active:scale-[0.97]"
              style={{ backgroundColor: '#C76B4A' }}
            >
              <Text className="text-white text-xs font-bold">See plans</Text>
            </Pressable>
          </View>
        )}

        {/* ── Step 2: Album Details ── */}
        <View className="px-5 mt-6 gap-4">
          {/* Workspace picker */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Workspace
            </Text>
            <Pressable
              onPress={() => setShowWorkspacePicker(!showWorkspacePicker)}
              accessibilityRole="button"
              accessibilityHint="Choose which workspace the album belongs to"
              accessibilityState={{ expanded: showWorkspacePicker }}
              className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
            >
              {selectedWs ? (
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 9,
                    backgroundColor: `${selectedWs.accent_color}22`,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: selectedWs.accent_color }}>
                    {selectedWs.name.charAt(0)}
                  </Text>
                </View>
              ) : null}
              <Text className="text-foreground text-sm flex-1">
                {selectedWs ? selectedWs.name : 'Select a workspace'}
              </Text>
              <ChevronDownIcon size={16} className="text-muted-foreground" />
            </Pressable>

            {showWorkspacePicker && (
              <View
                className="mt-2 bg-card rounded-2xl overflow-hidden"
                style={{
                  shadowColor: '#000',
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  shadowOffset: { width: 0, height: 2 },
                  elevation: 2,
                }}
              >
                {workspaces.map((w, i) => (
                  <Pressable
                    key={w.id}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selectedWorkspaceId === w.id }}
                    onPress={() => {
                      setSelectedWorkspaceId(w.id);
                      setShowWorkspacePicker(false);
                    }}
                    className="flex-row items-center gap-3 px-4 py-3 active:bg-muted/30"
                    style={
                      i < workspaces.length - 1
                        ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
                        : undefined
                    }
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 9,
                        backgroundColor: `${w.accent_color}22`,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: w.accent_color }}>
                        {w.name.charAt(0)}
                      </Text>
                    </View>
                    <Text className="text-foreground text-sm flex-1">{w.name}</Text>
                    {w.id === selectedWorkspaceId && (
                      <CheckIcon size={14} className="text-primary" />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Name */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Album name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Look 1 — Golden Hour"
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
            />
          </View>

          {/* Description */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Description <Text className="text-muted-foreground font-medium normal-case tracking-normal">(optional)</Text>
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of this album..."
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
                minHeight: 72,
              }}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* ── Step 3: Retention ── */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
            Keep the files
          </Text>
          <RetentionPicker value={retention} onChange={setRetention} />
        </View>
      </ScrollView>

      {/* ── Bottom Actions ── */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <Text className="text-foreground text-base font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={() => canCreate && handleCreate()}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canCreate || createAlbum.isPending }}
          className={`flex-[2] rounded-2xl py-3.5 items-center active:scale-[0.97] ${
            canCreate ? 'bg-action' : 'bg-muted'
          }`}
          disabled={!canCreate || createAlbum.isPending}
        >
          <Text
            className={`text-base font-bold ${
              canCreate ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {createAlbum.isPending ? 'Creating...' : 'Create album'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </InsetFrame>
  );
}
