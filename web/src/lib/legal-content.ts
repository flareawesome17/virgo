/**
 * Terms of Service and Privacy Policy.
 *
 * The exact text the mobile app shows, in `mobile/app/legal.tsx`. One product
 * must not present two different sets of terms; if you edit one, edit both.
 *
 * Every limit and every third party named here is one the code actually
 * enforces or talks to, so the document can be checked against the source
 * rather than taken on trust.
 */

export interface Clause {
  heading: string;
  body: string[];
}

export const CONTACT_EMAIL = 'support@virgo.ph';
export const LAST_UPDATED = '2 August 2026';

export const TERMS: Clause[] = [
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

export const PRIVACY: Clause[] = [
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
