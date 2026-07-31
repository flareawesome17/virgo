import { View, Text, ScrollView, Pressable, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { CollaboratorRole } from '@/src/api';
import { useAlbum, useAuth, useCreateCollaborator, useFriends, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, SendIcon, UserCheckIcon, CheckIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLE_LABELS: Record<string, string> = {
  editor: 'Editor', reviewer: 'Reviewer', client: 'Client',
};

export default function SendInvitesScreen() {
  const { isDark } = useTheme();
  const { albumId, ids, names, role } = useLocalSearchParams<{ albumId: string; ids: string; names: string; role: string }>();
  const { user } = useAuth();
  const [sent, setSent] = useState(false);

  const idList = (ids || '').split(',').filter(Boolean);
  const nameList = (names || '').split(',').filter(Boolean);

  const { data: album } = useAlbum(albumId);

  const { friends } = useFriends({ limit: 100 }, { enabled: !!user?.id });

  const selectedFriends = friends.filter((f) => idList.includes(f.id));

  const createCollaborator = useCreateCollaborator();

  // This previously inserted workspace_id: '' — collaborators.workspace_id is
  // NOT NULL and references workspaces(id), so an empty string could never
  // satisfy the foreign key. The album's own workspace is the correct owner.
  const sendInvites = async () => {
    if (!album?.workspace_id) {
      Alert.alert('Error', 'This album is not linked to a workspace.');
      return;
    }

    try {
      await Promise.all(
        selectedFriends.map((f) =>
          createCollaborator.mutateAsync({
            workspace_id: album.workspace_id,
            name: f.friend_name,
            avatar_url: f.friend_avatar_url,
            role: (role || 'editor') as CollaboratorRole,
          }),
        ),
      );
      setSent(true);
    } catch {
      Alert.alert('Error', 'Could not send invites.');
    }
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">{sent ? 'Invites Sent' : 'Confirm Invites'}</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">{album?.name || 'Album'}</Text>
          </View>
        </View>

        {sent ? (
          <View className="px-5 mt-10 items-center">
            <View className="w-20 h-20 rounded-full bg-[#6B8E4E18] items-center justify-center mb-5"
              style={{ shadowColor: '#6B8E4E', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
              <CheckIcon size={36} className="text-[#6B8E4E]" />
            </View>
            <Text className="text-foreground text-xl font-extrabold">Invites Sent!</Text>
            <Text className="text-muted-foreground text-sm text-center mt-2 px-6">
              {nameList.length} friend{nameList.length > 1 ? 's' : ''} invited as {ROLE_LABELS[role || 'editor'] || role}
            </Text>
            <Pressable onPress={() => router.back()} className="mt-8 bg-primary rounded-2xl px-8 py-3.5 active:scale-[0.96]">
              <Text className="text-white text-base font-bold">Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Album card */}
            {album && (
              <View className="mx-5 mt-4 bg-card rounded-2xl p-4 flex-row items-center gap-4" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                <Image source={{ uri: album.cover_url || PLACEHOLDER_IMAGE }}
                  style={{ width: 48, height: 48, borderRadius: 14 }} />
                <View className="flex-1">
                  <Text className="text-foreground text-base font-bold">{album.name}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">Role: {ROLE_LABELS[role || 'editor'] || role}</Text>
                </View>
              </View>
            )}

            {/* Friends list */}
            <View className="px-5 mt-5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
                Inviting {nameList.length} Friend{nameList.length > 1 ? 's' : ''}
              </Text>
              <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
                {nameList.map((name, i) => {
                  const f = selectedFriends.find(fr => fr.friend_name === name);
                  return (
                    <View key={i}
                      className="flex-row items-center gap-3 px-4 py-3.5"
                      style={i < nameList.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                      <Image source={{ uri: f?.friend_avatar_url || PLACEHOLDER_IMAGE }}
                        style={{ width: 40, height: 40, borderRadius: 20 }} />
                      <View className="flex-1">
                        <Text className="text-foreground text-sm font-semibold">{name}</Text>
                        <View className="flex-row items-center gap-2 mt-0.5">
                          <View className="bg-primary/10 rounded px-1.5 py-0.5">
                            <Text className="text-primary text-[9px] font-bold uppercase">{ROLE_LABELS[role || 'editor'] || role}</Text>
                          </View>
                        </View>
                      </View>
                      <UserCheckIcon size={16} className="text-[#6B8E4E]" />
                    </View>
                  );
                })}
              </View>
            </View>

            <View className="px-5 mt-8">
              <Pressable onPress={() => sendInvites()}
                className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
                style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
                <SendIcon size={17} className="text-white" />
                <Text className="text-white text-base font-bold">
                  {createCollaborator.isPending ? 'Sending...' : `Send ${nameList.length} Invite${nameList.length > 1 ? 's' : ''}`}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
