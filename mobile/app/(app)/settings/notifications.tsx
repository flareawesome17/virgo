import { View, Text, ScrollView, Pressable, Switch, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ArrowLeftIcon,
  Volume2Icon,
  VolumeXIcon,
  MessageCircleIcon,
  CalendarClockIcon,
  BellIcon,
  PlayIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import {
  loadSoundPreference,
  playAlert,
  setSoundEnabled,
  type AlertSound,
} from '@/src/lib/sounds';
import {
  useNotificationSettings,
  useUpdateNotificationSetting,
} from '@/src/hooks';
import type { NotificationSetting } from '@/src/api';
import {
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
} from '@/src/lib/notification-categories';

for (const Icon of [
  ArrowLeftIcon, Volume2Icon, VolumeXIcon, MessageCircleIcon,
  CalendarClockIcon, BellIcon, PlayIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

/**
 * Which alerts reach you.
 *
 * This row existed on the settings list marked "soon" and went nowhere. It is
 * a real screen now, because a notification sound is the one setting people
 * look for the moment it annoys them — and a dead end at that moment is worse
 * than no row at all.
 */

const SOUNDS: { key: AlertSound; icon: typeof BellIcon; label: string; detail: string; color: string }[] = [
  {
    key: 'chat',
    icon: MessageCircleIcon,
    label: 'Messages',
    detail: 'Someone sends you a message',
    color: '#5B7B9A',
  },
  {
    key: 'event',
    icon: CalendarClockIcon,
    label: 'Upcoming events',
    detail: 'A reminder for a shoot that is about to start',
    color: '#6B8E4E',
  },
  {
    key: 'global',
    icon: BellIcon,
    label: 'Everything else',
    detail: 'Applications, invitations, bookings, replies',
    color: '#B66A40',
  },
];

/**
 * One cell of the table: a switch, "Always" where it cannot be turned off, or
 * a dash where that kind never travels on that channel — a switch there would
 * do nothing, and one that does nothing is a lie.
 */
function ChannelCell({
  row,
  channel,
  onChange,
}: {
  row: NotificationSetting;
  channel: 'push' | 'email';
  onChange: (enabled: boolean) => void;
}) {
  const value = row[channel];
  return (
    <View style={{ width: 56, alignItems: 'center' }}>
      {value === null ? (
        <Text className="text-muted-foreground text-sm" accessibilityLabel="Not sent">—</Text>
      ) : row.locked ? (
        <Text className="text-muted-foreground text-[11px] font-semibold">Always</Text>
      ) : (
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ false: '#D9C2B7', true: '#B66A40' }}
          thumbColor="#FFFFFF"
          accessibilityLabel={`${CATEGORY_LABELS[row.category]} by ${channel === 'push' ? 'push' : 'email'}`}
        />
      )}
    </View>
  );
}

/**
 * Which kinds of notification reach this phone and your inbox. Stored on the
 * account, so the web app's settings show the same switches.
 */
function WhatReachesYou() {
  const { settings, isLoading, loadFailed, refetch } = useNotificationSettings();
  const update = useUpdateNotificationSetting();

  const change = (row: NotificationSetting, channel: 'push' | 'email', next: boolean) =>
    update.mutate(
      { category: row.category, channel, enabled: next },
      { onError: () => Alert.alert('Could not save that', 'Check your connection and try again.') },
    );

  return (
    <>
      <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mt-6 mb-2 ml-6">
        What reaches you
      </Text>
      <View className="px-5">
        <View
          className="bg-card rounded-2xl overflow-hidden"
          style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
        >
          {isLoading ? (
            <ActivityIndicator color="#B66A40" style={{ paddingVertical: 24 }} />
          ) : loadFailed ? (
            <Pressable onPress={() => refetch()} className="px-4 py-5">
              <Text className="text-foreground text-sm font-semibold">Could not load your settings</Text>
              <Text className="text-muted-foreground text-xs mt-0.5">Tap to try again.</Text>
            </Pressable>
          ) : (
            <>
              <View className="flex-row items-center px-4 pt-3 pb-1">
                <Text className="flex-1 text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]">
                  Kind
                </Text>
                <Text style={{ width: 56 }} className="text-center text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]">
                  Push
                </Text>
                <Text style={{ width: 56 }} className="text-center text-muted-foreground text-[11px] font-bold uppercase tracking-[1px]">
                  Email
                </Text>
              </View>
              {settings.map((row, index) => (
                <View
                  key={row.category}
                  className="flex-row items-center px-4 py-2.5"
                  style={index > 0 ? { borderTopWidth: 1, borderTopColor: '#D9C2B733' } : undefined}
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-foreground text-[14px] font-semibold">
                      {CATEGORY_LABELS[row.category]}
                    </Text>
                    <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                      {CATEGORY_DESCRIPTIONS[row.category]}
                    </Text>
                  </View>
                  <ChannelCell row={row} channel="push" onChange={(next) => change(row, 'push', next)} />
                  <ChannelCell row={row} channel="email" onChange={(next) => change(row, 'email', next)} />
                </View>
              ))}
            </>
          )}
        </View>
        <Text className="text-muted-foreground text-xs mt-3 ml-1 leading-5">
          Your notification list keeps everything for 90 days, whatever you switch
          off here. Only invitations, applications and enquiries are ever emailed.
        </Text>
      </View>
    </>
  );
}

export default function NotificationSettingsScreen() {
  const [enabled, setEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadSoundPreference().then((on) => {
      setEnabled(on);
      setReady(true);
    });
  }, []);

  const toggle = (next: boolean) => {
    setEnabled(next);
    void setSoundEnabled(next);
    // Plays the sound being switched on, because the only way to judge a
    // notification tone is to hear it. Nothing on switching off, which would
    // be a joke at the user's expense.
    if (next) playAlert('global');
  };

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-background">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-card items-center justify-center active:scale-[0.94]"
            style={{ shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <ArrowLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <Text className="text-foreground text-[22px] font-bold tracking-tight">
            Notifications
          </Text>
        </View>

        <WhatReachesYou />

        <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mt-8 mb-2 ml-6">
          Sound
        </Text>

        <View className="px-5">
          <View
            className="bg-card rounded-2xl px-4 py-4 flex-row items-center gap-3"
            style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
          >
            <View
              style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#B66A4018', alignItems: 'center', justifyContent: 'center' }}
            >
              {enabled ? (
                <Volume2Icon size={17} color="#B66A40" />
              ) : (
                <VolumeXIcon size={17} color="#B66A40" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-[15px] font-semibold">Notification sound</Text>
              <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                {enabled
                  ? 'Plays while the app is open.'
                  : 'Notifications arrive silently.'}
              </Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={toggle}
              disabled={!ready}
              trackColor={{ false: '#D9C2B7', true: '#B66A40' }}
              thumbColor="#FFFFFF"
            />
          </View>

          {/* Says what the switch does not: the phone's own controls still win,
              and nothing here can talk over them. Worth stating plainly, since
              "why is it silent" is the first thing somebody will ask. */}
          <Text className="text-muted-foreground text-xs mt-3 ml-1 leading-5">
            Your ringer switch and Do Not Disturb still come first — Virgo will
            not play over them. When the app is closed, notifications use the
            sound your device settings choose.
          </Text>
        </View>

        <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mt-8 mb-2 ml-6">
          The three sounds
        </Text>
        <View className="px-5 gap-3">
          {SOUNDS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.key}
                // Tapping plays it. A list of names for sounds you cannot hear
                // is a list of nothing.
                onPress={() => playAlert(item.key)}
                disabled={!enabled}
                className={`bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98] ${enabled ? '' : 'opacity-50'}`}
                style={{ shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}
              >
                <View
                  style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${item.color}18`, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon size={15} color={item.color} />
                </View>
                <View className="flex-1">
                  <Text className="text-foreground text-sm font-semibold">{item.label}</Text>
                  <Text className="text-muted-foreground text-xs mt-0.5 leading-4">
                    {item.detail}
                  </Text>
                </View>
                <PlayIcon size={15} className="text-muted-foreground" />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
