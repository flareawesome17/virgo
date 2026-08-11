import { View, Text, ScrollView, Pressable, Alert, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  CloudIcon,
  HardDriveIcon,
  ImageIcon,
  VideoIcon,
  MusicIcon,
  FileIcon,
  RefreshCwIcon,
  Trash2Icon,
  AlertTriangleIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { formatBytes } from '@/src/api';
import { useStorageBreakdown, useUsage, useWipeStorage, useTheme } from '@/src/hooks';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CloudIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(HardDriveIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(ImageIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(VideoIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MusicIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(FileIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(RefreshCwIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(Trash2Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(AlertTriangleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const TYPE_META: Record<string, { label: string; icon: typeof ImageIcon; color: string }> = {
  image: { label: 'Photos', icon: ImageIcon, color: '#B66A40' },
  video: { label: 'Videos', icon: VideoIcon, color: '#C17745' },
  audio: { label: 'Audio', icon: MusicIcon, color: '#8B5E3C' },
  other: { label: 'Other', icon: FileIcon, color: '#A89489' },
};

/** Typed into the confirmation box before the wipe is allowed to run. */
const CONFIRM_WORD = 'DELETE';

/**
 * Sync & Storage.
 *
 * The Profile tab linked here with no route — the row rendered a chevron and
 * did nothing when tapped. Everything shown is read from the API; nothing on
 * this screen is illustrative.
 */
export default function SyncStorageScreen() {
  const { isDark } = useTheme();
  const {
    storageUsedBytes,
    storageLimitBytes,
    storageFraction,
    usage,
    isFetching: usageFetching,
    refetch: refetchUsage,
  } = useUsage();
  const { breakdown, isFetching: breakdownFetching, refetch: refetchBreakdown } =
    useStorageBreakdown();
  const wipe = useWipeStorage();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const isRefreshing = usageFetching || breakdownFetching;
  const fileCount = usage?.storage.fileCount ?? 0;
  const hasFiles = fileCount > 0;

  const refresh = () => {
    refetchUsage();
    refetchBreakdown();
  };

  const runWipe = () => {
    wipe.mutate(undefined, {
      onSuccess: (result) => {
        setConfirmOpen(false);
        setConfirmText('');
        // Report what actually happened. A partial failure leaves objects in
        // the bucket, and saying "all deleted" would be untrue.
        if (result.failed > 0) {
          Alert.alert(
            'Partly wiped',
            `Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'} ` +
              `(${formatBytes(result.freedBytes)}). ${result.failed} could not be ` +
              `deleted and still count against your storage. Try again.`,
          );
        } else {
          Alert.alert(
            'Storage wiped',
            `Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'}, ` +
              `freeing ${formatBytes(result.freedBytes)}.`,
          );
        }
      },
      onError: () =>
        Alert.alert('Error', 'Could not wipe storage. Please try again.'),
    });
  };

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
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight flex-1">
            Sync & Storage
          </Text>
          <Pressable
            onPress={refresh}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {isRefreshing ? (
              <ActivityIndicator size="small" color="#B66A40" />
            ) : (
              <RefreshCwIcon size={16} className="text-foreground" />
            )}
          </Pressable>
        </View>

        {/* Cloud usage */}
        <View className="px-5 mt-4">
          <View
            className="bg-card rounded-3xl p-5"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 }}
          >
            <View className="flex-row items-center gap-3">
              <View className="w-11 h-11 rounded-2xl items-center justify-center" style={{ backgroundColor: '#8B5E3C18' }}>
                <CloudIcon size={20} color="#8B5E3C" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-base font-bold">Cloud storage</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {fileCount} file{fileCount === 1 ? '' : 's'} across all albums
                </Text>
              </View>
            </View>

            <View className="flex-row items-baseline gap-1.5 mt-4">
              <Text className="text-foreground text-[26px] font-bold tracking-tight">
                {formatBytes(storageUsedBytes)}
              </Text>
              <Text className="text-muted-foreground text-sm font-medium">
                {storageLimitBytes != null ? `of ${formatBytes(storageLimitBytes)}` : 'used'}
              </Text>
            </View>

            {storageLimitBytes != null && (
              <View className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                <View
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(storageFraction * 100)}%`,
                    backgroundColor: storageFraction > 0.9 ? '#C76B4A' : '#B66A40',
                  }}
                />
              </View>
            )}

            <Pressable
              onPress={() => router.push('/settings/storage')}
              className="mt-4 rounded-2xl py-3 items-center active:scale-[0.97]"
              style={{ backgroundColor: '#B66A4014' }}
            >
              <Text className="text-primary text-sm font-bold">View storage details</Text>
            </Pressable>
          </View>
        </View>

        {/* By media type */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            By type
          </Text>
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {breakdown.byType.length === 0 ? (
              <View className="px-4 py-5">
                <Text className="text-muted-foreground text-sm text-center">
                  Nothing stored yet.
                </Text>
              </View>
            ) : (
              breakdown.byType.map((row, i) => {
                const meta = TYPE_META[row.kind] ?? TYPE_META.other;
                const Icon = meta.icon;
                const pct = storageUsedBytes > 0 ? (row.bytes / storageUsedBytes) * 100 : 0;
                return (
                  <View
                    key={row.kind}
                    className="px-4 py-3.5 flex-row items-center gap-3"
                    style={i < breakdown.byType.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                  >
                    <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: `${meta.color}14` }}>
                      <Icon size={15} color={meta.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-sm font-semibold">{meta.label}</Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {row.files} file{row.files === 1 ? '' : 's'} · {Math.round(pct)}%
                      </Text>
                    </View>
                    <Text className="text-foreground text-sm font-semibold">
                      {formatBytes(row.bytes)}
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* By album */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            By album
          </Text>
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {breakdown.byAlbum.length === 0 ? (
              <View className="px-4 py-5">
                <Text className="text-muted-foreground text-sm text-center">
                  Nothing stored yet.
                </Text>
              </View>
            ) : (
              breakdown.byAlbum.map((row, i) => (
                <Pressable
                  key={row.albumId ?? 'unfiled'}
                  onPress={row.albumId ? () => router.push(`/albums/${row.albumId}`) : undefined}
                  disabled={!row.albumId}
                  className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                  style={i < breakdown.byAlbum.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                >
                  <View className="w-8 h-8 rounded-xl items-center justify-center" style={{ backgroundColor: '#B66A4014' }}>
                    <HardDriveIcon size={15} color="#B66A40" />
                  </View>
                  <View className="flex-1">
                    {/* A null album name means the file was uploaded before an
                        album was chosen, so it belongs to none. */}
                    <Text className="text-foreground text-sm font-semibold">
                      {row.name ?? 'Not in an album'}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      {row.files} file{row.files === 1 ? '' : 's'}
                    </Text>
                  </View>
                  <Text className="text-foreground text-sm font-semibold">
                    {formatBytes(row.bytes)}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        </View>

        {/* Danger zone */}
        <View className="px-5 mt-8">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Danger zone
          </Text>
          <View
            className="rounded-2xl p-4"
            style={{ backgroundColor: '#C76B4A10', borderWidth: 1, borderColor: '#C76B4A33' }}
          >
            <View className="flex-row items-center gap-2">
              <AlertTriangleIcon size={16} color="#C76B4A" />
              <Text className="text-[#C76B4A] text-sm font-bold">Wipe all cloud data</Text>
            </View>
            <Text className="text-[#C76B4A] text-xs mt-2 leading-[18px]">
              Permanently deletes every photo, video and audio file you have
              stored — across all workspaces and albums. Your albums and
              workspaces stay, but they will be empty. This cannot be undone.
            </Text>

            {!confirmOpen ? (
              <Pressable
                onPress={() => setConfirmOpen(true)}
                disabled={!hasFiles}
                className="mt-3 rounded-xl py-3 items-center flex-row justify-center gap-2 active:scale-[0.97]"
                style={{ backgroundColor: hasFiles ? '#C76B4A' : '#C76B4A55' }}
              >
                <Trash2Icon size={15} color="#FFFFFF" />
                <Text className="text-white text-sm font-bold">
                  {hasFiles
                    ? `Wipe ${fileCount} file${fileCount === 1 ? '' : 's'} (${formatBytes(storageUsedBytes)})`
                    : 'Nothing to wipe'}
                </Text>
              </Pressable>
            ) : (
              <View className="mt-3">
                <Text className="text-[#C76B4A] text-xs font-semibold mb-2">
                  Type {CONFIRM_WORD} to confirm
                </Text>
                <TextInput
                  value={confirmText}
                  onChangeText={setConfirmText}
                  placeholder={CONFIRM_WORD}
                  placeholderTextColor="#C76B4A77"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  editable={!wipe.isPending}
                  className="bg-card rounded-xl px-4 py-3 text-foreground text-base"
                  style={{ borderWidth: 1, borderColor: '#C76B4A44' }}
                />
                <View className="flex-row gap-2 mt-3">
                  <Pressable
                    onPress={() => { setConfirmOpen(false); setConfirmText(''); }}
                    disabled={wipe.isPending}
                    className="flex-1 bg-card rounded-xl py-3 items-center active:scale-[0.97]"
                  >
                    <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={runWipe}
                    disabled={confirmText.trim() !== CONFIRM_WORD || wipe.isPending}
                    className="flex-1 rounded-xl py-3 items-center flex-row justify-center gap-2 active:scale-[0.97]"
                    style={{
                      backgroundColor:
                        confirmText.trim() === CONFIRM_WORD && !wipe.isPending
                          ? '#C76B4A'
                          : '#C76B4A55',
                    }}
                  >
                    {wipe.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
                    <Text className="text-white text-sm font-bold">
                      {wipe.isPending ? 'Wiping…' : 'Wipe everything'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
          </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
