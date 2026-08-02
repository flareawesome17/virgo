import { View, Text, ScrollView, Pressable, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ArrowLeftIcon, MailIcon } from 'lucide-react-native';
import { cssInterop } from 'nativewind';
import { useTheme } from '@/src/hooks';

for (const Icon of [ArrowLeftIcon, MailIcon]) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } });
}

const CONTACT_EMAIL = 'support@virgo.ph';
const LAST_UPDATED = '2 August 2026';

interface Clause {
  heading: string;
  body: string[];
}

/**
 * Terms of Service.
 *
 * Written to describe what the app actually does rather than in boilerplate:
 * every limit named here (album counts, storage, share links, deletion) is one
 * the code enforces, so the document and the product cannot drift.
 */
const TERMS: Clause[] = [
  {
    heading: 'Using Virgo',
    body: [
      'Virgo is a workspace for photographers: storing shoots, scheduling them, sharing them with clients, and working on them with collaborators.',
      'You need an account. You are responsible for keeping your password to yourself and for what happens under your account.',
      'You must be old enough to enter a contract where you live.',
    ],
  },
  {
    heading: 'Your content stays yours',
    body: [
      'Every photo, video and audio file you upload remains yours. Uploading does not give us ownership of it.',
      'You grant us only the permission needed to run the service: to store your files, serve them back to you, and deliver them to people you have explicitly shared them with.',
      'We do not use your work to train models, and we do not sell it.',
    ],
  },
  {
    heading: 'What you may not upload',
    body: [
      'Content you do not hold the rights to.',
      'Content that is unlawful where you or your subjects are, or that depicts the abuse of a person.',
      'Malware, or anything intended to break the service or reach other accounts.',
      'We may remove content that breaks these rules and, for serious or repeated breaches, close the account.',
    ],
  },
  {
    heading: 'Plans and limits',
    body: [
      'Free includes 15 GB of storage, 1 workspace and 2 albums.',
      'Freelance is US$25 a month and includes 100 GB, 2 workspaces and 5 albums in each.',
      'Studio is not available yet.',
      'Album limits are counted per workspace, not in total. When you reach a limit, creating more is blocked until you delete something or change plan.',
    ],
  },
  {
    heading: 'Client share links',
    body: [
      'A share link is a long, unguessable web address. It needs no account and no password.',
      'That means anyone holding the link can open it. Send links to the client they are meant for, and revoke a link when a shoot is finished.',
      'You choose exactly which files each link exposes. Revoking takes effect immediately.',
    ],
  },
  {
    heading: 'Collaborators',
    body: [
      'You can only invite people you are already friends with in the app, and they must accept the invitation before they gain access.',
      'A collaborator on a workspace can see its albums. You can remove them, or untick individual albums, at any time.',
    ],
  },
  {
    heading: 'Deleting things',
    body: [
      'Deleting an album or wiping your cloud media removes the files from storage. This cannot be undone, and we cannot recover them for you.',
      'Keep your own backup of anything you cannot afford to lose. Virgo is not a backup service.',
    ],
  },
  {
    heading: 'Availability',
    body: [
      'We aim to keep Virgo running but do not promise uninterrupted service. Maintenance, outages and faults happen.',
      'The service is provided as is. To the extent the law allows, we are not liable for lost profits, lost work, or indirect losses. Nothing here limits liability that cannot lawfully be limited.',
    ],
  },
  {
    heading: 'Changes and ending',
    body: [
      'You can stop using Virgo at any time and delete your data from Settings.',
      'We may update these terms. If a change materially affects you, we will say so in the app before it takes effect.',
      'These terms are governed by the laws of the Republic of the Philippines.',
    ],
  },
];

/**
 * Privacy Policy.
 *
 * Each entry names a real store or third party the app talks to, so it can be
 * checked against the code rather than taken on trust.
 */
const PRIVACY: Clause[] = [
  {
    heading: 'What we collect',
    body: [
      'Account: your email address, and the name, photo, title, phone, website, location and bio you choose to add.',
      'Content: the photos, videos and audio you upload, and the albums, workspaces, events, reminders and messages you create.',
      'Device: a push notification token, so reminders and messages can reach you when the app is closed.',
      'Location: only if you turn on location sharing. See below.',
    ],
  },
  {
    heading: 'What we do not collect',
    body: [
      'We do not collect your contacts, your photo library beyond the files you pick, your browsing outside the app, or advertising identifiers.',
      'There is no third-party analytics or advertising SDK in the app.',
    ],
  },
  {
    heading: 'Location',
    body: [
      'Location sharing is off until you turn it on, and granting the operating system permission does not by itself turn it on.',
      'While it is on we store your latest coordinates so we can calculate distances. Other users are shown a distance in kilometres and never a coordinate or a place.',
      'Turning sharing off erases the stored coordinates immediately and removes you from other people’s results.',
      'You can only see other people if you are sharing too.',
    ],
  },
  {
    heading: 'Messages',
    body: [
      'Messages are stored so they can be delivered and read later. They are not end-to-end encrypted, which means we are technically able to access them; we do not read them except where we must to investigate abuse or comply with the law.',
      'Deleting a message for everyone clears its text from our database. Deleting it for yourself hides it from your view only.',
      'Read and delivery receipts are recorded so the sender can see whether a message arrived and was opened.',
    ],
  },
  {
    heading: 'Who else touches your data',
    body: [
      'Backblaze B2 stores your uploaded files, served through a Cloudflare content network.',
      'Expo delivers push notifications. The notification title and a preview of the message pass through their service.',
      'These providers process data on our instructions. We do not sell your data to anyone, and there are no advertising partners.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Content stays until you delete it. Deletion from storage is immediate and permanent.',
      'Past calendar events are removed automatically once they are well over.',
      'Closing your account removes your content. Some records may persist briefly in backups before they age out.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'Turn name search off in Settings, Privacy, so only someone with your exact email can find you.',
      'Turn location sharing off at any time, which also erases what was stored.',
      'Turn push off for a device in Settings, Privacy.',
      'Wipe every file you have uploaded in Settings, Sync & Storage.',
      'To request a copy of your data or ask us to delete your account, email us.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Passwords are stored hashed, never in readable form. Traffic between the app and our servers is encrypted in transit.',
      'No system is perfectly secure. If a breach affects you, we will tell you.',
    ],
  },
];

/**
 * Terms and privacy, in one place.
 *
 * Two tabs rather than two screens: people arriving from either link usually
 * want to glance at both, and a policy that requires going back a screen to
 * read its other half gets read half as often.
 */
export default function LegalScreen() {
  const { isDark } = useTheme();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const [active, setActive] = useState<'terms' | 'privacy'>(
    tab === 'privacy' ? 'privacy' : 'terms',
  );

  const clauses = active === 'terms' ? TERMS : PRIVACY;
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
              Legal
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Last updated {LAST_UPDATED}
            </Text>
          </View>
        </View>

        <View className="px-5 mt-4">
          <View className="flex-row bg-muted rounded-2xl p-1">
            {(['terms', 'privacy'] as const).map((key) => {
              const on = active === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setActive(key)}
                  className={`flex-1 py-2.5 rounded-xl items-center active:scale-[0.97] ${on ? 'bg-card' : ''}`}
                  style={on ? { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : undefined}
                >
                  <Text
                    className={`text-sm font-bold ${on ? 'text-foreground' : 'text-muted-foreground'}`}
                  >
                    {key === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="px-5 mt-5 gap-5">
          {clauses.map((clause) => (
            <View key={clause.heading}>
              <Text className="text-foreground text-base font-bold mb-2">
                {clause.heading}
              </Text>
              <View className="bg-card rounded-2xl px-4 py-3.5 gap-3" style={cardShadow}>
                {clause.body.map((paragraph, i) => (
                  <Text
                    key={i}
                    className="text-muted-foreground text-sm leading-6"
                  >
                    {paragraph}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </View>

        <View className="px-5 mt-6">
          <Pressable
            onPress={() => void Linking.openURL(`mailto:${CONTACT_EMAIL}`)}
            className="bg-card rounded-2xl px-4 py-3.5 flex-row items-center gap-3 active:scale-[0.98]"
            style={cardShadow}
          >
            <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#B66A4014', alignItems: 'center', justifyContent: 'center' }}>
              <MailIcon size={15} style={{ color: '#B66A40' }} />
            </View>
            <View className="flex-1">
              <Text className="text-foreground text-sm font-semibold">
                Questions about this?
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                {CONTACT_EMAIL}
              </Text>
            </View>
          </Pressable>
        </View>

        <Text
          className="text-muted-foreground text-[11px] px-6 mt-5 leading-5"
          style={{ opacity: isDark ? 0.7 : 0.8 }}
        >
          By continuing to use Virgo you accept these terms.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
