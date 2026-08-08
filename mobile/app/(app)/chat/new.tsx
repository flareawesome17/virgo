import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, CheckIcon, UsersIcon, UserIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useCreateGroupChat,
  useFriends,
  useOpenDirectChat,
  useTheme,
} from '@/src/hooks';
import { LoadFailed } from '@/components/LoadFailed';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CheckIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UsersIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Starts a chat.
 *
 * Direct and group are one screen with a mode switch rather than two: the
 * choice is only "one person or several", and the friend list is identical.
 *
 * Only friends are listed — the API rejects anyone else, so offering them here
 * would just produce an error.
 */
export default function NewChatScreen() {
  const { isDark } = useTheme();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');

  const { friends, loadFailed, refetch } = useFriends({ status: 'accepted', limit: 100 });
  const openDirect = useOpenDirectChat();
  const createGroup = useCreateGroupChat();

  // Contacts predating real friendships have no account to chat with.
  const chattable = friends.filter((f) => f.friend_user_id);

  const toggle = (userId: string) => {
    if (mode === 'direct') {
      setSelected([userId]);
      return;
    }
    setSelected((prev) =>
      prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId],
    );
  };

  const switchMode = (next: 'direct' | 'group') => {
    setMode(next);
    // A direct chat takes exactly one person, so a multi-selection cannot
    // carry over.
    setSelected((prev) => (next === 'direct' ? prev.slice(0, 1) : prev));
  };

  const start = () => {
    if (selected.length === 0) {
      Alert.alert('Choose someone', 'Pick who you want to chat with.');
      return;
    }

    if (mode === 'direct') {
      openDirect.mutate(selected[0], {
        onSuccess: ({ id }) => router.replace(`/chat/${id}`),
        onError: (err: any) =>
          Alert.alert('Could not open chat', err?.message || 'Please try again.'),
      });
      return;
    }

    if (!title.trim()) {
      Alert.alert('Name the group', 'Give the group a name so people recognise it.');
      return;
    }
    createGroup.mutate(
      { title: title.trim(), memberIds: selected },
      {
        onSuccess: ({ id }) => router.replace(`/chat/${id}`),
        onError: (err: any) =>
          Alert.alert('Could not create group', err?.message || 'Please try again.'),
      },
    );
  };

  const busy = openDirect.isPending || createGroup.isPending;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
            <Pressable
              onPress={() => router.back()}
              className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            >
              <ArrowLeftIcon size={18} className="text-foreground" />
            </Pressable>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              New chat
            </Text>
          </View>

          {/* Mode */}
          <View className="px-5 mt-4">
            <View className="flex-row bg-muted rounded-2xl p-1">
              {(['direct', 'group'] as const).map((m) => {
                const on = mode === m;
                const Icon = m === 'direct' ? UserIcon : UsersIcon;
                return (
                  <Pressable
                    key={m}
                    onPress={() => switchMode(m)}
                    className={`flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-xl active:scale-[0.96] ${on ? 'bg-card' : ''}`}
                    style={on ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : undefined}
                  >
                    <Icon size={14} className={on ? 'text-primary' : 'text-muted-foreground'} />
                    <Text className={`text-sm font-semibold ${on ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {m === 'direct' ? 'One person' : 'Group'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {mode === 'group' && (
            <View className="px-5 mt-4">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                Group name
              </Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Reyes Wedding Team"
                placeholderTextColor="#A89489"
                className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              />
            </View>
          )}

          <View className="px-5 mt-5">
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              {mode === 'direct' ? 'Choose a friend' : `People (${selected.length})`}
            </Text>

            {loadFailed && chattable.length === 0 ? (
              <LoadFailed what="your friends" onRetry={() => refetch()} compact />
            ) : chattable.length === 0 ? (
              <Pressable
                onPress={() => router.push('/(app)/(tabs)/network')}
                className="bg-card rounded-2xl px-4 py-6 items-center active:scale-[0.98]"
              >
                <Text className="text-foreground text-sm font-semibold">No friends yet</Text>
                <Text className="text-muted-foreground text-xs mt-1 text-center">
                  You can only chat with people you are friends with.
                </Text>
                <Text className="text-primary text-xs font-bold mt-3">Find people</Text>
              </Pressable>
            ) : (
              <View
                className="bg-card rounded-2xl overflow-hidden"
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                {chattable.map((f, i) => {
                  const on = selected.includes(f.friend_user_id!);
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => toggle(f.friend_user_id!)}
                      className="px-4 py-3 flex-row items-center gap-3 active:bg-muted/30"
                      style={i < chattable.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                    >
                      <View className="w-10 h-10 rounded-full items-center justify-center" style={{ backgroundColor: '#B66A4018' }}>
                        <Text style={{ color: '#B66A40', fontWeight: '700' }}>
                          {f.friend_name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View className="flex-1 min-w-0">
                        <Text className="text-foreground text-sm font-semibold" numberOfLines={1}>
                          {f.friend_name}
                        </Text>
                        {f.friend_email ? (
                          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
                            {f.friend_email}
                          </Text>
                        ) : null}
                      </View>
                      {on && (
                        <View className="w-6 h-6 rounded-full bg-primary items-center justify-center">
                          <CheckIcon size={14} className="text-white" />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {chattable.length > 0 && (
          <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 pb-8 bg-background">
            <Pressable
              onPress={start}
              disabled={selected.length === 0 || busy}
              className={`rounded-2xl py-3.5 items-center flex-row justify-center gap-2 active:scale-[0.97] ${
                selected.length > 0 ? 'bg-primary' : 'bg-muted'
              }`}
            >
              {busy && <ActivityIndicator size="small" color="#FFFFFF" />}
              <Text className={`text-base font-bold ${selected.length > 0 ? 'text-white' : 'text-muted-foreground'}`}>
                {busy
                  ? 'Starting…'
                  : mode === 'direct'
                    ? 'Start chat'
                    : `Create group${selected.length > 0 ? ` (${selected.length})` : ''}`}
              </Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
