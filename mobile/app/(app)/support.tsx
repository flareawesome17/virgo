import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import {
  useOpenTicket,
  useReplyToTicket,
  useSupportThread,
  useSupportTickets,
} from '@/src/hooks';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  pending: 'Waiting on us',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * Contact support, from the phone.
 *
 * The API existed before anything could reach it — tickets could be answered
 * from the console but never raised. Threaded rather than a one-way form: a
 * request people cannot see the state of gets sent three more times.
 *
 * One screen holding both the list and the open thread, rather than a second
 * route. The thread is only ever reached from the list, and a stack entry for
 * it would put a back button where the phone's own gesture already goes.
 */
export default function SupportScreen() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: openId ? 'Request' : 'Support',
          headerBackTitle: 'Back',
        }}
      />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {openId ? (
          <Thread id={openId} onBack={() => setOpenId(null)} />
        ) : (
          <TicketList onOpen={setOpenId} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function TicketList({ onOpen }: { onOpen: (id: string) => void }) {
  const { tickets, isLoading, loadFailed, refetch } = useSupportTickets();
  const [composing, setComposing] = useState(false);

  return (
    <ScrollView contentContainerClassName="p-5 pb-16">
      <Pressable
        onPress={() => setComposing((v) => !v)}
        className="mb-4 items-center rounded-xl py-3"
        style={{ backgroundColor: '#B66A40' }}
      >
        <Text className="text-[14px] font-bold text-white">
          {composing ? 'Cancel' : 'New request'}
        </Text>
      </Pressable>

      {composing && <Compose onDone={() => setComposing(false)} />}

      {isLoading ? (
        <ActivityIndicator color="#B66A40" className="mt-10" />
      ) : loadFailed ? (
        <View className="mt-10 items-center">
          <Text className="text-[14px] font-semibold text-foreground">
            Could not load your requests
          </Text>
          <Text className="mt-1 text-center text-[12px] text-muted-foreground">
            This is a connection problem, not an empty list.
          </Text>
          <Pressable onPress={() => void refetch()} className="mt-3">
            <Text className="text-[13px] font-semibold" style={{ color: '#B66A40' }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : tickets.length === 0 ? (
        <View className="mt-10 items-center px-6">
          <Text className="text-[14px] font-semibold text-foreground">
            No requests yet
          </Text>
          <Text className="mt-1 text-center text-[12px] leading-5 text-muted-foreground">
            If something is broken or confusing, tell us — during the
            pre-release that is the most useful thing you can do.
          </Text>
        </View>
      ) : (
        <View className="gap-2">
          {tickets.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => onOpen(t.id)}
              className="flex-row items-center gap-3 rounded-xl border border-border p-4"
            >
              <View className="min-w-0 flex-1">
                <Text className="text-[14px] font-semibold text-foreground" numberOfLines={1}>
                  {t.subject}
                </Text>
                <Text className="mt-0.5 text-[11px] text-muted-foreground">
                  {t.messages ?? 0} message{(t.messages ?? 0) === 1 ? '' : 's'}
                </Text>
              </View>
              <View
                className="rounded-full px-2 py-1"
                style={{ backgroundColor: t.status === 'open' ? '#B66A40' : '#8882' }}
              >
                <Text
                  className="text-[10px] font-bold"
                  style={{ color: t.status === 'open' ? '#fff' : undefined }}
                >
                  {STATUS_LABEL[t.status] ?? t.status}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Compose({ onDone }: { onDone: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const open = useOpenTicket();
  const tooShort = body.trim().length < 10 || subject.trim().length < 3;

  return (
    <View className="mb-5 gap-3 rounded-xl border border-border p-4">
      <View className="gap-1.5">
        <Text className="text-[12px] font-semibold text-muted-foreground">
          What is this about?
        </Text>
        <TextInput
          value={subject}
          onChangeText={setSubject}
          maxLength={200}
          placeholder="Uploads failing on my wedding album"
          placeholderTextColor="#9ca3af"
          className="rounded-lg border border-border px-3 py-2.5 text-[14px] text-foreground"
        />
      </View>
      <View className="gap-1.5">
        <Text className="text-[12px] font-semibold text-muted-foreground">
          Tell us what happened
        </Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          numberOfLines={5}
          maxLength={5000}
          placeholder="What you were doing, what you expected, and what happened instead."
          placeholderTextColor="#9ca3af"
          className="min-h-24 rounded-lg border border-border px-3 py-2.5 text-[14px] text-foreground"
          style={{ textAlignVertical: 'top' }}
        />
      </View>
      {open.isError && (
        <Text className="text-[12px]" style={{ color: '#dc2626' }}>
          {open.error instanceof Error ? open.error.message : 'Could not send'}
        </Text>
      )}
      <Pressable
        disabled={open.isPending || tooShort}
        style={{ opacity: open.isPending || tooShort ? 0.5 : 1, backgroundColor: '#B66A40' }}
        className="items-center rounded-xl py-3"
        onPress={() => open.mutate({ subject, body }, { onSuccess: onDone })}
      >
        <Text className="text-[14px] font-bold text-white">
          {open.isPending ? 'Sending…' : 'Send request'}
        </Text>
      </Pressable>
    </View>
  );
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const { ticket, messages, isLoading, loadFailed } = useSupportThread(id);
  const reply = useReplyToTicket(id);
  const [body, setBody] = useState('');

  return (
    <View className="flex-1">
      <ScrollView contentContainerClassName="p-5 pb-4">
        <Pressable onPress={onBack} className="mb-4">
          <Text className="text-[13px] text-muted-foreground">← All requests</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color="#B66A40" className="mt-10" />
        ) : loadFailed ? (
          <Text className="mt-10 text-center text-[13px] text-muted-foreground">
            Could not load this conversation.
          </Text>
        ) : (
          <>
            <Text className="mb-4 text-[17px] font-bold text-foreground">
              {ticket?.subject}
            </Text>
            <View className="gap-3">
              {messages.map((m) => (
                <View
                  key={m.id}
                  className="rounded-xl border p-4"
                  style={{
                    borderColor: m.author_type === 'admin' ? '#B66A4055' : undefined,
                    backgroundColor:
                      m.author_type === 'admin' ? '#B66A400f' : undefined,
                  }}
                >
                  <Text className="mb-1 text-[11px] font-bold text-foreground">
                    {m.author_type === 'admin' ? 'Virgo Support' : 'You'}
                  </Text>
                  <Text className="text-[14px] leading-5 text-foreground">
                    {m.body}
                  </Text>
                  <Text className="mt-1.5 text-[10px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {!loadFailed && !isLoading && (
        <View className="flex-row items-end gap-2 border-t border-border p-3">
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            placeholder="Add to this request…"
            placeholderTextColor="#9ca3af"
            className="max-h-28 flex-1 rounded-xl border border-border px-3 py-2.5 text-[14px] text-foreground"
            style={{ textAlignVertical: 'top' }}
          />
          <Pressable
            disabled={reply.isPending || !body.trim()}
            style={{
              opacity: reply.isPending || !body.trim() ? 0.5 : 1,
              backgroundColor: '#B66A40',
            }}
            className="rounded-xl px-4 py-3"
            onPress={() => reply.mutate(body, { onSuccess: () => setBody('') })}
          >
            <Text className="text-[13px] font-bold text-white">Send</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
