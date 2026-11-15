import { View, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { InsetFrame } from '@/components/InsetFrame';
import { useCreateWorkspace, usePlanLimits } from '@/src/hooks';
import { router } from 'expo-router';
import { ApiError } from '@/src/api';
import { useDiscardGuard } from '@/src/lib/discard-guard';
import { FormHeader } from '@/components/FormHeader';
import { useState } from 'react';
import { FormField, FormFooter, FormInput, FormNotice } from '@/components/Form';
import { SELLS_PLANS_HERE } from '@/src/lib/store-purchasing';

const ACCENT_COLORS = [
  { name: 'Copper', hex: '#B66A40' },
  { name: 'Bronze', hex: '#C17745' },
  { name: 'Espresso', hex: '#8B5E3C' },
  { name: 'Terracotta', hex: '#C76B4A' },
  { name: 'Sage', hex: '#7A8B6E' },
  { name: 'Slate Blue', hex: '#5B7B9A' },
  { name: 'Plum', hex: '#8B5B7A' },
  { name: 'Charcoal', hex: '#54433C' },
];

export default function CreateWorkspaceScreen() {
  const { atWorkspaceLimit, workspaceLimit, plan } = usePlanLimits();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('#B66A40');
  const { allowLeave } = useDiscardGuard({ name, description, accentColor });

  // The API owns id generation and the created_at / updated_at timestamps, so
  // none of them are sent from here any more.
  const createWorkspace = useCreateWorkspace();

  const handleCreate = () => {
    createWorkspace.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        accent_color: accentColor,
      },
      {
        onSuccess: (workspace) => {
          allowLeave();
          router.replace(`/workspaces/${workspace.id}`);
        },
        // A 403 here is the workspace limit (the count on this screen was
        // stale), and its message is written for people, so it is shown as
        // is. Anything else gets the generic line: a 400's wording comes from
        // the validator and is not meant to be read.
        onError: (err) => {
          Alert.alert(
            'Could not create workspace',
            err instanceof ApiError && err.status === 403
              ? err.message
              : 'Please try again.',
          );
          console.error(err);
        },
      },
    );
  };

  // Blocked before the form can be submitted rather than after: the API
  // rejects it either way, but discovering that at the end wastes the effort.
  const canSave = name.trim().length > 0 && !atWorkspaceLimit;

  return (
    <InsetFrame edges={['top']}>
      <FormHeader title="New workspace" />
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          keyboardDismissMode="on-drag"
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Explains the disabled Create button. Without this the form simply
              refuses to submit with no stated reason. */}
          {atWorkspaceLimit && (
            <FormNotice
              title="You have every workspace your plan includes."
              body={`The ${plan} plan includes ${workspaceLimit} workspace${workspaceLimit === 1 ? '' : 's'}. Archived ones count too, so delete one you have finished with to add another.`}
              // Only where a plan can be bought: see SELLS_PLANS_HERE.
              action={SELLS_PLANS_HERE ? { label: 'Plans', onPress: () => router.push('/settings/storage/plans') } : undefined}
            />
          )}

          <FormField label="Name" hint="Usually the client or the shoot. You can change it later.">
            <FormInput
              value={name}
              onChangeText={setName}
              placeholder="Ana & Marco Wedding"
              autoFocus
              returnKeyType="done"
            />
          </FormField>

          <FormField label="About it" optional>
            <FormInput
              value={description}
              onChangeText={setDescription}
              placeholder="December wedding at Carcar. Two shooters, same-day edit."
              multiline
            />
          </FormField>

          {/* The swatch alone, ringed when chosen. Each had its name under it
              in ten-point type, and a preview card below repeated the choice. */}
          <FormField label="Colour" hint="Shown on its tile until it has a cover photo.">
            <View className="flex-row flex-wrap gap-3.5 py-1" accessibilityRole="radiogroup">
              {ACCENT_COLORS.map((c) => {
                const on = accentColor === c.hex;
                return (
                  <Pressable
                    key={c.hex}
                    onPress={() => setAccentColor(c.hex)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.name}
                    hitSlop={4}
                    className={`w-11 h-11 rounded-full items-center justify-center border-2 active:opacity-80 ${
                      on ? 'border-foreground' : 'border-transparent'
                    }`}
                  >
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.hex }} />
                  </Pressable>
                );
              })}
            </View>
          </FormField>
        </ScrollView>

        <FormFooter
          label="Create workspace"
          onPress={handleCreate}
          disabled={!canSave}
          busy={createWorkspace.isPending}
        />
      </KeyboardAvoidingView>
    </InsetFrame>
  );
}
