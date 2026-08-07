import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateWorkspace,
  usePlanLimits,
} from '@/src/hooks';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  PaletteIcon,
  CheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(PaletteIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [accentColor, setAccentColor] = useState('#B66A40');

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
        onSuccess: (workspace) => router.replace(`/workspaces/${workspace.id}`),
        onError: (err) => {
          Alert.alert('Error', 'Could not create workspace. Please try again.');
          console.error(err);
        },
      },
    );
  };

  // Blocked before the form can be submitted rather than after: the API
  // rejects it either way, but discovering that at the end wastes the effort.
  const canSave = name.trim().length > 0 && !atWorkspaceLimit;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              New Workspace
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Create a creative project space
            </Text>
          </View>
        </View>

        {/* Explains the disabled Create button. Without this the form simply
            refuses to submit with no stated reason. */}
        {atWorkspaceLimit && (
          <View className="mx-5 mt-4 rounded-2xl p-4" style={{ backgroundColor: '#C76B4A18' }}>
            <Text className="text-[#C76B4A] text-sm font-bold">Workspace limit reached</Text>
            <Text className="text-[#C76B4A] text-xs mt-1">
              The {plan} plan includes {workspaceLimit} workspace
              {workspaceLimit === 1 ? '' : 's'}. Delete one, or upgrade to add another.
            </Text>
            <Pressable
              onPress={() => router.push('/settings/storage/plans')}
              className="mt-3 rounded-xl py-2.5 items-center active:scale-[0.97]"
              style={{ backgroundColor: '#C76B4A' }}
            >
              <Text className="text-white text-xs font-bold">See plans</Text>
            </Pressable>
          </View>
        )}

        {/* Form */}
        <View className="px-5 mt-5 gap-5">
          {/* Name */}
          <View>
            <Text className="text-foreground text-sm font-semibold mb-2 ml-1">
              Workspace Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Spring Collection 2026"
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
              autoFocus
            />
          </View>

          {/* Description */}
          <View>
            <Text className="text-foreground text-sm font-semibold mb-2 ml-1">
              Description <Text className="text-muted-foreground font-normal">(optional)</Text>
            </Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Brief description of this workspace..."
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
                minHeight: 80,
              }}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Accent Color */}
          <View>
            <View className="flex-row items-center gap-2 mb-2 ml-1">
              <PaletteIcon size={14} className="text-muted-foreground" />
              <Text className="text-foreground text-sm font-semibold">Workspace Color</Text>
            </View>
            <View className="flex-row flex-wrap gap-3">
              {ACCENT_COLORS.map((c) => (
                <Pressable
                  key={c.hex}
                  onPress={() => setAccentColor(c.hex)}
                  className="items-center gap-1.5 active:scale-[0.94]"
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 14,
                      backgroundColor: c.hex,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {accentColor === c.hex && <CheckIcon size={18} className="text-white" />}
                  </View>
                  <Text className="text-muted-foreground text-[10px] font-medium">{c.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* Preview card */}
        {name.trim().length > 0 && (
          <View className="px-5 mt-6">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
              Preview
            </Text>
            <View
              className="bg-card rounded-2xl p-4 flex-row items-center gap-4"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 16,
                  backgroundColor: `${accentColor}22`,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{ fontSize: 20, fontWeight: '700', color: accentColor }}
                >
                  {name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View className="flex-1 min-w-0">
                <Text className="text-foreground text-base font-semibold" numberOfLines={1}>
                  {name}
                </Text>
                {description.trim() ? (
                  <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                    {description}
                  </Text>
                ) : (
                  <Text className="text-muted-foreground text-xs mt-0.5 italic">
                    No description
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={() => canSave && handleCreate()}
          className={`rounded-2xl py-3.5 items-center active:scale-[0.97] ${
            canSave ? 'bg-primary' : 'bg-muted'
          }`}
          disabled={!canSave || createWorkspace.isPending}
        >
          <Text
            className={`text-base font-bold ${
              canSave ? 'text-white' : 'text-muted-foreground'
            }`}
          >
            {createWorkspace.isPending ? 'Creating...' : 'Create Workspace'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
