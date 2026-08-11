import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { ArrowLeftIcon, MailIcon, UserIcon, CalendarDaysIcon, LogOutIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useTheme } from '@/src/hooks';

cssInterop(ArrowLeftIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(MailIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(UserIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(CalendarDaysIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
cssInterop(LogOutIcon, { className: { target: 'style', nativeStyleToProp: { color: true } } });

/**
 * Account details for the signed-in user.
 *
 * Everything shown here comes from GET /auth/me — nothing is hardcoded. The
 * settings row that linked here previously pointed at a screen that did not
 * exist and displayed a placeholder email.
 */
export default function AccountSettingsScreen() {
  const { isDark } = useTheme();
  const { user, session, signOut } = useAuth();

  const createdAt = session?.user?.createdAt
    ? new Date(session.user.createdAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () =>
          signOut.mutate(undefined, {
            onSuccess: () => router.replace('/(auth)/welcome'),
          }),
      },
    ]);
  };

  const rows = [
    { icon: MailIcon, label: 'Email', value: user?.email ?? '—', color: '#B66A40' },
    {
      icon: UserIcon,
      label: 'Display name',
      value: session?.user?.displayName || 'Not set',
      color: '#C17745',
    },
    ...(createdAt
      ? [{ icon: CalendarDaysIcon, label: 'Member since', value: createdAt, color: '#8B5E3C' }]
      : []),
  ];

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">Account</Text>
        </View>

        <View className="px-5 mt-5">
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            {rows.map((row, i) => {
              const Icon = row.icon;
              return (
                <View
                  key={row.label}
                  className="flex-row items-center gap-3 px-4 py-3.5"
                  style={i < rows.length - 1 ? { borderBottomWidth: 1, borderBottomColor: isDark ? '#2A2522' : '#F0E8E2' } : undefined}
                >
                  <View
                    style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: `${row.color}14`,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon size={15} color={row.color} />
                  </View>
                  <Text className="text-foreground text-sm font-semibold flex-1">{row.label}</Text>
                  <Text className="text-muted-foreground text-xs" numberOfLines={1}>
                    {row.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View className="px-5 mt-6">
          <Pressable
            onPress={handleSignOut}
            disabled={signOut.isPending}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center justify-center gap-2 active:scale-[0.98]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <LogOutIcon size={16} className="text-[#C76B4A]" />
            <Text className="text-[#C76B4A] text-sm font-bold">
              {signOut.isPending ? 'Signing out...' : 'Sign out'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
