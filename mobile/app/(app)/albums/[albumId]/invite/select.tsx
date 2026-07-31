import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlbum, useAuth, useCollaborators, useFriends, useTheme } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState, useMemo } from 'react';
import {
  ArrowLeftIcon, CheckIcon, CircleIcon, SendIcon, UserCheckIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { PLACEHOLDER_IMAGE } from '@/src/lib/placeholder';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CircleIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserCheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLES = [
  { key: 'editor', label: 'Editor', desc: 'Can edit, review, export' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Can view and comment' },
  { key: 'client', label: 'Client', desc: 'View-only access' },
];

export default function SelectFriendsScreen() {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { albumId } = useLocalSearchParams<{ albumId: string }>();
  const { user } = useAuth();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [role, setRole] = useState('editor');

  const { data: album } = useAlbum(albumId);

  const { friends } = useFriends(
    {
      status: 'accepted',
      orderBy: 'friend_name',
      direction: 'asc',
      limit: 100,
    },
    { enabled: !!user?.id },
  );

  const { collaborators } = useCollaborators(
    { limit: 100 },
    { enabled: !!user?.id },
  );

  const existingNames = new Set(collaborators.map(c => c.name.toLowerCase()));
  const available = friends.filter(f => !existingNames.has(f.friend_name.toLowerCase()));

  const toggle = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedFriends = available.filter(f => selectedIds.has(f.id));
  const canSend = selectedIds.size > 0;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 160 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Select Friends</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">{selectedIds.size} selected</Text>
          </View>
        </View>

        {/* Role selector */}
        <View className="px-5 mt-3">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Assign Role</Text>
          <View className="flex-row gap-2">
            {ROLES.map(r => (
              <Pressable key={r.key} onPress={() => setRole(r.key)}
                className={`flex-1 rounded-xl px-3 py-2.5 items-center active:scale-[0.96] ${role === r.key ? 'bg-primary' : 'bg-card'}`}>
                <Text className={`text-xs font-bold ${role === r.key ? 'text-white' : 'text-foreground'}`}>{r.label}</Text>
                <Text className={`text-[9px] mt-0.5 ${role === r.key ? 'text-white/60' : 'text-muted-foreground'}`}>{r.desc}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Friends list */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-3 ml-1">
            Confirmed Friends ({available.length})
          </Text>
          {available.length === 0 ? (
            <View className="bg-card rounded-2xl p-6 items-center gap-3">
              <UserCheckIcon size={22} className="text-muted-foreground" />
              <Text className="text-muted-foreground text-sm text-center">No confirmed friends available to invite.</Text>
              <Pressable onPress={() => router.push('/friends/send-request')} className="bg-primary rounded-xl px-5 py-2.5 flex-row items-center gap-2 active:scale-[0.96]">
                <Text className="text-white text-sm font-semibold">Add Friends</Text>
              </Pressable>
            </View>
          ) : (
            <View className="bg-card rounded-2xl overflow-hidden" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              {available.map((f, i) => {
                const isSel = selectedIds.has(f.id);
                return (
                  <Pressable key={f.id} onPress={() => toggle(f.id)}
                    className="flex-row items-center gap-3 px-4 py-3.5 active:bg-muted/30"
                    style={i < available.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}>
                    <View className="w-7 h-7 rounded-full items-center justify-center">
                      {isSel ? <CheckIcon size={18} className="text-primary" /> : <CircleIcon size={18} className="text-muted-foreground/40" />}
                    </View>
                    <Image source={{ uri: f.friend_avatar_url || PLACEHOLDER_IMAGE }}
                      style={{ width: 40, height: 40, borderRadius: 20 }} />
                    <View className="flex-1 min-w-0">
                      <Text className={`text-sm font-semibold ${isSel ? 'text-primary' : 'text-foreground'}`} numberOfLines={1}>{f.friend_name}</Text>
                      {f.friend_email ? <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>{f.friend_email}</Text> : null}
                    </View>
                    {isSel && <View className="bg-primary/10 rounded-lg px-2.5 py-1"><Text className="text-primary text-[10px] font-bold">✓</Text></View>}
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Bottom send bar */}
      {canSend && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
          <Pressable onPress={() => {
              const ids = Array.from(selectedIds).join(',');
              const names = selectedFriends.map(f => f.friend_name).join(',');
              router.push(`/albums/${albumId}/invite/send?ids=${ids}&names=${encodeURIComponent(names)}&role=${role}`);
            }}
            className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            style={{ shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 }}>
            <SendIcon size={17} className="text-white" />
            <Text className="text-white text-base font-bold">
              Invite {selectedIds.size} Friend{selectedIds.size > 1 ? 's' : ''}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
