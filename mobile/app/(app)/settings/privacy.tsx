import {
  View,
  Text,
  ScrollView,
  Pressable,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
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
  ShieldCheckIcon, Trash2Icon, FileTextIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

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
  const { profile, updateProfile } = useAuth();

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
      </ScrollView>
    </SafeAreaView>
  );
}
