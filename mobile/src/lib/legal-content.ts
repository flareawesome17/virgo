/**
 * Terms of Service and Privacy Policy.
 *
 * One file, shown by both clients: this copy and `mobile/src/lib/legal-content.ts`
 * are compared byte for byte by scripts/check-client-sync.mjs. They drifted
 * while they were kept in step by hand — the web gained an analytics section
 * the app never showed — and one product must not present two sets of terms.
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
export const LAST_UPDATED = '29 September 2026';

export const TERMS: Clause[] = [
  {
    heading: 'Using Virgo',
    body: [
      'Virgo is where photographers, videographers and other creatives keep and deliver their work, show it, and get hired: albums and client galleries, a feed of work, a jobs board, bookings, schedules and messages.',
      'You need an account. You are responsible for keeping your password to yourself and for what happens under your account.',
      'You must be old enough to enter a contract where you live.',
    ],
  },
  {
    heading: 'Your content stays yours',
    body: [
      'Every photo, video and audio file you upload remains yours. Uploading does not give us ownership of it.',
      'You grant us only the permission needed to run the service: to store your files, serve them back to you, deliver them to the people you share them with, and show what you choose to post — a showcase, your profile, a shelf — to the people it is posted to.',
      'We do not use your work to train models, and we do not sell it.',
    ],
  },
  {
    heading: 'Community rules',
    body: [
      'No harassment, threats, hate or impersonation, in messages, comments, profiles or anywhere else.',
      'Nothing sexual involving a minor, no intimate images shared without consent, and nothing that depicts the abuse of a person.',
      'Only upload or post work you hold the rights to. No spam, scams, fake job posts or fake bookings, and no malware or attempts to reach other accounts.',
      'There is no tolerance for objectionable content or abusive users. Any post, comment, profile or job can be reported, and anyone can be blocked. We review reports, and may remove content or suspend an account that breaks these rules, without notice for serious breaches.',
    ],
  },
  {
    heading: 'Showcases, profiles and shelves',
    body: [
      'A showcase you post appears in the feed and on your profile, with your name, for other Virgo users to see. They see a display copy, never your original file.',
      'Your profile is visible to other Virgo users once you publish it. Likes and comments are visible to other users too.',
      'Shelves are public: a shelf shows what you kept, and who made it, on your profile.',
      'Taking a showcase down removes it from the feed and your profile.',
    ],
  },
  {
    heading: 'Jobs, hiring and bookings',
    body: [
      'Job posts are visible to signed-in Virgo users. Applying, or sending a hire enquiry, shares your profile and your message with the other person.',
      'Virgo puts clients and creatives in touch. It is not a party to the work you agree, and it does not take or hold payment for it. A booking records what you both agreed; the rate and the terms are between you.',
    ],
  },
  {
    heading: 'Plans and limits',
    body: [
      'Virgo is free during the pre-release, with 15 GB of storage, 1 workspace and 2 albums in it.',
      'Paid plans are not on sale yet. When they are, the price and what it includes will be shown before you pay, and payment will be handled by PayMongo.',
      'Album limits are counted per workspace, not in total. When you reach a limit, creating more is blocked until you delete something or change plan.',
      'Rewards and referral bonuses add to your limits. We may take back a bonus gained by abuse, such as referring accounts you made yourself.',
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
      'You can only invite people you are already connected with in the app, and they must accept the invitation before they gain access.',
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
      'You can stop using Virgo at any time, and delete your account in Settings, Account & security. Deleting it removes your files and what you posted, and cancels any paid plan.',
      'We may update these terms. If a change materially affects you, we will say so in the app before it takes effect.',
      'These terms are governed by the laws of the Republic of the Philippines.',
    ],
  },
];

export const PRIVACY: Clause[] = [
  {
    heading: 'What we collect',
    body: [
      'Account: your email address, your password (stored hashed), your name, and what you do — your roles.',
      'Address: the postal address you give when you sign up. It is private: never shown on your profile or to another user.',
      'Profile, if you add it: a photo, a cover photo, a bio, your title, studio, website, social handle, phone, and the area you work in.',
      'Content: the photos, videos and audio you upload; the albums, workspaces, events, reminders and messages you create; and the showcases, comments, likes, shelves, job posts, applications, enquiries and bookings you make.',
      'Safety: reports you make or that are made about you, and the people you have blocked.',
      'Device: a push notification token and the app version, so notifications reach the right phone.',
      'Location: only if you turn on location sharing. See below.',
    ],
  },
  {
    heading: 'What we do not collect',
    body: [
      'We do not collect your contacts, your photo library beyond the files you pick, your browsing outside Virgo, or advertising identifiers.',
      'There are no advertising SDKs and no advertising partners, and the mobile app has no third-party analytics. We do not sell your data.',
    ],
  },
  {
    heading: 'What other people see',
    body: [
      'Other Virgo users can find you by name and see your photo and roles, unless you turn name search off. Once you publish your profile, they can see it and what you post: showcases, comments, likes and shelves.',
      'Job posts are seen by signed-in users. Applications and hire enquiries are seen by the person they are sent to.',
      'A client you send a share link to sees only the files that link exposes.',
      'Blocking someone hides you from each other across Virgo.',
    ],
  },
  {
    heading: 'Location',
    body: [
      'Location sharing is off until you turn it on, and granting the operating system permission does not by itself turn it on. You can name a city instead of sharing your position.',
      'While it is on we store your latest position so we can calculate distances. Other users are shown a distance in kilometres and never a coordinate or a place.',
      'Turning sharing off erases what was stored immediately and removes you from other people’s results.',
      'You can only see other people if you are sharing too.',
    ],
  },
  {
    heading: 'Messages',
    body: [
      'Messages are stored so they can be delivered and read later. They are not end-to-end encrypted, which means we are technically able to access them; we do not read them except where we must to investigate abuse or comply with the law.',
      'Deleting a message for everyone clears its text from our database. Deleting it for yourself hides it from your view only.',
      'Read receipts are recorded so the sender can see whether a message was opened.',
    ],
  },
  {
    heading: 'Product analytics',
    body: [
      'On the web app, we use PostHog to count how the product is used — which pages are opened, and whether things like posting a job or confirming a booking actually get finished. The mobile app sends nothing to PostHog.',
      'It records the page you are on, a small set of named actions, and your account id. It does not record your name, your email, your messages, your files, or anything you type.',
      'Session recording and automatic click capture are both switched off. Those features would capture the contents of your screen — client galleries, chat, rates — and that is not something we are willing to send anywhere.',
      'If your browser sends a Do Not Track signal, we do not record anything at all.',
      'Our public web pages count visits without keeping your IP address or browser details.',
    ],
  },
  {
    heading: 'Who else touches your data',
    body: [
      'Backblaze B2 stores your uploaded files, served through a Cloudflare content network.',
      'Expo delivers push notifications. The notification title and a preview of the message pass through their service.',
      'SMTP2GO sends our emails — confirmations, password resets and notices — so your address and the email pass through their service.',
      'PayMongo will take payment for paid plans. Your card details go to them, not to us; we keep the plan, the amount and whether it is paid.',
      'PostHog receives the web usage events described above.',
      'These providers process data on our instructions. We do not sell your data to anyone, and there are no advertising partners.',
    ],
  },
  {
    heading: 'How long we keep it',
    body: [
      'Content stays until you delete it. Deletion from storage is immediate and permanent.',
      'Past calendar events are deleted 30 days after their date.',
      'Deleting your account removes your account and your content. Reports, and what we decided about them, are kept afterwards, so an account removed for abuse cannot simply start again. Some records may persist briefly in backups before they age out.',
    ],
  },
  {
    heading: 'Your choices',
    body: [
      'Turn name search off in Settings, Privacy, so only someone with your exact email can find you.',
      'Turn location sharing off at any time, which also erases what was stored.',
      'Turn push off for a device in Settings, Privacy.',
      'Wipe every file you have uploaded in Settings, Storage & plan, Sync & Storage.',
      'Delete your account in Settings, Account & security.',
      'To request a copy of your data, email us.',
    ],
  },
  {
    heading: 'Security',
    body: [
      'Passwords are stored hashed, never in readable form. Traffic between the app and our servers is encrypted in transit.',
      'You can add a second sign-in step, a code sent to your email, in Settings.',
      'No system is perfectly secure. If a breach affects you, we will tell you.',
    ],
  },
];
