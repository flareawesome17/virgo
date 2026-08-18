import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, useCreateAlbum, useWorkspaces, useTheme,
  usePlanLimits,
} from '@/src/hooks';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  ImageIcon,
  MusicIcon,
  CheckIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LayersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronDownIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ChevronRightIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LayersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const RETENTION_OPTIONS = [
  { key: 'none', label: 'No expiration', value: null as number | null },
  { key: '7', label: '7 days', value: 7 },
  { key: '30', label: '30 days', value: 30 },
  { key: 'custom', label: 'Custom', value: -1 },
];

const CUSTOM_DAYS = [14, 21, 45, 60, 90, 120, 180, 365];

export default function CreateAlbumScreen() {
  const { atAlbumLimit, albumLimit, plan } = usePlanLimits();
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { workspaceId } = useLocalSearchParams<{ workspaceId?: string }>();
  const { user } = useAuth();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [retentionKey, setRetentionKey] = useState('none');
  const [customDays, setCustomDays] = useState<number | null>(null);
  const [showCustomPicker, setShowCustomPicker] = useState(false);

  // The API returns whole rows rather than a column projection; this screen
  // only reads id / name / accent_color, so nothing downstream changes.
  const { workspaces } = useWorkspaces(
    { orderBy: 'name', direction: 'asc', limit: 100 },
    { enabled: !!user?.id },
  );

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(workspaceId || '');
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

  // Auto-select first workspace if none provided
  if (!selectedWorkspaceId && workspaces.length > 0 && !showWorkspacePicker) {
    setSelectedWorkspaceId(workspaces[0].id);
  }

  const getRetentionDays = (): number | null => {
    if (retentionKey === 'none') return null;
    if (retentionKey === 'custom') return customDays;
    return parseInt(retentionKey);
  };

  // Albums hold any media type, so there is no source to choose up front.
  // Same reasoning as the workspace form: fail before the work, not after.
  const canCreate =
    name.trim().length > 0 && selectedWorkspaceId.length > 0 && !atAlbumLimit;

  const createAlbum = useCreateAlbum();

  const handleCreate = () => {
    createAlbum.mutate(
      {
        name: name.trim(),
        description: description.trim() || null,
        workspace_id: selectedWorkspaceId,
        retention_days: getRetentionDays(),
        item_count: 0,
        status: 'draft',
      },
      {
        onSuccess: (album) => router.replace(`/albums/${album.id}`),
        onError: () =>
          Alert.alert('Error', 'Could not create album. Please try again.'),
      },
    );
  };

  const selectedWs = workspaces.find((w) => w.id === selectedWorkspaceId);

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
        contentContainerStyle={{ paddingBottom: 140 }}
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
              Create Album
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Organize and deliver creative work
            </Text>
          </View>
        </View>

        {/* Explains the disabled Create button. */}
        {atAlbumLimit && (
          <View className="mx-5 mt-4 rounded-2xl p-4" style={{ backgroundColor: '#C76B4A18' }}>
            <Text className="text-[#C76B4A] text-sm font-bold">Album limit reached</Text>
            <Text className="text-[#C76B4A] text-xs mt-1">
              The {plan} plan includes {albumLimit} album{albumLimit === 1 ? '' : 's'}.
              Delete one, or upgrade to add another.
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

        {/* ── Step 2: Album Details ── */}
        <View className="px-5 mt-6 gap-4">
          {/* Workspace picker */}
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Workspace
            </Text>
            <Pressable
              onPress={() => setShowWorkspacePicker(!showWorkspacePicker)}
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
              Album Name
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
            Retention
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            {RETENTION_OPTIONS.map((opt, i) => (
              <Pressable
                key={opt.key}
                onPress={() => {
                  setRetentionKey(opt.key);
                  if (opt.key !== 'custom') setShowCustomPicker(false);
                  else setShowCustomPicker(true);
                }}
                className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                style={
                  i < RETENTION_OPTIONS.length - 1
                    ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }
                    : undefined
                }
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: retentionKey === opt.key ? '#B66A40' : '#D9C2B7',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {retentionKey === opt.key && (
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#B66A40' }} />
                  )}
                </View>
                <Text className="text-foreground text-sm font-semibold flex-1">{opt.label}</Text>
                {opt.key === 'custom' && (
                  <ChevronRightIcon size={14} className="text-muted-foreground" />
                )}
              </Pressable>
            ))}
          </View>

          {/* Custom date picker */}
          {showCustomPicker && (
            <View className="mt-3 bg-card rounded-2xl p-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <CalendarIcon size={14} className="text-primary" />
                <Text className="text-foreground text-sm font-semibold">Custom retention period</Text>
              </View>
              <View className="flex-row flex-wrap gap-2">
                {CUSTOM_DAYS.map((days) => (
                  <Pressable
                    key={days}
                    onPress={() => setCustomDays(days)}
                    className={`rounded-xl px-3.5 py-2 active:scale-[0.96] ${
                      customDays === days ? 'bg-action' : 'bg-muted'
                    }`}
                  >
                    <Text
                      className={`text-sm font-semibold ${
                        customDays === days ? 'text-white' : 'text-foreground'
                      }`}
                    >
                      {days} days
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Bottom Actions ── */}
      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background flex-row gap-3" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable
          onPress={() => router.back()}
          className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 2 },
            elevation: 2,
          }}
        >
          <Text className="text-foreground text-base font-semibold">Back</Text>
        </Pressable>
        <Pressable
          onPress={() => canCreate && handleCreate()}
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
            {createAlbum.isPending ? 'Creating...' : 'Create Album'}
          </Text>
        </Pressable>
      </View>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
