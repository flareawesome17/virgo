import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Linking,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import {
  ArrowLeftIcon,
  SearchIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  MailIcon,
  CopyIcon,
} from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useAuth, useTheme, useUsage } from '@/src/hooks';
import { API_BASE_URL } from '@/src/api';
import { isRemotePushAvailable } from '@/src/lib/notifications';

for (const Icon of [
  ArrowLeftIcon, SearchIcon, ChevronDownIcon, ChevronRightIcon, MailIcon, CopyIcon,
]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const SUPPORT_EMAIL = 'support@virgo.ph';

interface Article {
  q: string;
  a: string;
  /** Where in the app the answer lives, when there is somewhere to go. */
  route?: string;
  routeLabel?: string;
}

/**
 * Answers to what this app actually does.
 *
 * Written against the real behaviour rather than generic help copy: every
 * claim below is something the app does today, which is what makes it worth
 * having instead of the "Soon" badge that was here before.
 */
const SECTIONS: { title: string; articles: Article[] }[] = [
  {
    title: 'Uploading',
    articles: [
      {
        q: 'Where do my uploads go?',
        a: 'Into the album you picked before choosing files. Photos and videos come from your gallery; audio comes from the file browser, because galleries do not list audio. Everything is stored in the cloud and counts towards your plan.',
      },
      {
        q: 'I uploaded but the album looks empty',
        a: 'Pull down to refresh the album. If storage went up but nothing appears, the files landed without an album — open Settings, Storage to see unassigned files and attach them.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
      {
        q: 'Which file types work?',
        a: 'JPEG, PNG, HEIC, WebP, AVIF and GIF for photos; MP4 and MOV for video; MP3, M4A, WAV and AAC for audio.',
      },
    ],
  },
  {
    title: 'Sharing with clients',
    articles: [
      {
        q: 'How do I send an album to a client?',
        a: 'Open the album, tap the menu in the top right, then Generate client link. Tick exactly which photos, videos and audio the client should see. The link opens in any browser with no account needed.',
      },
      {
        q: 'Can I take a link back?',
        a: 'Yes. Revoke it from the same album menu. Anyone opening the old link then sees a page saying the link is no longer available.',
      },
      {
        q: 'Is a client link private?',
        a: 'It is unguessable, but it is public to anyone who has it. Treat it like a key: fine to send to a client, not something to post. Revoke it once a shoot is signed off.',
      },
    ],
  },
  {
    title: 'Collaborators and chat',
    articles: [
      {
        q: 'Why can I only invite friends?',
        a: 'Collaborating means access to your work, so it takes both sides agreeing first. Find someone on the Network screen, send a friend request, and once they accept you can invite them to a workspace or album.',
        route: '/(app)/(tabs)/network',
        routeLabel: 'Open Network',
      },
      {
        q: 'What does a collaborator see?',
        a: 'Everything in the workspace you added them to, including its albums. You can untick individual albums from their Access sheet on the Network screen at any time.',
      },
      {
        q: 'Who can I chat with?',
        a: 'Anyone you are friends with, one to one or in a group. Groups can hold anyone you are friends with, and members can leave without ending the conversation for everyone else.',
        route: '/(app)/(tabs)/chat',
        routeLabel: 'Open Chat',
      },
      {
        q: 'What do the ticks on my messages mean?',
        a: 'A clock means it is still sending. One tick means the server has it. Two faint ticks mean it reached their device. Two solid ticks mean they opened the thread. A warning triangle means it never sent — tap it to try again.',
      },
    ],
  },
  {
    title: 'Schedule and reminders',
    articles: [
      {
        q: 'Will a reminder alarm without a connection?',
        a: 'Yes. Reminders are scheduled on the device, so they fire with no network at all. The server also pushes at the due time, which covers you if the app was reinstalled or you use a second device.',
      },
      {
        q: 'My past events disappeared',
        a: 'Events are cleaned up automatically once they have been over long enough. Upcoming only shows events whose start time has not passed yet.',
      },
    ],
  },
  {
    title: 'Storage and plans',
    articles: [
      {
        q: 'What counts towards my storage?',
        a: 'Every photo, video and audio file you have uploaded, across all workspaces. The figure comes from what is actually stored, not from anything measured on the phone.',
        route: '/settings/storage',
        routeLabel: 'Open Storage',
      },
      {
        q: 'I hit my album or workspace limit',
        a: 'Album limits are counted per workspace, not in total. Free includes 1 workspace with 2 albums; Freelance includes 2 workspaces with 5 albums each.',
        route: '/settings/storage/plans',
        routeLabel: 'See plans',
      },
      {
        q: 'How do I delete everything I have uploaded?',
        a: 'Settings, Sync & Storage, then Wipe cloud data. It asks you to type DELETE first because it cannot be undone.',
        route: '/settings/sync',
        routeLabel: 'Open Sync & Storage',
      },
    ],
  },
];

/**
 * Help.
 *
 * Searchable rather than a long scroll: people arrive here with a specific
 * question, and the answer they need is usually two sections down.
 */
export default function HelpScreen() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const { usage } = useUsage();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const version =
    Constants.expoConfig?.version ??
    (Constants as { manifest?: { version?: string } }).manifest?.version ??
    'unknown';

  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      articles: s.articles.filter(
        (a) => a.q.toLowerCase().includes(q) || a.a.toLowerCase().includes(q),
      ),
    })).filter((s) => s.articles.length > 0);
  }, [search]);

  /** What support needs to reproduce a problem, and nothing more. */
  const diagnostics = [
    `Version: ${version}`,
    `Platform: ${Platform.OS} ${Platform.Version}`,
    `Plan: ${usage?.plan ?? 'unknown'}`,
    `Account: ${user?.email ?? 'signed out'}`,
    `API: ${API_BASE_URL}`,
    `Push available: ${isRemotePushAvailable() ? 'yes' : 'no'}`,
  ].join('\n');

  const contact = async () => {
    const subject = encodeURIComponent('Virgo support');
    const body = encodeURIComponent(`\n\n---\n${diagnostics}\n`);
    const url = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('no mail client');
      await Linking.openURL(url);
    } catch {
      // A device with no mail app should still be able to reach support.
      await Clipboard.setStringAsync(`${SUPPORT_EMAIL}\n\n${diagnostics}`);
      Alert.alert(
        'No mail app found',
        `The support address and your device details were copied instead.\n\n${SUPPORT_EMAIL}`,
      );
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
          <View className="flex-1">
            <Text className="text-foreground text-[22px] font-bold tracking-tight">
              Help Center
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              How Virgo works, and how to reach us
            </Text>
          </View>
        </View>

        <View className="px-5 pt-3">
          <View
            className="flex-row items-center bg-card rounded-2xl px-4 h-11 gap-3"
            style={cardShadow}
          >
            <SearchIcon size={16} className="text-muted-foreground" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search help"
              placeholderTextColor="#A89489"
              className="text-foreground text-sm flex-1"
              autoCorrect={false}
            />
          </View>
        </View>

        {sections.length === 0 ? (
          <View className="px-10 pt-16 items-center">
            <Text className="text-foreground text-base font-bold text-center">
              Nothing found
            </Text>
            <Text className="text-muted-foreground text-sm text-center mt-2">
              Try a different word, or email us and we will answer directly.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.title} className="px-5 mt-5">
              <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
                {section.title}
              </Text>
              <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
                {section.articles.map((article, i) => {
                  const expanded = open === article.q;
                  return (
                    <View
                      key={article.q}
                      style={i < section.articles.length - 1 ? { borderBottomWidth: 1, borderBottomColor: border } : undefined}
                    >
                      <Pressable
                        onPress={() => setOpen(expanded ? null : article.q)}
                        className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
                      >
                        <Text className="text-foreground text-sm font-semibold flex-1">
                          {article.q}
                        </Text>
                        {expanded ? (
                          <ChevronDownIcon size={15} className="text-muted-foreground" />
                        ) : (
                          <ChevronRightIcon size={15} className="text-muted-foreground" />
                        )}
                      </Pressable>
                      {expanded && (
                        <View className="px-4 pb-4 -mt-1">
                          <Text className="text-muted-foreground text-sm leading-6">
                            {article.a}
                          </Text>
                          {article.route && (
                            <Pressable
                              onPress={() => router.push(article.route!)}
                              className="mt-3 self-start bg-primary/10 rounded-xl px-3.5 py-2 active:scale-[0.96]"
                            >
                              <Text className="text-primary text-xs font-bold">
                                {article.routeLabel ?? 'Open'}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}

        {/* Contact */}
        <View className="px-5 mt-6">
          <Text className="text-muted-foreground text-[11px] font-bold uppercase tracking-[2px] mb-2 ml-1">
            Still stuck
          </Text>
          <View className="bg-card rounded-2xl overflow-hidden" style={cardShadow}>
            <Pressable
              onPress={() => void contact()}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
              style={{ borderBottomWidth: 1, borderBottomColor: border }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#B66A4014', alignItems: 'center', justifyContent: 'center' }}>
                <MailIcon size={15} color="#B66A40" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">Email support</Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  {SUPPORT_EMAIL} — your device details are attached
                </Text>
              </View>
              <ChevronRightIcon size={14} className="text-muted-foreground" />
            </Pressable>

            <Pressable
              onPress={async () => {
                await Clipboard.setStringAsync(diagnostics);
                Alert.alert('Copied', 'Device details are on your clipboard.');
              }}
              className="px-4 py-3.5 flex-row items-center gap-3 active:bg-muted/30"
            >
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#5B7B9A14', alignItems: 'center', justifyContent: 'center' }}>
                <CopyIcon size={15} color="#5B7B9A" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-sm font-semibold">
                  Copy device details
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5">
                  Version {version} · {Platform.OS}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
