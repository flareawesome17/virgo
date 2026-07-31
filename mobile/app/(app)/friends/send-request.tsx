import { View, Text, ScrollView, Pressable, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateFriend } from '@/src/hooks';
import { router } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, SendIcon, UserPlusIcon, SearchIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SendIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserPlusIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(SearchIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function SendFriendRequestScreen() {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const sendRequest = useCreateFriend();

  const handleSend = () => {
    sendRequest.mutate(
      {
        friend_name: name.trim(),
        friend_email: email.trim() || null,
        status: 'pending',
        requested_by: 'me',
      },
      {
        onSuccess: () => setSent(true),
        onError: () => Alert.alert('Error', 'Could not send friend request.'),
      },
    );
  };

  const canSend = name.trim().length > 0;

  if (sent) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 bg-background">

        <View className="flex-1 px-5 justify-center items-center" style={{ paddingBottom: 60 }}>
          <View className="w-24 h-24 rounded-full bg-[#6B8E4E18] items-center justify-center mb-6"
            style={{ shadowColor: '#6B8E4E', shadowOpacity: 0.15, shadowRadius: 16, shadowOffset: { width: 0, height: 3 }, elevation: 5 }}>
            <UserPlusIcon size={40} style={{ color: '#6B8E4E' }} />
          </View>
          <Text className="text-foreground text-[26px] font-extrabold tracking-tight">Request Sent!</Text>
          <Text className="text-muted-foreground text-sm text-center mt-2 px-6">
            Your friend request to {name} has been sent. They’ll appear in your friends list once accepted.
          </Text>
          <View className="mt-8 flex-row gap-3">
            <Pressable onPress={() => { setName(''); setEmail(''); setSent(false); }}
              className="bg-card rounded-2xl px-6 py-3.5 active:scale-[0.96]" style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <Text className="text-foreground text-sm font-bold">Send Another</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/friends/requests')} className="bg-primary rounded-2xl px-6 py-3.5 active:scale-[0.96]">
              <Text className="text-white text-sm font-bold">View Requests</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      {/* Lifts the form above the keyboard. Without this the fields nearest
          the bottom sat underneath it on iOS with no way to scroll to them. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View>
            <Text className="text-foreground text-[22px] font-bold tracking-tight">Add Friend</Text>
            <Text className="text-muted-foreground text-sm mt-0.5">Send a friend request to collaborate</Text>
          </View>
        </View>

        <View className="px-5 mt-6 gap-4">
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">Full Name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="e.g. Maya Chen" placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" autoFocus
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
          </View>
          <View>
            <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
              Email <Text className="font-medium normal-case tracking-normal">(optional)</Text>
            </Text>
            <TextInput value={email} onChangeText={setEmail} placeholder="maya@studio.co" placeholderTextColor="#A89489"
              className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base" keyboardType="email-address" autoCapitalize="none"
              style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }} />
          </View>
        </View>

        <View className="mx-5 mt-6 bg-card rounded-2xl p-4 flex-row items-start gap-3"
          style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
          <MailIcon size={16} className="text-muted-foreground mt-0.5" />
          <View className="flex-1">
            <Text className="text-foreground text-sm font-semibold">How it works</Text>
            <Text className="text-muted-foreground text-xs mt-1.5 leading-relaxed">
              Your friend will receive a notification. Once they accept, they’ll appear in your friends list and you can invite them to albums and workspaces.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 px-5 pt-4 bg-background" style={{ paddingBottom: insets.bottom + 16 }}>
        <Pressable onPress={() => canSend && handleSend()}
          disabled={!canSend || sendRequest.isPending}
          className={`rounded-2xl py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.97] ${canSend ? 'bg-primary' : 'bg-muted'}`}
          style={canSend ? { shadowColor: '#B66A40', shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 4 } : undefined}>
          <SendIcon size={17} className={canSend ? 'text-white' : 'text-muted-foreground'} />
          <Text className={`text-base font-bold ${canSend ? 'text-white' : 'text-muted-foreground'}`}>
            {sendRequest.isPending ? 'Sending...' : 'Send Friend Request'}
          </Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
