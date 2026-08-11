import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  UsersIcon,
  BellIcon,
  BellOffIcon,
  PencilIcon,
  UserPlusIcon,
  LogOutIcon,
  Trash2Icon,
  CheckIcon,
  MailIcon,
  MapPinIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAddConversationMember,
  useAuth,
  useConversation,
  useDeleteConversation,
  useFriends,
  useLeaveConversation,
  useMuteConversation,
  useParticipants,
  useRenameConversation,
  useTheme,
} from '@/src/hooks';

for (const Icon of [
  ArrowLeftIcon, UsersIcon, BellIcon, BellOffIcon, PencilIcon, UserPlusIcon,
  LogOutIcon, Trash2Icon, CheckIcon, MailIcon, MapPinIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Mute durations, in minutes. A year stands in for "until I turn it back on". */
const MUTE_OPTIONS: { label: string; minutes: number }[] = [
  { label: '1 hour', minutes: 60 },
  { label: '8 hours', minutes: 480 },
  { label: '1 week', minutes: 60 * 24 * 7 },
  { label: 'Until I turn it back on', minutes: 525_600 },
];

function mutedUntilLabel(iso: string | null): string {
  if (!iso) return '';
  const until = new Date(iso);
  const days = (until.getTime() - Date.now()) / 86_400_000;
  if (days > 300) return 'Muted';
  if (until.toDateString() === new Date().toDateString()) {
    return `Muted until ${until.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }
  return `Muted until ${until.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`;
}

/**
 * Conversation info.
 *
 * The counterpart to the thread: who is in it, what it is called, whether it
 * interrupts you, and how to get out of it. Everything here writes to the
 * server — mute and delete are per-person, rename and add-member are shared.
 */
export default function ConversationInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { user } = useAuth();

  const { participants, isLoading } = useParticipants(id);
  const { conversation } = useConversation(id);
  const mute = useMuteConversation(id);
  const rename = useRenameConversation(id);
  const addMember = useAddConversationMember(id);
  const leave = useLeaveConversation();
  const remove = useDeleteConversation();

  const { friends } = useFriends({ status: 'accepted', limit: 100 });

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [muteOpen, setMuteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const isGroup = participants.length > 2 || !!conversation?.isGroup;
  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  const title = conversation?.title ?? (isGroup ? 'Group' : (others[0]?.name ?? 'Conversation'));
  const muted = !!conversation?.muted;

  /** Friends not already in this group. */
  const addable = useMemo(() => {
    const inside = new Set(participants.map((p) => p.id));
    return friends.filter((f) => f.friend_user_id && !inside.has(f.friend_user_id));
  }, [friends, participants]);

  const submitRename = () => {
    const next = titleDraft.trim();
    if (!next) return;
    rename.mutate(next, {
      onSuccess: () => setRenaming(false),
      onError: (err: any) =>
        Alert.alert('Could not rename', err?.message || 'Please try again.'),
    });
  };

  const applyMute = (minutes: number) => {
    setMuteOpen(false);
    mute.mutate(minutes, {
      onError: (err: any) =>
        Alert.alert('Could not change notifications', err?.message || 'Please try again.'),
    });
  };

  const confirmLeave = () => {
    Alert.alert(
      'Leave group',
      'You will stop receiving messages here. The conversation continues for everyone else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            leave.mutate(id, {
              // Back twice: past the thread as well, which no longer exists
              // for this account.
              onSuccess: () => router.replace('/(app)/(tabs)/chat'),
              onError: (err: any) =>
                Alert.alert('Could not leave', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete conversation',
      isGroup
        ? 'This removes the conversation and its history from your app, and leaves the group.'
        : 'This clears the conversation from your app. The other person keeps their copy, and a new message from them will start the thread again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(id, {
              onSuccess: () => router.replace('/(app)/(tabs)/chat'),
              onError: (err: any) =>
                Alert.alert('Could not delete', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  const border = isDark ? '#2A2522' : '#F0E8E2';
  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as const;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">
            {isGroup ? 'Group info' : 'Contact info'}
          </Text>
        </View>

        {/* Identity */}
        <View className="items-center px-5 mt-4">
          {isGroup ? (
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: '#5B7B9A18' }}
            >
              <UsersIcon size={32} color="#5B7B9A" />
            </View>
          ) : others[0]?.avatar_url ? (
            <Image
              source={{ uri: others[0].avatar_url }}
              style={{ width: 80, height: 80, borderRadius: 40 }}
            />
          ) : (
            <View
              className="w-20 h-20 rounded-full items-center justify-center"
              style={{ backgroundColor: '#B66A4018' }}
            >
              <Text style={{ color: '#B66A40', fontWeight: '700', fontSize: 30 }}>
                {title.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}

          {renaming ? (
            <View className="w-full mt-4">
              <TextInput
                value={titleDraft}
                onChangeText={setTitleDraft}
                placeholder="Group name"
                placeholderTextColor="#A89489"
                autoFocus
                className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base text-center"
                style={cardShadow}
              />
              <View className="flex-row gap-3 mt-3">
                <Pressable
                  onPress={() => setRenaming(false)}
                  className="flex-1 bg-muted rounded-2xl py-3 items-center active:scale-[0.97]"
                >
                  <Text className="text-foreground text-sm font-semibold">Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={submitRename}
                  disabled={rename.isPending || !titleDraft.trim()}
                  className="flex-[2] bg-primary rounded-2xl py-3 items-center flex-row justify-center gap-2 active:scale-[0.97]"
                >
                  {rename.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
                  <Text className="text-white text-sm font-bold">Save name</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              <Text className="text-foreground text-xl font-bold mt-3 text-center">
                {title}
              </Text>
              <Text className="text-muted-foreground text-sm mt-1">
                {isGroup
                  ? `${participants.length} member${participants.length === 1 ? '' : 's'}`
                  : (others[0]?.name ?? '')}
              </Text>
              {isGroup && (
                <Pressable
                  onPress={() => {
                    setTitleDraft(conversation?.title ?? '');
                    setRenaming(true);
                  }}
                  className="mt-3 flex-row items-center gap-1.5 bg-primary/10 rounded-xl px-3.5 py-2 active:scale-[0.96]"
                >
                  <PencilIcon size={12} className="text-primary" />
                  <Text className="text-primary text-xs font-bold">Rename group</Text>
                </Pressable>
              )}
            </>
          )}
        </View>

        {/* Notifications */}
        <View className="px-5 mt-7">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Notifications
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Pressable
              onPress={() => (muted ? applyMute(0) : setMuteOpen(true))}
              disabled={mute.isPending}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            >
              <View
                style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: muted ? '#A8948920' : '#B66A4014',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {muted ? (
                  <BellOffIcon size={15} color="#8B7355" />
                ) : (
                  <BellIcon size={15} color="#B66A40" />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  {muted ? 'Unmute' : 'Mute notifications'}
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {muted
                    ? mutedUntilLabel(conversation?.mutedUntil ?? null)
                    : 'Messages still arrive and still count as unread'}
                </Text>
              </View>
              {mute.isPending && <ActivityIndicator size="small" color="#B66A40" />}
            </Pressable>
          </View>
        </View>

        {/* Members */}
        <View className="px-5 mt-6">
          <View className="flex-row items-center justify-between mb-2 ml-1">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px]">
              {isGroup ? 'Members' : 'Contact'}
            </Text>
            {isGroup && (
              <Pressable
                onPress={() => setAddOpen(true)}
                className="flex-row items-center gap-1.5 active:opacity-60"
              >
                <UserPlusIcon size={13} className="text-primary" />
                <Text className="text-primary text-xs font-bold">Add</Text>
              </Pressable>
            )}
          </View>

          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            {isLoading && participants.length === 0 ? (
              <View className="py-6 items-center">
                <ActivityIndicator size="small" color="#B66A40" />
              </View>
            ) : (
              participants.map((p, i) => (
                <View
                  key={p.id}
                  className="px-4 py-3 flex-row items-center gap-3"
                  style={i < participants.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                >
                  {p.avatar_url ? (
                    <Image source={{ uri: p.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                  ) : (
                    <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                      <Text style={{ color: '#B66A40', fontWeight: '700' }}>
                        {p.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                    {p.name}
                  </Text>
                  {p.id === user?.id && (
                    <View className="rounded-full px-2 py-0.5 bg-muted">
                      <Text className="text-muted-foreground text-[10px] font-bold">YOU</Text>
                    </View>
                  )}
                </View>
              ))
            )}
          </View>
        </View>

        {/* Direct-chat shortcuts */}
        {!isGroup && others[0] && (
          <View className="px-5 mt-6">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Shortcuts
            </Text>
            <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
              <Pressable
                onPress={() => router.push('/(app)/(tabs)/network')}
                className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                style={{ borderBottomWidth: 1, borderBottomColor: border }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#6B8E4E14', alignItems: 'center', justifyContent: 'center' }}>
                  <MailIcon size={15} color="#6B8E4E" />
                </View>
                <Text className="text-foreground text-sm font-semibold flex-1">
                  Manage in Network
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/discover/nearby')}
                className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#5B7B9A14', alignItems: 'center', justifyContent: 'center' }}>
                  <MapPinIcon size={15} color="#5B7B9A" />
                </View>
                <Text className="text-foreground text-sm font-semibold flex-1">
                  See who is nearby
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Exits */}
        <View className="px-5 mt-6">
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            {isGroup && (
              <Pressable
                onPress={confirmLeave}
                className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                style={{ borderBottomWidth: 1, borderBottomColor: border }}
              >
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#A8948920', alignItems: 'center', justifyContent: 'center' }}>
                  <LogOutIcon size={15} color="#8B7355" />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">Leave group</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5">
                    Keeps the history on your device
                  </Text>
                </View>
              </Pressable>
            )}
            <Pressable
              onPress={confirmDelete}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#C76B4A14', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2Icon size={15} color="#C76B4A" />
              </View>
              <View className="flex-1">
                <Text className="text-destructive text-sm font-semibold">
                  Delete conversation
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {isGroup ? 'Clears the history and leaves' : 'Clears the history for you only'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Mute duration */}
      <Modal
        visible={muteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setMuteOpen(false)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setMuteOpen(false)}
        />
        <View className="bg-card rounded-t-3xl px-5 pt-5" style={{ paddingBottom: insets.bottom + 20 }}>
          <Text className="text-foreground text-lg font-bold">Mute for how long?</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Messages keep arriving and still count as unread. They just will not
            interrupt you.
          </Text>
          <View className="mt-4">
            {MUTE_OPTIONS.map((option, i) => (
              <Pressable
                key={option.minutes}
                onPress={() => applyMute(option.minutes)}
                className="py-3.5 active:opacity-60"
                style={i < MUTE_OPTIONS.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
              >
                <Text className="text-foreground text-base">{option.label}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setMuteOpen(false)}
            className="mt-4 bg-muted rounded-2xl py-3.5 items-center active:scale-[0.97]"
          >
            <Text className="text-foreground text-base font-semibold">Cancel</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Add members */}
      <Modal
        visible={addOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={() => setAddOpen(false)}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View className="bg-card rounded-t-3xl px-5 pt-5" style={{ paddingBottom: insets.bottom + 20 }}>
            <Text className="text-foreground text-lg font-bold">Add to group</Text>
            <Text className="text-muted-foreground text-sm mt-1">
              Only people you are friends with can be added.
            </Text>

            {addable.length === 0 ? (
              <Text className="text-muted-foreground text-sm text-center py-8">
                Everyone you are friends with is already in this group.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 320 }} className="mt-4">
                {addable.map((f, i) => (
                  <Pressable
                    key={f.id}
                    onPress={() =>
                      addMember.mutate(f.friend_user_id!, {
                        onSuccess: () => setAddOpen(false),
                        onError: (err: any) =>
                          Alert.alert('Could not add', err?.message || 'Please try again.'),
                      })
                    }
                    className="py-3 flex-row items-center gap-3 active:opacity-60"
                    style={i < addable.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                  >
                    <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                      <Text style={{ color: '#B66A40', fontWeight: '700' }}>
                        {f.friend_name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                      {f.friend_name}
                    </Text>
                    {addMember.isPending ? (
                      <ActivityIndicator size="small" color="#B66A40" />
                    ) : (
                      <CheckIcon size={15} className="text-muted-foreground" />
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Pressable
              onPress={() => setAddOpen(false)}
              className="mt-4 bg-muted rounded-2xl py-3.5 items-center active:scale-[0.97]"
            >
              <Text className="text-foreground text-base font-semibold">Done</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
