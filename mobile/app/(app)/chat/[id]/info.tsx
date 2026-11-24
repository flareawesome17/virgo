import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { RemoteImage } from '@/components/RemoteImage';
import { BottomSheet } from '@/components/BottomSheet';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { goToTab } from '@/src/lib/navigation';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  BellIcon,
  BellOffIcon,
  PencilIcon,
  UserPlusIcon,
  LogOutIcon,
  Trash2Icon,
  MailIcon,
  FlagIcon,
  BanIcon,
  SearchIcon,
  UserIcon,
  CameraIcon,
  PinIcon,
  PlusIcon,
  ChevronRightIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAddConversationMember,
  useAuth,
  useConversation,
  useDeleteConversation,
  useLeaveConversation,
  useMuteConversation,
  useOpenDirectChat,
  useParticipants,
  useTheme,
} from '@/src/hooks';
import {
  GROUP_ABOUT_MAX,
  groupSubtitle,
  type GroupAddPolicy,
  type Participant,
} from '@/src/api';
import { useAllConnections } from '@/src/hooks/useFriends';
import { reportableMessageIds } from '@/src/hooks/useChat';
import { usePins, useRemoveMember, useSetAdmin, useUpdateGroup } from '@/src/hooks/useChatCrew';
import { LoadFailed } from '@/components/LoadFailed';
import { PersonSafetySheet, firstName, usePersonSafety } from '@/components/PersonSafetySheet';
import { ActionSheet, ChoiceSheet } from '@/components/WorkspaceBits';
import { PALETTES } from '@/theme';
import { ChatAvatar, isTeamChat } from '@/components/chat/ChatAvatar';
import { useChatToast } from '@/components/chat/ChatToast';
import { GroupMemberSheet, memberRoles, type MemberAction } from '@/components/chat/GroupMemberSheet';
import { useGroupPhotoEditor } from '@/components/chat/GroupPhoto';
import { requestInThread } from '@/components/chat/thread-requests';
import {
  MUTE_OPTIONS,
  chatError,
  firstNameOf,
  groupError,
  mutedUntilLabel,
} from '@/components/chat/chat-words';

for (const Icon of [
  ArrowLeftIcon, BellIcon, BellOffIcon, PencilIcon, UserPlusIcon,
  LogOutIcon, Trash2Icon, MailIcon, FlagIcon, BanIcon,
  SearchIcon, UserIcon, CameraIcon, PinIcon, PlusIcon, ChevronRightIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** A card, as the boards draw them. */
const CARD = 'bg-card rounded-[20px] border border-border/40 overflow-hidden';

const ADD_POLICY_OPTIONS: { value: GroupAddPolicy; label: string; description: string }[] = [
  { value: 'everyone', label: 'Everyone', description: 'Anyone here can add people they are connected with' },
  { value: 'admins', label: 'Admins', description: 'Only admins add people' },
];

/**
 * Conversation info.
 *
 * The counterpart to the thread: who is in it, what it is called, whether it
 * interrupts you, and how to get out of it. Everything here writes to the
 * server — mute and delete are per-person; a group's name, About, photo and
 * people are shared, and only its admins change them.
 */
export default function ConversationInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const palette = isDark ? PALETTES.dark : PALETTES.light;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useChatToast(insets.bottom + 16);
  const notify = toast.show;

  const {
    participants,
    isLoading,
    loadFailed: membersFailed,
    refetch: refetchMembers,
  } = useParticipants(id);
  const { conversation } = useConversation(id);
  const mute = useMuteConversation(id);
  const addMember = useAddConversationMember(id);
  const leave = useLeaveConversation();
  const remove = useDeleteConversation();
  const updateGroup = useUpdateGroup(id ?? '');
  const removeMember = useRemoveMember(id ?? '');
  const setAdmin = useSetAdmin(id ?? '');
  const openDirect = useOpenDirectChat();
  const photo = useGroupPhotoEditor(id ?? '', notify);
  const { pins } = usePins(id);

  const [addOpen, setAddOpen] = useState(false);
  // Only once the sheet is open: the whole list is a page per hundred people.
  const connections = useAllConnections({ enabled: addOpen });
  const [addSearch, setAddSearch] = useState('');
  /** The one being added, so only its row shows the spinner. */
  const [adding, setAdding] = useState<string | null>(null);

  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [aboutEditing, setAboutEditing] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [muteOpen, setMuteOpen] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  /** The group member whose menu is open. */
  const [memberFor, setMemberFor] = useState<Participant | null>(null);
  /** The group member being reported or blocked, from their menu. */
  const [safetyFor, setSafetyFor] = useState<Participant | null>(null);

  // The server's word first: a group with two members left is still a group.
  const isGroup = conversation?.isGroup ?? participants.length > 2;
  const others = useMemo(
    () => participants.filter((p) => p.id !== user?.id),
    [participants, user?.id],
  );
  const title = conversation?.title ?? (isGroup ? 'Group' : (others[0]?.name ?? 'Conversation'));
  const muted = !!conversation?.muted;
  const isAdmin = !!conversation?.isAdmin;
  const team = isTeamChat(conversation);
  // A team chat takes its workspace's name; the server refuses it on its own.
  const canRename = isGroup && isAdmin && !team;
  const canAdd = isGroup && ((conversation?.addPolicy ?? 'everyone') === 'everyone' || isAdmin);
  const about = conversation?.about?.trim() || null;
  const subtitle = conversation ? groupSubtitle(conversation) : null;
  /** Admins first, as the server sends them; kept in that order whatever arrives. */
  const people = useMemo(
    () => participants.slice().sort((a, b) => Number(!!b.is_admin) - Number(!!a.is_admin)),
    [participants],
  );

  // By account id: participants carry it, and a handle is often unpublished.
  // Blocking needs no navigation afterwards — the thread stays, frozen, and
  // the refreshed participants turn this row into Unblock.
  const direct = !isGroup ? (others[0] ?? null) : null;
  const directSafety = usePersonSafety({
    name: direct?.name ?? '',
    target: direct ? { userId: direct.id } : null,
    source: 'chat',
    blockId: direct?.block_id ?? null,
    // The latest messages between the two of you, as this phone has them.
    messages: () =>
      direct && user && id
        ? { conversationId: id, messageIds: reportableMessageIds(queryClient, id, [user.id, direct.id]) }
        : null,
  });
  const directFirst = firstName(direct?.name ?? '');

  /** Friends not already in this group, narrowed by the search. */
  const addable = useMemo(() => {
    const inside = new Set(participants.map((p) => p.id));
    const q = addSearch.trim().toLowerCase();
    return connections.friends.filter(
      (f) =>
        f.friend_user_id &&
        !inside.has(f.friend_user_id) &&
        (!q || f.friend_name.toLowerCase().includes(q)),
    );
  }, [connections.friends, participants, addSearch]);

  const submitRename = () => {
    const next = titleDraft.trim();
    if (!next) return;
    updateGroup.mutate(
      { title: next },
      {
        onSuccess: () => setRenaming(false),
        onError: (err) => notify(groupError(err)),
      },
    );
  };

  const submitAbout = () => {
    updateGroup.mutate(
      { about: aboutDraft.trim() || null },
      {
        onSuccess: () => setAboutEditing(false),
        onError: (err) => notify(groupError(err)),
      },
    );
  };

  const applyMute = (minutes: number) => {
    setMuteOpen(false);
    mute.mutate(minutes, {
      onError: (err) => Alert.alert('Could not change notifications', chatError(err)),
    });
  };

  /** Back to the chat, opening on search or the Pinned sheet. */
  const openInThread = (kind: 'search' | 'pins') => {
    if (!id) return;
    requestInThread(id, kind === 'pins' ? { kind: 'pins' } : { kind: 'search' });
    if (router.canGoBack()) router.back();
    else router.replace(`/chat/${id}`);
  };

  const onMemberAction = (action: MemberAction, p: Participant) => {
    const first = firstNameOf(p.name);
    switch (action) {
      case 'message':
        openDirect.mutate(p.id, {
          onSuccess: ({ id: chatId }) => router.push(`/chat/${chatId}`),
          onError: (err) => notify(chatError(err)),
        });
        return;
      case 'profile':
        if (p.handle) router.push(`/u/${p.handle}`);
        return;
      case 'admin':
        setAdmin.mutate(
          { userId: p.id, admin: !p.is_admin },
          {
            onSuccess: () => notify(p.is_admin ? `${first} is no longer an admin` : `${first} is an admin now`),
            onError: (err) => notify(groupError(err)),
          },
        );
        return;
      case 'remove':
        removeMember.mutate(p.id, {
          onSuccess: () => notify(`${first} was removed from the group`),
          onError: (err) => notify(groupError(err)),
        });
        return;
      case 'report':
        setSafetyFor(p);
        return;
    }
  };

  const confirmLeave = () => {
    // Said plainly: leaving takes the group and its history out of your app.
    // The row used to promise the history would stay, and then the thread
    // could not be opened at all.
    Alert.alert(
      'Leave group?',
      "You'll stop getting its messages, and the group and its history will be removed from your chats. It carries on for everyone else.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            leave.mutate(id, {
              // Back twice: past the thread as well, which no longer exists
              // for this account.
              onSuccess: () => router.dismissTo('/(app)/(tabs)/connect?view=messages'),
              onError: (err) => Alert.alert('Could not leave', groupError(err)),
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
              onSuccess: () => router.dismissTo('/(app)/(tabs)/connect?view=messages'),
              onError: (err) => Alert.alert('Could not delete', chatError(err)),
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

  const renameForm = (
    <View className="w-full mt-4">
      <TextInput
        value={titleDraft}
        onChangeText={setTitleDraft}
        placeholder="Group name"
        placeholderTextColor={palette.mutedForeground}
        accessibilityLabel="Group name"
        autoFocus
        className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base text-center"
        style={cardShadow}
      />
      <View className="flex-row gap-3 mt-3">
        <Pressable
          onPress={() => setRenaming(false)}
          accessibilityRole="button"
          className="flex-1 bg-muted rounded-2xl py-3 items-center active:scale-[0.97]"
        >
          <Text className="text-foreground text-sm font-semibold">Cancel</Text>
        </Pressable>
        <Pressable
          onPress={submitRename}
          disabled={updateGroup.isPending || !titleDraft.trim()}
          accessibilityRole="button"
          className="flex-[2] bg-action rounded-2xl py-3 items-center flex-row justify-center gap-2 active:scale-[0.97]"
        >
          {updateGroup.isPending && <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text className="text-action-foreground text-sm font-bold">Save name</Text>
        </Pressable>
      </View>
    </View>
  );

  /** One of the three tiles under About. */
  const tile = (
    label: string,
    Icon: LucideIcon,
    onPress: () => void,
    a11y?: string,
    busy = false,
  ) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      className="flex-1 h-[68px] rounded-2xl bg-card border border-border/40 items-center justify-center gap-1 active:bg-muted/40"
    >
      {busy ? <ActivityIndicator size="small" /> : <Icon size={20} className="text-foreground" />}
      <Text className="text-foreground text-[13px] font-semibold" numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable accessibilityRole="button" accessibilityLabel="Back"
            onPress={() => router.back()}
            className="w-11 h-11 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">
            {isGroup ? 'Group info' : 'Contact info'}
          </Text>
        </View>

        {isGroup ? (
          <>
            {/* The photo (admins change it), the name (admins rename it,
                except a team chat's), and what made the group. */}
            <View className="items-center px-5 mt-3">
              <View style={{ width: 88, height: 88 }}>
                <ChatAvatar name={title} url={conversation?.avatarUrl} size={88} group square={team} />
                {photo.busy ? (
                  <View
                    className="absolute inset-0 items-center justify-center bg-background/60"
                    style={{ borderRadius: team ? 25 : 44 }}
                  >
                    <ActivityIndicator size="small" />
                  </View>
                ) : null}
                {isAdmin ? (
                  <Pressable
                    onPress={() => setPhotoMenuOpen(true)}
                    disabled={photo.busy}
                    accessibilityRole="button"
                    accessibilityLabel="Change the group photo"
                    className="absolute -right-1 -bottom-1 w-9 h-9 rounded-full bg-card border border-border/40 items-center justify-center active:opacity-70"
                  >
                    <CameraIcon size={17} className="text-foreground" />
                  </Pressable>
                ) : null}
              </View>

              {renaming ? (
                renameForm
              ) : (
                <Pressable
                  onPress={() => {
                    setTitleDraft(conversation?.title ?? '');
                    setRenaming(true);
                  }}
                  disabled={!canRename}
                  accessibilityRole={canRename ? 'button' : 'header'}
                  accessibilityLabel={canRename ? `${title}. Rename the group` : title}
                  className="mt-3.5 flex-row items-center justify-center gap-1.5 max-w-full active:opacity-70"
                >
                  <Text
                    className="text-foreground text-[24px] leading-[30px] font-bold tracking-tight text-center"
                    numberOfLines={2}
                    style={{ flexShrink: 1 }}
                  >
                    {title}
                  </Text>
                  {canRename ? <PencilIcon size={15} className="text-muted-foreground" /> : null}
                </Pressable>
              )}
              {subtitle ? (
                <Text className="text-muted-foreground text-[13px] leading-[18px] mt-1 text-center">
                  {subtitle}
                </Text>
              ) : null}
            </View>

            <View className="px-5 mt-5 gap-4">
              {/* About: the one line everyone sees at the top of info. */}
              {aboutEditing ? (
                <View className={`${CARD} p-3.5`}>
                  <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">About</Text>
                  <TextInput
                    value={aboutDraft}
                    onChangeText={setAboutDraft}
                    placeholder="The date, the place, where call sheets go"
                    placeholderTextColor={palette.mutedForeground}
                    accessibilityLabel="About this group"
                    maxLength={GROUP_ABOUT_MAX}
                    multiline
                    autoFocus
                    textAlignVertical="top"
                    className="text-foreground text-[15px] leading-[21px] mt-1 min-h-[64px]"
                  />
                  <Text className="text-muted-foreground text-[12px] text-right" style={{ fontVariant: ['tabular-nums'] }}>
                    {aboutDraft.length}/{GROUP_ABOUT_MAX}
                  </Text>
                  <View className="flex-row gap-3 mt-2">
                    <Pressable
                      onPress={() => setAboutEditing(false)}
                      accessibilityRole="button"
                      className="flex-1 h-11 bg-muted rounded-[14px] items-center justify-center active:opacity-70"
                    >
                      <Text className="text-foreground text-[15px] font-semibold">Cancel</Text>
                    </Pressable>
                    <Pressable
                      onPress={submitAbout}
                      disabled={updateGroup.isPending}
                      accessibilityRole="button"
                      className="flex-1 h-11 bg-action rounded-[14px] flex-row gap-2 items-center justify-center active:opacity-80"
                    >
                      {updateGroup.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
                      <Text className="text-action-foreground text-[15px] font-semibold">Save</Text>
                    </Pressable>
                  </View>
                </View>
              ) : about || isAdmin ? (
                <Pressable
                  onPress={() => {
                    setAboutDraft(about ?? '');
                    setAboutEditing(true);
                  }}
                  disabled={!isAdmin}
                  accessibilityRole={isAdmin ? 'button' : 'text'}
                  accessibilityLabel={`About. ${about ?? 'Nothing yet'}`}
                  accessibilityHint={isAdmin ? 'Changes what everyone here sees' : undefined}
                  className={`${CARD} p-3.5 flex-row items-start gap-3 active:bg-muted/40`}
                >
                  <View className="flex-1 min-w-0 gap-0.5">
                    <Text className="text-muted-foreground text-[13px] leading-[18px] font-semibold">About</Text>
                    <Text
                      className={`text-[15px] leading-[21px] ${about ? 'text-foreground' : 'text-muted-foreground'}`}
                    >
                      {about ?? 'Add a line everyone here sees: the date, the place, where call sheets go.'}
                    </Text>
                  </View>
                  {isAdmin ? <PencilIcon size={17} className="text-muted-foreground mt-0.5" /> : null}
                </Pressable>
              ) : null}

              <View className="flex-row gap-2">
                {tile('Search', SearchIcon, () => openInThread('search'), 'Search this chat')}
                {tile(
                  muted ? 'Muted' : 'Mute',
                  muted ? BellOffIcon : BellIcon,
                  () => (muted ? applyMute(0) : setMuteOpen(true)),
                  muted ? `Muted. ${mutedUntilLabel(conversation?.mutedUntil ?? null)}. Unmute` : 'Mute',
                  mute.isPending,
                )}
                {tile(
                  pins.length > 0 ? `Pinned ${pins.length}` : 'Pinned',
                  PinIcon,
                  () => openInThread('pins'),
                  `Pinned, ${pins.length}`,
                )}
              </View>
            </View>

            {/* People, admins first. */}
            <View className="px-5 mt-6">
              <Text accessibilityRole="header" className="text-foreground text-[17px] leading-6 font-bold mb-3">
                {participants.length > 0
                  ? `${participants.length} ${participants.length === 1 ? 'person' : 'people'}`
                  : 'People'}
              </Text>
              <View className={CARD}>
                {canAdd ? (
                  <Pressable
                    onPress={() => {
                      setAddSearch('');
                      setAddOpen(true);
                    }}
                    accessibilityRole="button"
                    className="min-h-[56px] px-3.5 flex-row items-center gap-3 active:bg-muted/40"
                  >
                    <View className="w-10 h-10 rounded-full bg-primary/10 items-center justify-center">
                      <PlusIcon size={18} className="text-primary" />
                    </View>
                    <Text className="text-primary text-[15px] font-semibold">Add people</Text>
                  </Pressable>
                ) : null}
                {isLoading && participants.length === 0 ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator size="small" color={palette.primary} />
                  </View>
                ) : membersFailed && participants.length === 0 ? (
                  // An empty card read as a group with nobody in it.
                  <LoadFailed what="the people here" onRetry={() => void refetchMembers()} compact />
                ) : (
                  people.map((p, i) => {
                    const me = p.id === user?.id;
                    const roles = memberRoles(p);
                    return (
                      <Pressable
                        key={p.id}
                        disabled={me}
                        onPress={me ? undefined : () => setMemberFor(p)}
                        accessibilityRole={me ? undefined : 'button'}
                        // A label replaces what the row contains, so the chips
                        // are only heard if the label says them too.
                        accessibilityLabel={[
                          me ? 'You' : p.name,
                          roles || null,
                          p.is_admin ? 'admin' : null,
                          p.blocked_by_me ? 'blocked' : null,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                        accessibilityHint={me ? undefined : 'Shows what you can do'}
                        className={`min-h-[56px] px-3.5 py-2 flex-row items-center gap-3 active:bg-muted/40 ${
                          i > 0 || canAdd ? 'border-t border-border/30' : ''
                        }`}
                      >
                        <ChatAvatar name={p.name} url={p.avatar_url} size={40} />
                        <View className="flex-1 min-w-0">
                          <Text className="text-foreground text-[15px] leading-5 font-semibold" numberOfLines={1}>
                            {me ? 'You' : p.name}
                          </Text>
                          {roles ? (
                            <Text className="text-muted-foreground text-[13px] leading-[18px]" numberOfLines={1}>
                              {roles}
                            </Text>
                          ) : null}
                        </View>
                        {p.blocked_by_me ? (
                          <View className="rounded-full px-2 py-0.5 bg-destructive/10">
                            <Text className="text-destructive text-[11px] font-bold">Blocked</Text>
                          </View>
                        ) : null}
                        {p.is_admin ? (
                          <View className="rounded-full px-2.5 py-[3px] bg-muted">
                            <Text className="text-secondary-foreground text-[12px] font-bold">Admin</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })
                )}
              </View>
            </View>

            {/* Who can add people (admins), then the ways out. */}
            <View className="px-5 mt-6">
              <View className={CARD}>
                {isAdmin ? (
                  <Pressable
                    onPress={() => setPolicyOpen(true)}
                    disabled={updateGroup.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Who can add people: ${
                      (conversation?.addPolicy ?? 'everyone') === 'admins' ? 'Admins' : 'Everyone'
                    }`}
                    className="min-h-[52px] px-3.5 flex-row items-center gap-3 border-b border-border/30 active:bg-muted/40"
                  >
                    <Text className="flex-1 text-foreground text-[15px]">Who can add people</Text>
                    <Text className="text-secondary-foreground text-[15px] font-semibold">
                      {(conversation?.addPolicy ?? 'everyone') === 'admins' ? 'Admins' : 'Everyone'}
                    </Text>
                    <ChevronRightIcon size={16} className="text-muted-foreground" />
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={confirmLeave}
                  accessibilityRole="button"
                  className="min-h-[52px] px-3.5 py-2.5 flex-row items-center gap-3 border-b border-border/30 active:bg-muted/40"
                >
                  <LogOutIcon size={17} className="text-foreground" />
                  <View className="flex-1">
                    <Text className="text-foreground text-[15px]">Leave group</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">
                      Removes the group and its history from your chats
                    </Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={confirmDelete}
                  accessibilityRole="button"
                  className="min-h-[52px] px-3.5 py-2.5 flex-row items-center gap-3 active:bg-muted/40"
                >
                  <Trash2Icon size={17} className="text-destructive" />
                  <View className="flex-1">
                    <Text className="text-destructive text-[15px]">Delete conversation</Text>
                    <Text className="text-muted-foreground text-xs mt-0.5">Clears the history and leaves</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <>
            {/* Identity */}
            <View className="items-center px-5 mt-4">
              {others[0]?.avatar_url ? (
                <RemoteImage
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
              <Text className="text-foreground text-xl font-bold mt-3 text-center">{title}</Text>
              <Text className="text-muted-foreground text-sm mt-1">{others[0]?.name ?? ''}</Text>
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
                  accessibilityRole="button"
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
                        : 'No sounds, banners or badge from this chat'}
                    </Text>
                  </View>
                  {mute.isPending && <ActivityIndicator size="small" color="#B66A40" />}
                </Pressable>
              </View>
            </View>

            {/* The contact */}
            <View className="px-5 mt-6">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                Contact
              </Text>
              <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                {isLoading && participants.length === 0 ? (
                  <View className="py-6 items-center">
                    <ActivityIndicator size="small" color="#B66A40" />
                  </View>
                ) : membersFailed && participants.length === 0 ? (
                  <LoadFailed what="the members" onRetry={() => void refetchMembers()} compact />
                ) : (
                  participants.map((p, i) => (
                    <View
                      key={p.id}
                      className="px-4 py-3 flex-row items-center gap-3"
                      style={i < participants.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                    >
                      <ChatAvatar name={p.name} url={p.avatar_url} size={40} />
                      <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                        {p.name}
                      </Text>
                      {p.id === user?.id && (
                        <View className="rounded-full px-2 py-0.5 bg-muted">
                          <Text className="text-muted-foreground text-[10px] font-bold">YOU</Text>
                        </View>
                      )}
                      {p.blocked_by_me && (
                        <View className="rounded-full px-2 py-0.5 bg-destructive/10">
                          <Text className="text-destructive text-[10px] font-bold">Blocked</Text>
                        </View>
                      )}
                    </View>
                  ))
                )}
              </View>
            </View>

            {/* Direct-chat shortcuts */}
            {others[0] && (
              <View className="px-5 mt-6">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                  Shortcuts
                </Text>
                <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                  {/* Their profile, the obvious next stop from a chat — which was
                      missing while "who is nearby", unrelated to this person, sat
                      here. Only when they have a public page to open. */}
                  {others[0].handle ? (
                    <Pressable
                      onPress={() => router.push(`/u/${others[0].handle}`)}
                      accessibilityRole="button"
                      className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                      style={{ borderBottomWidth: 1, borderBottomColor: border }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#B66A4014', alignItems: 'center', justifyContent: 'center' }}>
                        <UserIcon size={15} color="#A85D35" />
                      </View>
                      <Text className="text-foreground text-sm font-semibold flex-1">
                        View profile
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => goToTab('/(app)/(tabs)/connect?view=people')}
                    accessibilityRole="button"
                    className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                  >
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#6B8E4E14', alignItems: 'center', justifyContent: 'center' }}>
                      <MailIcon size={15} color="#6B8E4E" />
                    </View>
                    <Text className="text-foreground text-sm font-semibold flex-1">
                      Your connections
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Safety, for a direct chat. Its own card rather than a place in
                Exits: blocking keeps the conversation, so it is not a way out of
                it, and reporting has nothing to do with leaving. */}
            {direct && (
              <View className="px-5 mt-6">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                  Safety
                </Text>
                <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                  <Pressable
                    onPress={directSafety.openReport}
                    accessibilityRole="button"
                    className="px-4 py-3.5 flex-row items-center gap-3 border-b border-muted active:bg-muted/30"
                  >
                    <View className="w-8 h-8 rounded-[10px] bg-muted items-center justify-center">
                      <FlagIcon size={15} className="text-foreground" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-sm font-semibold">
                        Report {directFirst}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {"Tell us something's wrong. They won't know."}
                      </Text>
                    </View>
                  </Pressable>
                  {direct.blocked_by_me ? (
                    <Pressable
                      onPress={directSafety.confirmUnblock}
                      disabled={directSafety.pending}
                      accessibilityRole="button"
                      className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                    >
                      <View className="w-8 h-8 rounded-[10px] bg-muted items-center justify-center">
                        <BanIcon size={15} className="text-foreground" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-sm font-semibold">
                          Unblock {directFirst}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          You’ll be able to message each other in this chat again.
                        </Text>
                      </View>
                      {directSafety.pending && <ActivityIndicator size="small" color={palette.primary} />}
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={directSafety.confirmBlock}
                      disabled={directSafety.pending}
                      accessibilityRole="button"
                      className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                    >
                      <View className="w-8 h-8 rounded-[10px] bg-destructive/10 items-center justify-center">
                        <BanIcon size={15} className="text-destructive" />
                      </View>
                      <View className="flex-1">
                        <Text className="text-destructive text-sm font-semibold">
                          Block {directFirst}
                        </Text>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {"They can't message you or find you. They won't be told."}
                        </Text>
                      </View>
                      {directSafety.pending && <ActivityIndicator size="small" color={palette.destructive} />}
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Exits */}
            <View className="px-5 mt-6">
              <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                <Pressable
                  onPress={confirmDelete}
                  accessibilityRole="button"
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
                      Clears the history for you only
                    </Text>
                  </View>
                </Pressable>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Mute duration */}
      <BottomSheet visible={muteOpen} onClose={() => setMuteOpen(false)}>
        <View className="px-5 pt-2 pb-5">
          <Text className="text-foreground text-lg font-bold">Mute for how long?</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Messages keep arriving and wait in the chat. They just will not
            sound, show a banner or add to the badge.
          </Text>
          <View className="mt-4">
            {MUTE_OPTIONS.map((option, i) => (
              <Pressable
                key={option.minutes}
                onPress={() => applyMute(option.minutes)}
                accessibilityRole="button"
                className="py-3.5 min-h-[48px] justify-center active:opacity-60"
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
      </BottomSheet>

      {/* Add members */}
      <BottomSheet visible={addOpen} onClose={() => setAddOpen(false)}>
        <View className="px-5 pt-2 pb-5">
          <Text className="text-foreground text-lg font-bold">Add to group</Text>
          <Text className="text-muted-foreground text-sm mt-1">
            Only people you are friends with can be added.
          </Text>

          {connections.friends.length > 8 && (
            <View className="mt-4 flex-row items-center bg-secondary rounded-xl px-4 h-11 gap-3">
              <SearchIcon size={15} className="text-muted-foreground" />
              <TextInput
                value={addSearch}
                onChangeText={setAddSearch}
                placeholder="Search your connections"
                placeholderTextColor={palette.mutedForeground}
                accessibilityLabel="Search your connections"
                autoCorrect={false}
                className="text-foreground text-sm flex-1"
              />
            </View>
          )}

          {/* Loading and failure first: "everyone is already in this group"
              showed while the list was still on its way. */}
          {connections.loading ? (
            <View className="py-8 items-center">
              <ActivityIndicator size="small" color={palette.primary} />
            </View>
          ) : connections.loadFailed && connections.friends.length === 0 ? (
            <View className="mt-4">
              <LoadFailed what="your connections" onRetry={() => void connections.refetch()} compact />
            </View>
          ) : addable.length === 0 ? (
            <Text className="text-muted-foreground text-sm text-center py-8">
              {addSearch.trim()
                ? `No connections match “${addSearch.trim()}”.`
                : 'Everyone you are connected with is already in this group.'}
            </Text>
          ) : (
            <ScrollView style={{ maxHeight: 320 }} className="mt-4" keyboardShouldPersistTaps="handled">
              {addable.map((f, i) => (
                <Pressable
                  key={f.id}
                  disabled={adding !== null}
                  onPress={() => {
                    setAdding(f.friend_user_id!);
                    addMember.mutate(f.friend_user_id!, {
                      onSuccess: () => setAddOpen(false),
                      onError: (err) => Alert.alert('Could not add', groupError(err)),
                      onSettled: () => setAdding(null),
                    });
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${f.friend_name}`}
                  className="py-3 min-h-[48px] flex-row items-center gap-3 active:opacity-60"
                  style={i < addable.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                >
                  <ChatAvatar name={f.friend_name} size={36} />
                  <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                    {f.friend_name}
                  </Text>
                  {adding === f.friend_user_id ? (
                    <ActivityIndicator size="small" color="#B66A40" />
                  ) : (
                    <UserPlusIcon size={15} className="text-primary" />
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
      </BottomSheet>

      {/* The group photo: choose one, or take it off. The menu is the confirmation. */}
      <ActionSheet
        visible={photoMenuOpen}
        title="Group photo"
        actions={[
          { label: conversation?.avatarUrl ? 'Choose a new photo' : 'Choose a photo', onPress: () => void photo.choose() },
          ...(conversation?.avatarUrl
            ? [{ label: 'Remove photo', destructive: true, onPress: photo.remove }]
            : []),
        ]}
        onClose={() => setPhotoMenuOpen(false)}
      />

      <ChoiceSheet
        visible={policyOpen}
        title="Who can add people"
        hint="Admins can always add and remove people."
        options={ADD_POLICY_OPTIONS}
        value={conversation?.addPolicy ?? 'everyone'}
        onChoose={(addPolicy) => {
          if (addPolicy === (conversation?.addPolicy ?? 'everyone')) return;
          updateGroup.mutate({ addPolicy }, { onError: (err) => notify(groupError(err)) });
        }}
        onClose={() => setPolicyOpen(false)}
      />

      <GroupMemberSheet
        member={memberFor}
        iAmAdmin={isAdmin}
        onClose={() => setMemberFor(null)}
        onAction={onMemberAction}
      />

      {directSafety.sheets}

      {/* Report or block, from a member's menu. */}
      <PersonSafetySheet
        visible={!!safetyFor}
        onClose={() => setSafetyFor(null)}
        name={safetyFor?.name ?? ''}
        target={safetyFor ? { userId: safetyFor.id } : null}
        source="chat"
        blockId={safetyFor?.block_id ?? null}
      />

      {toast.element}
    </SafeAreaView>
  );
}
