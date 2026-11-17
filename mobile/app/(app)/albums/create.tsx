import { View, Text, Pressable, Alert } from 'react-native';
import { KeyboardFrame, KeyboardScroll } from '@/components/KeyboardForm';
import { InsetFrame } from '@/components/InsetFrame';
import { RetentionPicker, retentionReady } from '@/components/RetentionPicker';
import { useAuth, useCreateAlbum, useWorkspaces, usePlanLimits } from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { ApiError, retentionInput, type Retention } from '@/src/api';
import { LoadFailed } from '@/components/LoadFailed';
import { FormHeader } from '@/components/FormHeader';
import { useState } from 'react';
import { FolderIcon } from 'lucide-react-native';
import { SELLS_PLANS_HERE } from '@/src/lib/store-purchasing';
import { FormCard, FormField, FormFooter, FormInput, FormNotice, FormRow, FormSection } from '@/components/Form';
import { ChoiceSheet } from '@/components/WorkspaceBits';

export default function CreateAlbumScreen() {
  const { isAlbumLimitReached, albumLimit, plan } = usePlanLimits();
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [retention, setRetention] = useState<Retention>({ mode: 'forever' });
  const { allowLeave } = useDiscardGuard({ name, description, retention });

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
        onSuccess: (album) => {
          allowLeave();
          router.replace(`/albums/${album.id}`);
        },
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
    <InsetFrame edges={['top']}>
      <FormHeader title="New album" />
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardFrame>
        <KeyboardScroll
          keyboardDismissMode="on-drag"
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Explains the disabled Create button. */}
          {atAlbumLimit && (
            <FormNotice
              title={`${selectedWs?.name ?? 'This workspace'} is full.`}
              body={`The ${plan} plan allows ${albumLimit} album${albumLimit === 1 ? '' : 's'} in each workspace. Choose another workspace, or delete an album you have finished with.`}
              // Only where a plan can be bought: see SELLS_PLANS_HERE.
              action={SELLS_PLANS_HERE ? { label: 'Plans', onPress: () => router.push('/settings/storage/plans') } : undefined}
            />
          )}

          {/* The name first. The workspace led, and it is already chosen
              whenever the form is opened from one. */}
          <FormField label="Name">
            <FormInput
              value={name}
              onChangeText={setName}
              placeholder="Ceremony"
              returnKeyType="done"
            />
          </FormField>

          <FormSection title="Where it goes">
            <FormCard>
              <FormRow
                first
                icon={FolderIcon}
                label="Workspace"
                value={selectedWs ? selectedWs.name : 'Choose one'}
                empty={!selectedWs}
                onPress={() => setShowWorkspacePicker(true)}
                accessibilityHint="Choose which workspace the album belongs to"
              />
            </FormCard>
          </FormSection>

          <FormField label="About it" optional>
            <FormInput
              value={description}
              onChangeText={setDescription}
              placeholder="What is in it, for whoever opens it"
              multiline
            />
          </FormField>

          <FormSection title="Keep the files">
            <RetentionPicker value={retention} onChange={setRetention} />
          </FormSection>
        </KeyboardScroll>

        {/* One button. There was a Cancel beside it, and an X above that
            already did the same thing. */}
        <FormFooter
          label="Create album"
          onPress={handleCreate}
          disabled={!canCreate}
          busy={createAlbum.isPending}
        />
      </KeyboardFrame>

      <ChoiceSheet
        visible={showWorkspacePicker}
        title="Workspace"
        hint="The album lives in one of your workspaces."
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
        value={selectedWorkspaceId ?? null}
        onChoose={setSelectedWorkspaceId}
        onClose={() => setShowWorkspacePicker(false)}
      />
    </InsetFrame>
  );
}
