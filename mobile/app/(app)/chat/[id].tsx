import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ArrowLeftIcon, SendIcon, UsersIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useLeaveConversation,
  useMarkThreadRead,
  useParticipants,
  useSendMessage,
  useTheme,
  useThread,
} from '@/src/hooks';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * One conversation.
 *
 * The list is inverted rather than scrolled to the end: an inverted FlatList
 * keeps the newest message pinned as items arrive, without a scroll call that
 * fights the user when they are reading history.
 */
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { isDark } = useTheme();
  const { user } = useAuth();

  const { messages, isLoading } = useThread(id);
  const { participants } = useParticipants(id);
  const send = useSendMessage(id);
  const markRead = useMarkThreadRead();
  const leave = useLeaveConversation();

  const [draft, setDraft] = useState('');

  // Opening the thread is what marks it read, and again whenever new messages
  // land while it is on screen.
  useEffect(() => {
    if (id && messages.length > 0) markRead.mutate(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length]);

  const isGroup = participants.length > 2;
  const title = isGroup
    ? `${participants.length} people`
    : (participants.find((p) => p.id !== user?.id)?.name ?? 'Conversation');

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending) return;
    setDraft('');
    send.mutate(body, {
      onError: (err: any) => {
        // Put the text back rather than losing it to a failed request.
        setDraft(body);
        Alert.alert('Could not send', err?.message || 'Please try again.');
      },
    });
  };

  const confirmLeave = () => {
    Alert.alert(
      'Leave conversation',
      'You will stop receiving messages here. The conversation continues for everyone else.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () =>
            leave.mutate(id, {
              onSuccess: () => router.back(),
              onError: (err: any) =>
                Alert.alert('Could not leave', err?.message || 'Please try again.'),
            }),
        },
      ],
    );
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={insets.top}
      >
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center gap-3 border-b" style={{ borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' }}>
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-base font-bold" numberOfLines={1}>
              {title}
            </Text>
            {isGroup && (
              <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                {participants.map((p) => p.name).join(', ')}
              </Text>
            )}
          </View>
          {isGroup && (
            <Pressable
              onPress={confirmLeave}
              className="px-3 py-2 rounded-xl bg-muted active:scale-[0.94]"
            >
              <Text className="text-muted-foreground text-xs font-bold">Leave</Text>
            </Pressable>
          )}
        </View>

        {isLoading && messages.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#B66A40" />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            inverted
            contentContainerStyle={{ padding: 16, gap: 8 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const mine = item.sender_id === user?.id;
              return (
                <View className={mine ? 'items-end' : 'items-start'}>
                  {/* Only groups need the sender's name; in a direct chat the
                      side of the bubble already says who sent it. */}
                  {isGroup && !mine && (
                    <Text className="text-muted-foreground text-[11px] mb-0.5 ml-1">
                      {item.sender_name}
                    </Text>
                  )}
                  <View
                    className={`rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-primary' : 'bg-card'}`}
                    style={{ maxWidth: '80%' }}
                  >
                    <Text className={`text-sm ${mine ? 'text-white' : 'text-foreground'}`}>
                      {item.body}
                    </Text>
                    <Text
                      className={`text-[10px] mt-1 ${mine ? 'text-white/60' : 'text-muted-foreground'}`}
                    >
                      {timeLabel(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View className="items-center pt-16" style={{ transform: [{ scaleY: -1 }] }}>
                <UsersIcon size={26} className="text-muted-foreground" />
                <Text className="text-muted-foreground text-sm mt-3">
                  No messages yet. Say hello.
                </Text>
              </View>
            }
          />
        )}

        {/* Composer */}
        <View
          className="px-4 pt-2 flex-row items-end gap-2 border-t bg-background"
          style={{ paddingBottom: insets.bottom + 8, borderTopColor: isDark ? '#2A2522' : '#F0E8E2' }}
        >
          <View className="flex-1 bg-card rounded-2xl px-4 py-2.5">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor="#A89489"
              multiline
              className="text-foreground text-sm"
              style={{ maxHeight: 100 }}
            />
          </View>
          <Pressable
            onPress={submit}
            disabled={!draft.trim() || send.isPending}
            className={`w-11 h-11 rounded-full items-center justify-center active:scale-[0.94] ${
              draft.trim() ? 'bg-primary' : 'bg-muted'
            }`}
          >
            {send.isPending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <SendIcon size={17} className={draft.trim() ? 'text-white' : 'text-muted-foreground'} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
