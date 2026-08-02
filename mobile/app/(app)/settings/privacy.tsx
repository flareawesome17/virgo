import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  SearchIcon,
  MapPinIcon,
  BellIcon,
  ChevronRightIcon,
  ShieldCheckIcon,
  Trash2Icon,
  FileTextIcon,
  PauseCircleIcon,
  UserXIcon,
  EyeIcon,
  EyeOffIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  useAuth,
  useLocationSharing,
  useShareLocation,
  useStopSharingLocation,
  useTheme,
} from '@/src/hooks';
import { api } from '@/src/api/client';
import {
  ensurePermissions,
  getPushRegistration,
  isRemotePushAvailable,
} from '@/src/lib/notifications';

for (const Icon of [
  ArrowLeftIcon, SearchIcon, MapPinIcon, BellIcon, ChevronRightIcon,
  ShieldCheckIcon, Trash2Icon, FileTextIcon, PauseCircleIcon, UserXIcon,
  EyeIcon, EyeOffIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/** Offered pause lengths. A free-text field invites typos on a one-way door. */
const PAUSE_OPTIONS = [7, 14, 30, 90] as const;

/**
 * Privacy.
 *
 * Only controls that actually do something: each toggle maps to a value the
 * server reads. The row used to carry a "Soon" badge because there was
 * nothing behind it — the alternative to this screen is that badge, not a
 * longer list of switches that go nowhere.
 */
export default function PrivacyScreen() {
  const { isDark } = useTheme();
  const { profile, updateProfile, disableAccount, deleteAccount } = useAuth();

  /** Which closing action is being confirmed, if any. */
  const [closing, setClosing] = useState<'pause' | 'delete' | null>(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pauseDays, setPauseDays] = useState<number>(30);
  const [typedConfirm, setTypedConfirm] = useState('');

  const dismissClosing = () => {
    setClosing(null);
    setPassword('');
    setShowPassword(false);
    setTypedConfirm('');
  };

  const confirmPause = () => {
    disableAccount.mutate(
      { password, days: pauseDays },
      {
        onSuccess: ({ disabledUntil }) => {
          dismissClosing();
          Alert.alert(
            'Account paused',
            `You are signed out everywhere. You can sign in again on ${disabledUntil.slice(0, 10)}.`,
            [{ text: 'OK', onPress: () => router.replace('/(auth)/welcome') }],
          );
        },
        onError: (err: any) =>
          Alert.alert('Could not pause', err?.message || 'Please try again.'),
      },
    );
  };

  const confirmDelete = () => {
    deleteAccount.mutate(password, {
      onSuccess: ({ filesDeleted }) => {
        dismissClosing();
        Alert.alert(
          'Account deleted',
          `Your account and ${filesDeleted} file${filesDeleted === 1 ? '' : 's'} are gone.`,
          [{ text: 'OK', onPress: () => router.replace('/(auth)/welcome') }],
        );
      },
      onError: (err: any) =>
        Alert.alert('Could not delete', err?.message || 'Please try again.'),
    });
  };

  const { sharing, isLoading: loadingLocation } = useLocationSharing();
  const startSharing = useShareLocation();
  const stopSharing = useStopSharingLocation();

  const discoverable = profile?.discoverable ?? true;

  // Whether this device is currently registered to receive push.
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const pushPossible = isRemotePushAvailable();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!pushPossible) {
        if (!cancelled) setPushOn(false);
        return;
      }
      const registration = await getPushRegistration();
      if (!cancelled) setPushOn(!!registration);
    })();
    return () => {
      cancelled = true;
    };
  }, [pushPossible]);

  const toggleDiscoverable = (next: boolean) => {
    updateProfile.mutate(
      { discoverable: next },
      {
        onError: (err: any) =>
          Alert.alert('Could not save', err?.message || 'Please try again.'),
      },
    );
  };

  const toggleLocation = (next: boolean) => {
    const mutation = next ? startSharing : stopSharing;
    mutation.mutate(undefined as never, {
      onError: (err: any) =>
        Alert.alert('Could not change sharing', err?.message || 'Please try again.'),
    });
  };

  const togglePush = async (next: boolean) => {
    setPushBusy(true);
    try {
      if (next) {
        if (!(await ensurePermissions())) {
          Alert.alert(
            'Notifications are off',
            `Turn them on for Virgo in your ${Platform.OS === 'ios' ? 'iOS' : 'Android'} settings, then try again.`,
          );
          return;
        }
        const registration = await getPushRegistration();
        if (!registration) {
          Alert.alert(
            'Not available here',
            'Push needs a development build on a real device. Reminders still alarm locally.',
          );
          return;
        }
        await api.post('/notifications/token', { body: registration });
        setPushOn(true);
        return;
      }

      const registration = await getPushRegistration();
      if (registration) {
        await api.delete('/notifications/token', { body: { token: registration.token } });
      }
      setPushOn(false);
    } catch (err: any) {
      Alert.alert('Could not change notifications', err?.message || 'Please try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const border = isDark ? '#2A2522' : '#F0E8E2';
  const cardShadow = {
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  } as const;

  const Toggle = ({
    icon: Icon,
    tint,
    title,
    detail,
    value,
    busy,
    onChange,
    last,
  }: {
    icon: React.ComponentType<any>;
    tint: string;
    title: string;
    detail: string;
    value: boolean;
    busy?: boolean;
    onChange: (next: boolean) => void;
    last?: boolean;
  }) => (
    <View
      className="px-4 py-3.5 flex-row items-center gap-3"
      style={last ? undefined : { borderBottomWidth: 1, borderBottomColor: border }}
    >
      <View
        style={{
          width: 32, height: 32, borderRadius: 10,
          backgroundColor: `${tint}14`,
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon size={15} style={{ color: tint }} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground text-sm font-semibold">{title}</Text>
        <Text className="text-muted-foreground text-xs mt-0.5 leading-4">{detail}</Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color="#B66A40" />
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: isDark ? '#3A322C' : '#E5D9D1', true: '#B66A40' }}
          thumbColor="#FFFFFF"
        />
      )}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={cardShadow}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Privacy
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Who can find you, and what leaves your device
            </Text>
          </View>
        </View>

        {/* Discovery */}
        <View className="px-5 mt-5">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Discovery
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Toggle
              icon={SearchIcon}
              tint="#5B7B9A"
              title="Find me by name"
              detail={
                discoverable
                  ? 'People searching your name can find you'
                  : 'Only people who know your exact email can find you'
              }
              value={discoverable}
              busy={updateProfile.isPending}
              onChange={toggleDiscoverable}
            />
            <Toggle
              icon={MapPinIcon}
              tint="#6B8E4E"
              title="Share my location"
              detail={
                sharing
                  ? 'You appear in Nearby. Others see a distance, never a place'
                  : 'You do not appear in Nearby and no location is stored'
              }
              value={sharing}
              busy={loadingLocation || startSharing.isPending || stopSharing.isPending}
              onChange={toggleLocation}
              last
            />
          </View>
          <Text className="text-muted-foreground text-[11px] mt-2 ml-1 leading-4">
            Turning off name search does not hide you from people you already
            share a workspace with, and an exact email address still reaches
            you — otherwise nobody could invite you.
          </Text>
        </View>

        {/* Notifications */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Notifications
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Toggle
              icon={BellIcon}
              tint="#B66A40"
              title="Push to this device"
              detail={
                !pushPossible
                  ? 'Unavailable in Expo Go and on simulators'
                  : pushOn
                    ? 'Messages and reminders reach you when the app is closed'
                    : 'This device will not receive push. Local alarms still fire'
              }
              value={!!pushOn}
              busy={pushOn === null || pushBusy}
              onChange={(next) => void togglePush(next)}
              last
            />
          </View>
        </View>

        {/* Your data */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Your data
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Pressable
              onPress={() => router.push('/settings/sync')}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
              style={{ borderBottomWidth: 1, borderBottomColor: border }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#C76B4A14', alignItems: 'center', justifyContent: 'center' }}>
                <Trash2Icon size={15} style={{ color: '#C76B4A' }} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  Delete my cloud media
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Erase every photo, video and audio file you have uploaded
                </Text>
              </View>
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>

            <Pressable
              onPress={() => router.push('/legal?tab=privacy')}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#54433C14', alignItems: 'center', justifyContent: 'center' }}>
                <FileTextIcon size={15} style={{ color: '#54433C' }} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  Privacy Policy & Terms
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  What is collected and why
                </Text>
              </View>
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        <View
          className="mx-5 mt-6 flex-row items-start gap-3 bg-card rounded-2xl px-4 py-3.5"
          style={cardShadow}
        >
          <ShieldCheckIcon size={14} className="text-muted-foreground" />
          <Text className="text-muted-foreground text-xs flex-1 leading-5">
            Client share links are public to anyone holding the URL. Revoke a
            link from the album&rsquo;s menu when a shoot is finished.
          </Text>
        </View>

        {/* Closing the account.
            Last, and visually separate: these are the two actions that cannot
            be undone by signing in again, and nothing above them should be
            one mis-tap away from either. */}
        <View className="px-5 mt-8">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Close your account
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Pressable
              onPress={() => setClosing('pause')}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
              style={{ borderBottomWidth: 1, borderBottomColor: border }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#5B7B9A14', alignItems: 'center', justifyContent: 'center' }}>
                {/* color prop, not style: cssInterop maps className to it, and
                    the style form does not typecheck against ViewStyle. */}
                <PauseCircleIcon size={15} color="#5B7B9A" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  Pause my account
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                  Sign out everywhere for a set number of days. Nothing is
                  deleted and it comes back on its own
                </Text>
              </View>
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>

            <Pressable
              onPress={() => setClosing('delete')}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#C4776A14', alignItems: 'center', justifyContent: 'center' }}>
                <UserXIcon size={15} color="#C4776A" />
              </View>
              <View className="flex-1">
                <Text style={{ color: '#C4776A' }} className="text-sm font-semibold">
                  Delete my account
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                  Erase the account, every workspace, album, message and file.
                  This cannot be undone
                </Text>
              </View>
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>
      </ScrollView>

      {/* Confirmation. A sheet rather than an Alert: both need a password
          typed, and Alert.prompt is iOS-only. */}
      <Modal
        visible={closing !== null}
        transparent
        animationType="slide"
        onRequestClose={dismissClosing}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' }}
        >
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8">
            <Text className="text-foreground text-lg font-bold tracking-tight">
              {closing === 'pause' ? 'Pause your account' : 'Delete your account'}
            </Text>
            <Text className="text-muted-foreground text-sm mt-1.5 leading-5">
              {closing === 'pause'
                ? 'You will be signed out on every device. Nobody can message you or invite you until it lifts.'
                : 'Your workspaces, albums, messages and every uploaded file are erased. Share links stop working. This cannot be undone.'}
            </Text>

            {closing === 'pause' && (
              <View className="mt-5">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2">
                  For how long
                </Text>
                <View className="flex-row gap-2">
                  {PAUSE_OPTIONS.map((days) => (
                    <Pressable
                      key={days}
                      onPress={() => setPauseDays(days)}
                      className={`flex-1 rounded-xl py-3 items-center active:scale-[0.96] ${
                        pauseDays === days ? 'bg-primary' : 'bg-card'
                      }`}
                    >
                      <Text
                        className={`text-sm font-bold ${
                          pauseDays === days ? 'text-white' : 'text-foreground'
                        }`}
                      >
                        {days}d
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text className="text-muted-foreground text-xs mt-2">
                  Comes back on{' '}
                  {new Date(Date.now() + pauseDays * 86400000)
                    .toISOString()
                    .slice(0, 10)}
                  .
                </Text>
              </View>
            )}

            <View className="mt-5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2">
                Your password
              </Text>
              <View className="bg-card rounded-2xl flex-row items-center px-4">
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="Confirm it is you"
                  placeholderTextColor="#A89489"
                  autoCapitalize="none"
                  className="flex-1 py-3.5 text-foreground text-base"
                />
                <Pressable
                  onPress={() => setShowPassword((s) => !s)}
                  className="pl-3 active:opacity-60"
                >
                  {showPassword ? (
                    <EyeOffIcon size={17} className="text-muted-foreground" />
                  ) : (
                    <EyeIcon size={17} className="text-muted-foreground" />
                  )}
                </Pressable>
              </View>
            </View>

            {closing === 'delete' && (
              <View className="mt-4">
                <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2">
                  Type DELETE to confirm
                </Text>
                <TextInput
                  value={typedConfirm}
                  onChangeText={setTypedConfirm}
                  placeholder="DELETE"
                  placeholderTextColor="#A89489"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  className="bg-card rounded-2xl px-4 py-3.5 text-foreground text-base"
                />
              </View>
            )}

            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={dismissClosing}
                className="flex-1 bg-card rounded-2xl py-3.5 items-center active:scale-[0.97]"
              >
                <Text className="text-foreground text-base font-semibold">Cancel</Text>
              </Pressable>
              {closing === 'pause' ? (
                <Pressable
                  onPress={confirmPause}
                  disabled={!password || disableAccount.isPending}
                  className={`flex-1 rounded-2xl py-3.5 items-center active:scale-[0.97] ${
                    password ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <Text
                    className={`text-base font-bold ${
                      password ? 'text-white' : 'text-muted-foreground'
                    }`}
                  >
                    {disableAccount.isPending ? 'Pausing…' : `Pause ${pauseDays} days`}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={confirmDelete}
                  disabled={
                    !password || typedConfirm !== 'DELETE' || deleteAccount.isPending
                  }
                  className="flex-1 rounded-2xl py-3.5 items-center active:scale-[0.97]"
                  style={{
                    backgroundColor:
                      password && typedConfirm === 'DELETE' ? '#C4776A' : undefined,
                  }}
                >
                  <Text
                    className={`text-base font-bold ${
                      password && typedConfirm === 'DELETE'
                        ? 'text-white'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {deleteAccount.isPending ? 'Deleting…' : 'Delete forever'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
