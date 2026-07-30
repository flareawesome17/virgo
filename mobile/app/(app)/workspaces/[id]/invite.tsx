import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApp, useAuth } from '@/src/hooks';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import {
  ArrowLeftIcon,
  SendIcon,
  LinkIcon,
  CopyIcon,
  XIcon,
  UserPlusIcon,
  UsersIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LinkIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CopyIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(XIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

const ROLES = [
  { key: 'photographer', label: 'Photographer', desc: 'Can upload, edit media' },
  { key: 'editor', label: 'Editor', desc: 'Can edit, review, export' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Can view and comment' },
  { key: 'client', label: 'Client', desc: 'View-only access' },
];

const ROLE_COLORS: Record<string, string> = {
  photographer: '#B66A40',
  editor: '#C17745',
  reviewer: '#8B5E3C',
  client: '#5B7B9A',
};

export default function InviteCollaboratorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { client } = useApp();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('photographer');
  const [invites, setInvites] = useState<{ name: string; email: string; role: string }[]>([]);

  const { data: workspace } = useQuery({
    queryKey: ['workspace', id],
    queryFn: async () => {
      const { data, error } = await client
        .from('workspaces')
        .select('id, name, accent_color')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const addInvite = () => {
    if (!name.trim() || !email.trim()) {
      Alert.alert('Missing info', 'Please enter both name and email.');
      return;
    }
    setInvites((prev) => [...prev, { name: name.trim(), email: email.trim(), role }]);
    setName('');
    setEmail('');
    setRole('photographer');
  };

  const removeInvite = (index: number) => {
    setInvites((prev) => prev.filter((_, i) => i !== index));
  };

  const sendInvites = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      for (const inv of invites) {
        const collabId = 'collab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const { error } = await client.from('collaborators').insert({
          id: collabId,
          workspace_id: id,
          name: inv.name,
          role: inv.role,
          created_at: now,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collaborators'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      router.back();
    },
    onError: (err) => {
      Alert.alert('Error', 'Could not send invites. Please try again.');
      console.error(err);
    },
  });

  const accent = workspace?.accent_color || '#B66A40';

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
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
              Invite Collaborators
            </Text>
            {workspace ? (
              <Text className="text-muted-foreground text-sm mt-0.5">
                Add members to {workspace.name}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Share link card */}
        <View
          className="mx-5 mt-5 bg-card rounded-2xl p-4"
          style={{
            shadowColor: '#000',
            shadowOpacity: 0.04,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          }}
        >
          <View className="flex-row items-center gap-3 mb-3">
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                backgroundColor: `${accent}18`,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LinkIcon size={16} style={{ color: accent }} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">Share workspace link</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                Anyone with the link can request access
              </Text>
            </View>
          </View>
          <View className="flex-row items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
            <Text className="text-muted-foreground text-xs flex-1" numberOfLines={1}>
              virgo.app/workspaces/{id}/join
            </Text>
            <Pressable className="w-8 h-8 rounded-lg bg-card items-center justify-center active:scale-[0.92]">
              <CopyIcon size={14} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* Add collaborator form */}
        <View className="px-5 mt-6">
          <Text className="text-foreground text-base font-bold tracking-tight mb-3">
            Add by name & email
          </Text>

          <View className="gap-3">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Full name"
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
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 2,
              }}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          {/* Role picker */}
          <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide mt-4 mb-2 ml-1">
            Role
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {ROLES.map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setRole(r.key)}
                className={`rounded-xl px-4 py-2.5 active:scale-[0.96] ${
                  role === r.key ? 'bg-primary' : 'bg-card'
                }`}
                style={
                  role !== r.key
                    ? {
                        shadowColor: '#000',
                        shadowOpacity: 0.03,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 1 },
                        elevation: 1,
                      }
                    : undefined
                }
              >
                <Text
                  className={`text-sm font-semibold ${
                    role === r.key ? 'text-white' : 'text-foreground'
                  }`}
                >
                  {r.label}
                </Text>
                <Text
                  className={`text-[10px] mt-0.5 ${
                    role === r.key ? 'text-white/70' : 'text-muted-foreground'
                  }`}
                >
                  {r.desc}
                </Text>
              </Pressable>
            ))}
          </View>

          <Pressable
            onPress={addInvite}
            className="bg-card rounded-2xl py-3.5 items-center mt-4 flex-row justify-center gap-2 active:scale-[0.97]"
            style={{
              shadowColor: '#000',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <UserPlusIcon size={16} className="text-primary" />
            <Text className="text-primary text-sm font-bold">Add to invite list</Text>
          </Pressable>
        </View>

        {/* Pending invites */}
        {invites.length > 0 && (
          <View className="px-5 mt-6">
            <View className="flex-row items-center gap-2 mb-3">
              <UsersIcon size={14} className="text-muted-foreground" />
              <Text className="text-foreground text-base font-bold">
                Pending Invites ({invites.length})
              </Text>
            </View>
            <View
              className="bg-card rounded-2xl overflow-hidden"
              style={{
                shadowColor: '#000',
                shadowOpacity: 0.04,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 },
                elevation: 3,
              }}
            >
              {invites.map((inv, i) => (
                <View
                  key={i}
                  className="flex-row items-center gap-3 px-4 py-3"
                  style={
                    i < invites.length - 1
                      ? { borderBottomWidth: 1, borderBottomColor: '#F0E8E2' }
                      : undefined
                  }
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: `${ROLE_COLORS[inv.role] || accent}18`,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: '700',
                        color: ROLE_COLORS[inv.role] || accent,
                      }}
                    >
                      {inv.name.charAt(0)}
                    </Text>
                  </View>
                  <View className="flex-1 min-w-0">
                    <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                      {inv.name}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-0.5">
                      <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                        {inv.email}
                      </Text>
                      <Text className="text-muted-foreground text-[10px]">·</Text>
                      <Text className="text-muted-foreground text-[10px] font-medium uppercase">
                        {inv.role}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => removeInvite(i)}
                    className="w-7 h-7 rounded-full bg-muted items-center justify-center active:scale-[0.90]"
                  >
                    <XIcon size={11} className="text-muted-foreground" />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Send button */}
      {invites.length > 0 && (
        <View className="absolute bottom-0 left-0 right-0 px-5 pb-10 pt-4 bg-background">
          <Pressable
            onPress={() => sendInvites.mutate()}
            className="bg-primary rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97]"
            disabled={sendInvites.isPending}
          >
            <SendIcon size={17} className="text-white" />
            <Text className="text-white text-base font-bold">
              {sendInvites.isPending
                ? 'Sending...'
                : `Send ${invites.length} Invite${invites.length > 1 ? 's' : ''}`}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
