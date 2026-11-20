# Chat: what it does today, and how it could do more

Status: **all five phases approved (2026-11-17), designs approved (boards 120–148).** Phase 1 is PR #244. Phase 2 is PR #245, on top of Phase 1 and the pay card (PR #243). Phase 3 is PR #246, on top of Phase 2. Phase 4 is PR #248, on top of Phase 3. Phase 5 is being built on `feat/chat-voice`, on top of Phase 4. See *Phase 2 as built* through *Phase 5 as built* at the end.

> "elevate the features for the chat too, be able to do more"

## In short

Chat already does more than it shows. It has groups, replies, unsend, @mentions, typing, "seen" ticks, online and last seen, mute, search, and report and block. It runs live over a socket on phone, web and desktop. What it can't do is anything except words. Links aren't even tappable, and nothing from the rest of Virgo (albums, bookings, jobs, the calendar, money) can be put into a chat.

Most of the upgrades below need **no uploads and no new storage**. They link to things people already have in Virgo, and all of them can reach installed phones as an over-the-air update. Only photos and files from your own phone, and voice notes, would change the "text-only chat" launch decision. Voice notes and the camera also need a new store build, because the microphone and camera permissions are switched off in the apps people have installed.

## Who chat is for

You can only chat with **people you're connected with** on Virgo. A connection request, a hire enquiry you accept, or a job application you accept all count. Most clients never make a Virgo account: they get a client link and talk to you on Messenger or Viber. So in practice Virgo chat is creative to creative: second shooters, editors, coordinators, people you hired or who hired you, and the occasional client who signed up.

That decides the direction. The best upgrades help **a crew run a shoot** and **connect chat to the rest of Virgo**. A full client inbox would need clients without accounts to message you (see *Not now*).

## What chat does today

| | Phone | Web + desktop | Server |
|---|---|---|---|
| One-to-one chats | Yes | Yes | Reuses one chat per pair. Connected people only |
| Group chats | Yes. Make, rename, add, leave | Yes, same | Up to 50 people at creation. Any member can add their own connections and rename. **No removing people, no admins, no group photo** |
| Text | Up to 4,000 characters | Same, Enter sends | `messages.body` |
| Links | **Plain text, not tappable** | **Plain text, not tappable** | — |
| Replies (quote a message) | Yes, long-press → Reply | Yes, from the message's menu | `reply_to_id` |
| @mentions in groups | Yes, with a picker | Yes, Tab picks | Mentions get a louder push |
| Delete for me / for everyone | Yes | Yes | Unsent messages leave a "deleted" marker |
| Edit | **No** | **No** | — |
| Reactions | **No** | **No** | — |
| Copy | Yes | Yes | — |
| Forward | **No** | **No** | — |
| Sent / delivered / seen ticks | Yes. Groups show "seen by N" | Yes | From each phone's own fetch, sent live |
| Who saw it, by name | **No** | **No** | Already known (`last_read_at` per person) |
| Typing… | Yes, in the chat and the list | Yes | Live only, never stored |
| Online / last seen | Yes, one-to-one only | Yes | In memory plus `users.last_seen_at` |
| "New messages" line, older history | Yes | Yes | Pages of 100 |
| Search | The list searches names and message text, and shows the matching line | Same | **Opens the chat at the bottom, not at the match. No search inside a chat** |
| Mute | 1 hour, 8 hours, 1 week, always | Same | Mutes the push only. Still counts as unread |
| Delete a chat | Clears it for you only | Same | `cleared_at` |
| Archive, pin to top, mark unread | **No** | **No** | — |
| Push notifications | Yes, own Android channel, app-icon badge | Browser and desktop alerts | Expo push, skipped when muted or blocked |
| Report and block | From the person's row in chat info | Same | A report copies the last messages you could see as evidence. Staff never read chats |
| Cards (not someone typing) | "Job accepted" card | Same | `kind` is `text` or `job-accepted`. Nothing else is allowed |
| Opened from elsewhere | Profiles, People, Nearby, accepted hire enquiries, accepted job applications, a booking's *Open chat* | Same | — |
| Live updates | Socket, with a slow poll every 45–60 s as a backstop | Same | Plain WebSocket at `/ws` |

### What's text-only, and why

- **Launch decision (2026-09-30): text-only chat.** Free plans get 15 GB, and anything sent in chat would have to count against someone's storage, be cleaned up, and be checked when reported. Text costs nothing to store and a report can copy it word for word.
- **The installed apps can't record.** Microphone and camera are switched off (`microphonePermission: false`, `cameraPermission: false`, `recordAudioAndroid: false` in `app.json`). Turning them on takes a store build.
- **Photo library access already works.** The picker that adds photos to albums needs no extra permission on iOS, and it's in the installed apps. So photos from your phone could reach installed phones by OTA if text-only is lifted.

## The upgrades, weighed

Effort is per part: **S** ≈ a day, **M** ≈ 2–4 days, **L** ≈ a week or more. "OTA" means it can reach phones people already have installed.

### Everyday basics

| | What it is | Why it matters | API / Phone / Web | Storage + cost | Ships by |
|---|---|---|---|---|---|
| **A1. Tappable links + Virgo previews** | Links open. A link to a Virgo profile, post, job or client link shows a small preview card (cover, title, who) | People already paste client links and posts into chat, and today they have to copy them out | S / S / S | None. A preview is a lookup, not a copy | OTA |
| **A2. Reactions** | Long-press → 👍 ❤️ 😂 😮 😢 🙏, shown under the bubble. Tap to see who | "Noted" without another message, which a busy crew group needs most | S / M / S | A tiny row per reaction. No push | OTA |
| **A3. Edit** | Fix your own message for 15 minutes, marked *Edited* | Typos in a rate, a time or an address get fixed in place, not resent | S / S / S | The earlier text is kept for reports | OTA |
| **A4. Seen by, with names** | Tap "seen by 3" in a group to see who, and when | "Did the second shooter see the call time?" | — / S / S | None. Already stored | OTA |
| **A5. Archive, pin, mark unread** | Pin a few chats to the top, archive old ones (they come back when someone writes), mark one unread to come back to | The list fills up with old job chats | S / M / S | None | OTA |
| **A6. Saved replies** | Save up to 20 snippets ("Rates 2027", "What's included", "Down payment terms") and insert one from the composer | Hire enquiries ask the same questions every time | S / S / S | None | OTA |
| **A7. Forward** | Send a message or card on to another chat | Pass a call time or venue to someone not in the group | S / M / S | None | OTA |

### Share Virgo things as cards

Built on the "job accepted" card, so it's the same kind of thing. A card shows live details pulled at read time, not a copy, so a moved booking or an edited package shows the latest version.

| | What it is | Why it matters | API / Phone / Web | Storage + cost | Ships by |
|---|---|---|---|---|---|
| **B1. The card system** | A **+** in the composer opens *Share…*: Photos from an album, Booking, Job post, Post, Package, Plan a date | One way in, so each new card is small after this | M / M / M | None | OTA |
| **B2. Photos from your albums** | Pick photos or a film from an album you manage. Chat shows up to 4 thumbnails and "+8 more", and tapping opens the gallery | Send picks to the editor, or selects to the second shooter, without downloading and re-uploading | M / M / M | **No new storage.** It makes (or reuses) a *part link* to just those files, the same as a client link to a selection. Thumbnails are small. Full downloads count toward the album's download allowance as they do today | OTA |
| **B3. Booking, job post, post and package cards** | The thing's title, date, rate or status, and a button to open it | "Which job was this again?" gets answered inside the chat | S each / M / M | None | OTA |
| **B4. Plan a date** | *+ → Plan a date*: title, date, time, type (shoot, meeting, editing…). It goes on your calendar, invites everyone in the chat, and posts a card with **Going / Can't go** | Crews agree dates in chat today and then re-enter them by hand | M / M / M | None. Uses the calendar's existing invites | OTA |
| **B5. How to pay card** | Your main GCash, Maya or bank details and QR as a card | Asking for the down payment in a chat | **Owned by the "How clients pay you" plan** (its decision 2). B1 gives it the card system to plug into | None (drawn from saved details) | OTA |

### Crew chats

| | What it is | Why it matters | API / Phone / Web | Storage + cost | Ships by |
|---|---|---|---|---|---|
| **C1. Workspace chat** | Each workspace gets one group chat. People join and leave it as they join or leave the workspace. People with the *client* role are left out unless you add them | The studio's own team channel, with nothing to set up | M / M / M | None | OTA |
| **C2. Job crew chat** | On a job post with several people hired: *Start crew chat* puts everyone hired, plus you, in one group, with the job card at the top | A wedding with a photographer, a video shooter and an editor booked on one post | S / S / S | None | OTA |
| **C3. Group controls** | Whoever made the group is its admin and can make others admins. Admins can remove people, set a group photo and a short description | A crew group today can't drop someone who left the team | M / M / M | One small photo per group | OTA |
| **C4. Pinned messages** | Pin up to 3 messages per chat (call time, venue, mood board link), shown in a strip under the header | The one message everyone scrolls up for | S / M / M | None | OTA |
| **C5. Search inside a chat** | Search one chat, and jump to the match, from the list's search too | "What did we agree on the rate?" | M / M / M | None | OTA |

### Beyond text (changes the launch decision)

| | What it is | Why it matters | API / Phone / Web | Storage + cost | Ships by |
|---|---|---|---|---|---|
| **D1. Photos and files from your device** | Up to 10 photos (shrunk to about 2,000 px, around 0.5 MB each) or a PDF up to 20 MB, such as a call sheet, contract or mood board. No videos: send a film through an album (B2) | Reference photos, screenshots, shot lists | L / M / M | **Counts toward the sender's storage.** Removed when unsent, or when everyone has left the chat. Reports would copy attachments as evidence | OTA. Installed phones can already pick photos and files |
| **E1. Voice notes** | Hold to record, up to 2 minutes, play at 1× / 1.5× / 2× | A lot of Filipino crews talk in voice messages on Messenger | M / L / M | Tiny: about 0.25 MB a minute, counted toward the sender's storage. Shares D1's storage | **Store build** for phones (microphone is off). Web and desktop could record sooner |
| **E2. Camera in chat** | Take a photo from the composer | Quick snaps on set | — / S / — | Via D1 | **Store build** (camera is off) |
| **E3. Reply from the notification** | Type a reply straight from the lock screen | Fast answers on a shoot day | S / M / — | None | Probably OTA on iPhone. Needs a device test, and Android may need the store build |

### Not now

- **Clients without accounts messaging you from their client link.** This is what would make chat a real client inbox, but it brings spam, email sign-in for guests, and email notifications, and it competes with Messenger, where clients already are. Worth its own plan later.
- **Voice and video calls, disappearing messages, scheduled send, AI replies.** These cost a lot, or matter little to this audience.
- **End-to-end encryption.** It would break chat search and report evidence. Chats are private by policy: staff never read them.

## Works on a weak signal (every phase)

> "we even want it to have a chat compatibility even on low data like the old facebook messages"

A lot of chat happens on prepaid data, on 3G or one bar of 4G at a venue, with "Save data" switched on. Chat has to stay usable there, the way Messenger Lite was. This applies to every phase, not just one. Opening the app with no connection at all is being fixed separately (`fix/offline-cold-start`): the app opens on its saved screens, and this plan assumes that.

**What it costs today.** While a chat is open, the app downloads the newest 100 messages again every 45 seconds, and the chat list every 60 seconds, as a backup in case the live connection drops. The live connection already delivers every new message, so on mobile data most of those downloads are repeats. Nothing waits for a tap: whatever arrives in the thread loads straight away.

**The rules**

1. **Words first.** A chat opens instantly on what the phone already has, then shows new words and small cards before any picture. Sending never waits for a picture, preview or file.
2. **Only what's new.** No backup re-downloads while the live connection is up. When it drops and comes back, the app asks only for messages after the newest one it has (one new `after` option on the thread), and refreshes the list once. On a slow line, a chat opens on the newest 30 messages instead of 100, and older ones load as you scroll up, as now.
3. **Pictures wait on a slow line.** A setting, like Messenger Lite's: *Load photos, films and voice notes automatically:* **On Wi-Fi and fast data** (default) · **Always** · **Only when I tap**. When pictures aren't loading automatically, a link preview, album card or photo shows a tiny blurred stand-in with its size, and loads when tapped. The blurred stand-ins already exist for album files (about 300 bytes each). Profile pictures stay, because they're small.
4. **Sending queues instead of failing.** The outbox already holds a message sent offline and sends it when the connection comes back. Reactions and edits get the same treatment. Photos and voice notes (phases 4–5) send their words first, then upload in the background and resume after a dropped connection, showing "Waiting for a connection" rather than an error.
5. **Smaller uploads on a slow line.** Photos from the phone go at about 1,280 px (around 200 KB each) instead of about 2,000 px (around 0.5 MB). Full-size photos always go through an album. Voice notes are recorded at a low bitrate: about 120 KB a minute.
6. **No big downloads on a weak signal.** Files and voice notes from others show their size and wait for a tap, unless pictures are set to load automatically. Nothing over about 300 KB downloads on its own on mobile data.
7. **Links stay cheap.** On a slow line or with "Only when I tap", a link preview is just its title line: one small request, saved for later. No image.
8. **Small signals stay, chatter goes.** Typing and online stay, because they're tiny. On 2G the app sends only "started typing" and "stopped", not the every-3-seconds "still typing".
9. **Read from the notification.** Pushes already carry the words (up to 140 characters), so a message can be read without opening the app or loading the chat.
10. **Lean on the wire.** Keep message payloads compact. The API's replies are already compressed on their way to phones: checked 2026-11-17, Cloudflare serves JSON from api.virgo.ph with brotli.
11. **Same on web and desktop.** They follow the browser's "Save data" and slow-connection hints the same way.

**How it's detected.** On phones, through the network-info module already in the installed apps: Wi-Fi or mobile, 2G, 3G, 4G or 5G, and whether the connection is metered. So this ships by OTA too. On web and desktop, through the browser's connection hints.

**Where it lands**
- **Phase 1:** the setting, rules 1, 2, 4 (reactions and edits), 7, 8, 10 and 11, and link preview images following rule 3. About 2–3 extra days.
- **Phase 2:** album, post and package cards follow rule 3.
- **Phase 4:** photos and files follow rules 4, 5 and 6.
- **Phase 5:** voice notes follow rules 4, 5 and 6.

## Phases

Each phase ships as **one server release and one OTA to all three phone versions** (iPhone, Play Store Android, virgo.ph APK). That keeps GitHub storage and EAS update counts down. Rough times are for one builder.

### Phase 1: Everyday basics (A1–A7, about 1½–2 weeks)
Tappable links and Virgo previews, reactions, edit, seen-by names, archive / pin / mark unread, saved replies, forward. No uploads, so it fits text-only. It also brings the weak-signal groundwork: the "load automatically" setting, no repeated downloads while live, catch-up with only what's new, and queued reactions and edits.

### Phase 2: Share Virgo things (B1–B4, about 2–3 weeks)
The composer's **+**, album photos as part-link cards, booking / job post / post / package cards, and Plan a date. The **how to pay** card (B5) slots in here if the "How clients pay you" plan approves it. Whichever of the two lands first builds the card system, and the other uses it.

### Phase 3: Crew chats (C1–C5, about 2–3 weeks)
Workspace chat, job crew chat, group admins / remove / photo / description, pinned messages, search inside a chat.

### Phase 4: Photos and files from your device (D1, about 1½–2 weeks), only if text-only is lifted
The upload, storage and clean-up groundwork that voice notes reuse.

### Phase 5: With the next store build (E1–E3, about 1½ weeks plus store review)
Voice notes, the camera, and a wider photo-access explanation for the App Store. Web and desktop could get voice notes after Phase 4, before the store build.

**Recommended:** 1 → 2 → 3, then decide on 4 and 5. Phases 1–3 make chat useful for crews and tie it to albums, bookings, jobs, money and the calendar, while staying text-only and adding no storage.

## Decisions for the user

1. **Which phases, in what order?** Recommended: 1 → 2 → 3 now, and 4–5 decided later.
2. **Text-only:** keep it for now (phases 1–3 add no uploads), or lift it for photos and files (Phase 4) and voice notes (Phase 5)?
3. **Reactions:** a fixed set of six (recommended), or any emoji?
4. **Edit window:** 15 minutes (recommended), an hour, or any time?
5. **Workspace chat:** made automatically once a second person joins a workspace (recommended), or only when someone taps *Start team chat*?
6. **Storage for Phase 4–5, if lifted:** count toward the sender's 15 GB (recommended), or a separate small chat allowance?
7. **Weak signal, added 2026-11-17:** fold the weak-signal rules into Phase 1 before it ships (recommended), or ship Phase 1 as drawn and add them next? And should the "load automatically" setting default to **On Wi-Fi and fast data** (recommended) or **Only when I tap**?

---

## For the build

**Code map**
- Phone: list `mobile/app/(app)/(tabs)/chat.tsx`. Thread `mobile/app/(app)/chat/[id]/index.tsx` (long-press sheet, receipts, outbox). Info `.../[id]/info.tsx`. New chat `.../chat/new.tsx`. `mobile/components/chat/Composer.tsx` (draft, mentions, typing heartbeat), `ThreadRows.tsx` (bubbles, `Body` renders text with mentions and no links, the `job-accepted` card via `components/JobAcceptedCard`). Hooks `mobile/src/hooks/useChat.ts`, live events `useRealtime.ts`, typing and presence `src/lib/presence-store`.
- Web and desktop: `web/src/app/(app)/chat/**`, `web/src/components/chat/{thread,conversation-list,conversation-info,new-chat-dialog,job-accepted-card}.tsx`, `web/src/hooks/useChat.ts`, `useRealtime.ts`, browser alerts in `web/src/lib/alerts.ts`.
- Server: `api/src/messages/messages.{controller,service}.ts` (routes under `/messages`, because `/chat` is the AI proxy), `unread-sql.ts`. `api/src/realtime/realtime.gateway.ts` (`/ws`; events `message`, `message-deleted`, `read`, `delivered`, `conversation`, `typing`, `presence`). Push in `notifications/push.service.ts`. Blocks and reports in `api/src/safety/`. `messages.system()` writes cards (used by `hiring.service.ts`). Hire enquiries and job acceptance call `openDirect`.
- Tables: `conversations`, `conversation_participants` (`last_read_at`, `last_delivered_at`, `muted_until`, `cleared_at`), `messages` (`kind`, `context`, `reply_to_id`, `deleted_at`, `mentions`, `client_id`), `message_deletions`, `report_evidence`. Migrations 019, 021, 022, 023, 029, 047, 078 and 087.

**Shipping rules this plan follows**
- **Installed phones keep working.** A phone that doesn't know a new `kind` draws a plain bubble with the message's `body`. So every card's body must read well on its own and carry its link ("Shared 12 photos from *Santos Wedding* · virgo.ph/s/…"). Unknown socket events are ignored (no `default` in either `useRealtime.ts`). New live events can also send `conversation` so older apps refetch.
- **Payload changes bump `CACHE_VERSION`** on both clients (reactions, `edited_at`, pins, archive). Both clients keep the query cache for 24 hours.
- **The message `kind` check constraint** is a closed list. Each new card kind is a migration line. Add kinds in one migration per phase.
- **Client sync:** run `node scripts/check-client-sync.mjs`, and never copy `useChat.ts` raw between phone and web.
- **OTA base:** until iOS 1.3.5 and the new Android builds reach users, OTAs are cherry-picked onto `d5f7bfd`. That base already has the photo picker, document picker, audio playback, video, file system and clipboard, so phases 1–4 are OTA-safe. Recording audio and the camera need the store build.
- **Swipe actions in lists:** a gesture-handler pan inside a list blocks scrolling on iOS. Use the long-press sheet and menus for A2, A5 and C4, not swipe rows.
- **Reports:** A3 keeps earlier versions of an edited message, and a report copies them. Cards copy their `context`. D1 and E1 keep reported attachments until the report is closed.
- **Pushes:** none for reactions, edits or pins. Plan a date reuses the calendar's invite notification. A card sent by a person pushes like a message, with its body as the preview.
- **Real Postgres:** check new SQL on a throwaway PG18 or PGlite, not the specs' fake database.

## Phase 2 as built

On `feat/chat-cards`, which carries Phase 1 (`feat/chat-basics`, PR #244) and the pay card (`feat/pay-cards`, PR #243) merged in. Merge those two first; then this one's diff is only Phase 2.

**Server**
- Migration `112_chat_cards.sql`: six new message kinds, `album-photos`, `booking`, `job-post`, `post`, `package` and `date-plan`, and keeps 110's `pay-card`.
- `POST /messages/:id/cards` sends any of them, and `POST /messages/:id/messages/:messageId/answer` answers a date. Both live in `api/src/messages/cards/`, a module of its own, because bookings and hiring already import messages.
- A card stores only what the thing is. Reading the thread fills it in as it is now, as its sender may see it. A booking shows only from someone on it, a date only from its organiser, and a package only from its owner, without costs or profit. Anything gone shows as `null`, and the apps say so.
- Each card's body is a plain line with the thing's link, so the chat list, pushes and older apps read well.
- Sending refuses a frozen chat before anything is made: no client link and no calendar entry for a card that could never be sent.
- **Album photos** makes, or reuses, the same client link to just those files that the album's own "share a selection" makes. You need Manage on the album, and up to 500 files go in one card. The card shows four small thumbnails and their blurred stand-ins.
- **Package** shares the package's statement, which is what "Open statement" opens.
- **Plan a date** puts it on the sender's Schedule and invites the others in the chat through the calendar's own invites and notification. Only people the sender is connected with are invited: that is the calendar's rule. An answer from the card is the calendar's own answer. Going puts the date on your Schedule and tells the organiser, and the card's new count reaches the chat as an edit frame that apps from Phase 1 on apply in place.

**Decided while building**
- The board's "From your phone" group (photos, a file, the camera) is left out of the + sheet until Phase 4.
- Booking cards sit centred, like the job-accepted card: a booking is an agreement between two people, not one person's line. Only the two people on it see "Open booking".
- Forward and Edit stay text-only. Forwarding someone's package or booking card would show it to a chat they didn't choose.
- Reports copy a card's body, which holds the link, but not its context: `report_evidence` has no column for it.
- Cards that show pictures (album photos and posts) follow the weak-signal rule 3: blurred stand-ins until tapped when pictures aren't loading automatically.

## Phase 3 as built

On `feat/chat-crew`, which starts from Phase 2 (`feat/chat-cards`, PR #245). Merge #244, #243 and #245 first; then this one's diff is only Phase 3.

**Server**
- Migration `113_chat_crew.sql` adds:
  - a `notice` message kind;
  - on `conversations`: `workspace_id`, `hiring_post_id`, `photo_url`, `about` and `add_policy`;
  - `conversation_participants.is_admin`;
  - `messages.pinned_at` and `pinned_by`.
  - It makes every existing group's maker its admin. A group whose maker has left gets its longest-standing member.
  - It makes a team chat for every workspace that already has a team, opening with a notice.
- **Team chats** (`api/src/messages/crew/`, ChatCrewModule).
  - Made the moment a second person joins a workspace. The owner is its admin, and everyone in it except clients is a member.
  - People join and leave it as they join and leave the workspace (accepting, being removed, leaving, or a client's role changing), and it takes the workspace's name.
  - Becoming a client doesn't take someone out: that's an admin's call.
- **Crew chats.** `POST /messages/crews` lets the poster start one once two people are hired. Everyone hired is in it, it opens with a notice, then the job card. Anyone hired later joins, and anyone whose booking is cancelled leaves. A job post now says how many are hired, and its crew chat to anyone in it.
- **Admins.**
  - Admins change the name, About, photo, and who can add people, and they remove people and make admins.
  - A group always keeps an admin. The workspace owner and the job's poster are always admins of their chat.
- **Notices** say who was added, removed, joined or left. They're never pushed, never unread, can't be reacted to, pinned or unsent, and show as a plain line in apps from before notices.
- **Pins.**
  - Up to three per chat, the same for everyone; anyone in the chat can pin. A fourth answers 409 `PINS_FULL` unless it names one to take down.
  - Unsending a pinned message unpins it.
  - A small `pins` live frame tells apps to ask again.
- **Search inside a chat:** `GET /messages/:id/search`, plus `around` on the thread to open it at a match or a pin. The list search now says which message matched.

**Decided while building**
- A team chat shows a photo an admin sets, not the workspace's cover. The cover comes from an album that some of the team may not be allowed to open.
- A team chat is named after its workspace, so renaming the workspace is what renames it.
- Renaming any group is now for its admins. Before, any member could; a crew chat renamed by whoever tapped it is what admins are for.
- Ordinary groups keep "everyone can add people", as before; team and crew chats start with "admins".
- The team chat doesn't follow a block. A block only cancels pending workspace invitations, and inside a group two people across a block are already silenced towards each other.

**Found, not fixed (outside this phase):** applying for a job still treats a role as filled after its booking was cancelled. `HiringService.apply` counts accepted applications, not `HOLDS_ROLE`, unlike the board and the job page. Fixed separately in PR #247.

## Phase 4 as built

On `feat/chat-files`, which starts from Phase 3 (`feat/chat-crew`, PR #246). Merge #244, #243, #245 and #246 first; then this one's diff is only Phase 4.

**Server**
- **Migration `114_chat_files.sql`.**
  - Two message kinds, `photos` (1–10) and `file` (one PDF).
  - A `message_attachments` table. It is its own table rather than `user_files`, like receipts and support files: `user_files` is the album library, and everything that walks it would have to learn to step round chat.
- **Counted toward the sender's storage** (`QuotaService.storageUsed`).
  - Counting starts the moment an upload is signed, at the size declared, so a burst of upload links buys no room the account doesn't have. Once the bytes are checked, the stored size replaces it.
  - The console's storage figures count chat too.
  - A full account gets the usual 403 `STORAGE_FULL`.
- **Words first, on a weak signal.**
  - `POST /messages/:id/uploads` signs one message's worth of uploads.
  - `POST /messages/:id/files` sends the message straight away, with each attachment `uploading`.
  - Each photo fills in when its `POST …/uploads/:aid/done` lands, through a `message-edited` frame. `…/url` re-signs a link that lapsed during a long drop.
- **On arrival.**
  - A photo is re-encoded as a WebP of at most 2,048 px. That strips the camera's EXIF and GPS, whichever app sent it.
  - It gets a 640 px copy and a ~300-byte blurred stand-in.
  - A PDF is checked to be one, and its pages are counted from its page tree, inflating object streams; no PDF library.
- **The body is the plain line** for the list, pushes and older apps ("Sent 4 photos", then the caption). The caption is also kept in `context`. Search inside a chat matches a photo's caption and a file's name, never "Sent 4 photos".
- **Forward** gives the forwarder their own copies, made inside the store and counted to them, so the sender unsending takes nothing from where they went. **Add to album** files a copy into an album the same way, billed like an upload there.
- **Removing.**
  - Files go when their message is unsent.
  - They also go when nobody in the chat can see them any more: everyone left, cleared the chat past them, or deleted them for themselves. An hourly sweep does this.
  - Uploads signed and never sent, and those never finished, go a day on. The never-finished ones are marked failed, so the thread can say "Didn't arrive".
  - They go with the sender's account (`ChatFilesService.eraseFor`, in account deletion).
  - **An open report holds them** until it is closed, even after an unsend.
- **The storage screen.**
  - `GET /messages/files/usage` gives the bytes by chat, including chats you've left.
  - `GET /messages/files/sent/:conversationId` lists your photo and file messages there.
  - `POST /messages/files/unsend` takes them back from the storage screen, even in a chat you've left or across a block. It's your own storage, and a retraction reveals nothing.

**Phone and web**
- **The + sheet** gains "From your phone" ("From this computer" on web), with Photos and A file. The phone's Camera is there but disabled, marked "Next app update". Web also takes photos dropped onto the chat or pasted into it.
- **Check, then send** (board 141): a big preview with the selected photo removable, a strip that adds up to ten, a caption, the storage note, and **Send N photos** (or **Send file**).
  - Photos are shrunk on the device first: 2,000 px, or 1,280 px on a slow line.
  - A PDF over 20 MB is refused before anything uploads.
  - On web, a HEIC the browser can't open says so in plain words.
- **Sending is words first, and queued.** The message is in the thread at once, and each photo fills in as it lands, live for everyone.
  - Offline, it says "Waiting for a connection" and goes when the connection is back.
  - The phone keeps its queue on disk, with copies of the photos, so a closed app picks up where it stopped. Web keeps it for as long as the page is open.
  - Something that will never send says so, with a retry.
- **In the thread** (board 142): the 1, 2, 3, 4 and 5+ photo grids, the caption under them, and the file card.
  - Each photo's box is drawn at its own shape over its blurred stand-in.
  - With "Only when I tap", photos wait for a tap.
  - Full photos and PDFs load only when opened.
  - Reply quotes show "4 photos: …" or "File: …" with a tiny photo.
- **The viewer** (board 143) pages through a message's photos, with Reply, Forward, Save and Add to album. The phone reuses the album viewer's save to Photos.
- **Storage** (board 144) shows "Sent in chats" and "Chats using the most", including chats you've left. Opening one shows **What you sent there**, where you choose photos and files and delete them for everyone, behind a confirm. There's no Posts row, because no figure for it exists yet.
- **Out of storage** says what still sends (messages, album photos, cards and dates) and offers a way to the storage screen.
- `CACHE_VERSION` is v18 on the phone and v16 on web.
- **Every phone module used is already in the installed builds**, so the phone half ships by OTA. The phone's upload reuses `putFileToBucket`, which is unchanged since `d5f7bfd`.

**Checked**
- **API:** 1,341 tests pass (25 new in `chat-files.service.spec.ts`), and tsc is clean.
- **Real Postgres 18,** with a bucket stand-in that stores uploads, through a private API: every rule above end to end, including the report hold and the sweep's selection.
- **Phone and web:** both typecheck, lint is clean on the changed files, and client sync passes.
- **Both apps were driven end to end in previews:**
  - picking, checking and sending;
  - the other person seeing the words first and then the photos;
  - the viewer and its four actions;
  - a PDF;
  - offline and resumed sends;
  - "Only when I tap";
  - storage, What you sent, and delete for everyone;
  - out of storage;
  - web at 390 px.

**Not checked**
- **On a real phone:** the native upload from disk, picking up after the app is killed, HEIC turned into JPEG, saving a WebP to Photos, the keyboard, and Android back.
- **Opening a PDF on Android** probably downloads it rather than showing it.
- **The confirm steps that use the phone's system alert.** The web preview can't show those.
- **The desktop app's own shell:** dropping files, saving, and opening a PDF in the system browser.

**Decided while building**
- **Photos travel as WebP**, like profile covers. Saving one keeps the .webp name.
- **No video in chat.** A film goes through an album card, as the plan said.
- **The words go before the photos.** A message can sit in the thread with photos still on their way. The alternative was a caption held back until every photo had landed.
- **Reports keep the files on the server, but the console doesn't show them yet.** `report_evidence` copies the body ("Sent 4 photos" and the caption); showing the photos themselves in the console is a follow-up.

## Phase 5 as built

On `feat/chat-voice`, which starts from Phase 4 (`feat/chat-files`, PR #248). Merge #244, #243, #245, #246 and #248 first; then this one's diff is only Phase 5.

It is **two commits**, so the part that can reach installed phones by OTA stays apart from the part that needs the store build:
1. **Voice notes, and reply from the notification.** Server, web, desktop, and phone code that is safe on every installed build. On those builds the phone plays voice notes and gets the notification buttons, but shows no microphone and keeps Camera as "Next app update".
2. **The microphone and the camera, for the next store build.** `mobile/app.json` only. It changes the runtime version, so it can only ship in a new iOS and Android build (iOS 1.3.5+ and new Android builds). Never in an OTA to the installed apps.

**Server**
- **Migration `115_chat_voice.sql`.**
  - Message kind `voice` and attachment kind `voice`, on Phase 4's `message_attachments`.
  - `duration_ms` (what the recorder said, then what the server measured) and `waveform` (48 levels, 0–100).
- **Same flow as a photo:** sign, send the words, upload, finish.
  - One voice note per message, up to 5 MB, and at most 2:05 when measured.
  - The body is "Sent a voice note (0:32)", what the list, the push and an older app show. There's no caption.
- **On arrival** (`api/src/storage/chat-voice.ts`), one run of ffmpeg:
  - re-encodes whatever was recorded (AAC from a phone, Opus in WebM from most browsers, AAC from Safari) as AAC in an `.m4a`, mono, 22.05 kHz, 24 kbps (about 180 KB a minute), with the index at the front and every tag dropped;
  - measures the length and the waveform from a telephone-rate copy.
  - Opus doesn't play on iPhones, so a browser's recording has to be converted. The API image already has ffmpeg, which films use.
- **Everything Phase 4 does for a photo, it does for a voice note:**
  - counted toward the sender's storage;
  - forwarded as the forwarder's own copy;
  - listed and unsent from the storage screen;
  - held while a report is open;
  - swept, and erased with the account.
- **Search inside a chat never matches a voice note.**
- **Pushes for messages carry `categoryId: 'chat-message'` and the message id.** An app that registered the category shows Reply, Mark as read and Mute for 1 hour under the notification. An older one shows the notification as before.

**Desktop**
- `desktop/src-tauri/Info.plist` gains the microphone's reason, and `Entitlements.plist` gains `com.apple.security.device.audio-input`. Without them macOS ends the app when the web view asks for the microphone. They ship with the next desktop release, which also brings the web code that asks.

**Phone**
- **Hold to record** (board ChatVoiceRecord).
  - With nothing typed, send becomes the microphone. Hold to record.
  - Slide left to throw it away, or slide up to lock it hands-free. Locked shows a bin, the timer, the bars and send.
  - Let go to send. It sends by itself at 2:00.
  - A tap, or anything under a second, just says "Hold to record, let go to send".
  - Screen readers: double-tap starts it locked.
  - If a call takes the touch away mid-hold, it locks rather than sending or throwing it away.
  - Recorded as AAC, one channel, 24 kbps (weak-signal rule 5), and sent through Phase 4's upload queue, words first, waiting out a dropped connection and picking up after the app is closed.
- **The bubble** (board ChatVoicePlay).
  - Yours is in the bubble's colour; theirs is a white card. The waveform fills as it plays, "0:21 / 0:48" shows while it's going, and a 1× / 1.5× / 2× chip carries over to the next note.
  - One note plays at a time, through one player. Nothing loads until play is tapped (rule 6). It plays through the ringer switch and stops when the app is left.
  - States: Arriving…, Didn't arrive, Couldn't play · Tap to try again (which asks for a fresh link).
  - The bubble is a plain View, and its parts carry the long press. Wrapped in a Pressable, it swallowed the play button's press in the web build.
- **Elsewhere:**
  - quotes read "Voice note (0:32)" and pins "Voice note: 0:32";
  - the long-press menu has no Copy or Edit;
  - Forward says it goes as your own copy;
  - the storage screen lists voice notes with their length.
- **Camera** (board ChatPlus). The + sheet's Camera tile takes a photo and hands it to Phase 4's check-then-send screen, so it is shrunk and sent like a picked photo.
- **Reply from the notification** (board ChatLockReply).
  - Message pushes show Reply, Mark as read and Mute for 1 hour.
  - On iPhone, Reply sends in the background without unlocking, as Messages does; iOS's own setting decides whether replies can be typed on the lock screen.
  - **On Android, Reply opens the app to send.** The installed builds cannot run any of the app's code for a notification button while the app is closed, so a reply sent in the background would be lost then.
  - A reply goes through the message outbox with an id made from the notification, so a reply delivered twice is stored once, and one the phone didn't finish sending goes on the next open.
  - A button pressed before the app was listening (a cold start) waits for it.
- **What the installed builds get.**
  - They were built with the microphone and camera switched off, and on iOS asking for a permission the build never declared ends the app. So `src/lib/native-features.ts` reads app.json's `extra.nativeFeatures`, which the second commit sets. Missing means no.
  - Installed phones play voice notes and get the notification buttons. They show no microphone, and Camera stays "Next app update".
- **The second commit** (`mobile/app.json` only, for the store build):
  - the microphone and camera reasons;
  - the CAMERA permission on Android, without which expo-image-picker refuses to open the camera;
  - a wider photo-library reason ("…upload photos and videos to an album or send photos in a chat…"), which is the "wider photo-access explanation for the App Store" the plan asked for;
  - the `nativeFeatures` flags.
  - **Trap found and avoided:** expo-image-picker's `microphonePermission: false` deletes the microphone reason that expo-audio adds and blocks RECORD_AUDIO on Android. So it carries the same sentence. Checked with `expo config --type introspect`.

**Web and desktop**
- **The microphone in the composer** (board ChatWeb) records on click.
  - A bar shows the timer, live bars, Discard and Send. Escape discards.
  - It sends by itself at 2:00; under a second sends nothing.
  - The browser's own format is sent (WebM/Opus in Chrome, Edge and Firefox; MP4/AAC in Safari), and the server converts it.
  - "Microphone blocked" names where to allow it: the browser's site settings, or System Settings on a Mac and Windows Settings in the desktop app.
- **The bubble** works like the phone's, through one shared audio element with `preload="none"`. Your own note plays from this computer's copy until it's let go.
- **The site's Permissions-Policy said `microphone=()`**, which makes the browser refuse the microphone without asking. It now says `microphone=(self)`. The camera stays closed on web.
- **Desktop:** the Mac app gains the microphone reason and the `audio-input` entitlement (above).

**Checked**
- **API:** 1,357 tests pass, including new ones for voice uploads, the re-encode with real ffmpeg, the waveform and length, and the push category. tsc is clean.
- **Real Postgres 18 with the storing bucket stand-in** (`voice-check.cjs`, all OK):
  - a browser recording and a phone recording, each words first;
  - re-encoded and measured, with tags gone;
  - every refusal, including one over two minutes and bytes that aren't audio;
  - search never matching a voice note;
  - the chat list line;
  - Forward, the storage list and figures, and unsend.
- **Web, in headless Edge with a fake microphone:**
  - record, send, and the note arriving with a waveform;
  - the other person playing it, with nothing loaded before play;
  - the speed chip, and the end resetting.
- **Phone, in the Expo web preview** (the microphone switched on in the preview copy only):
  - play, the speed chip, pause part-way, and resume to the end;
  - the long-press menu;
  - hold to record, lock, throw away, and slide to cancel.
- **Both apps:** typecheck clean, lint clean on changed files, and client sync passes.

**Not checked**
- **On a real phone (needs the new store build):**
  - recording;
  - the iOS audio session after recording (it should go back to the speaker);
  - haptics;
  - the camera;
  - lock-screen Reply with the app suspended and with it closed;
  - Reply opening the app on Android.
- **On installed builds (OTA):** voice note playback and the notification buttons, on a device.
- **Safari and the Mac desktop app's recording.** The Mac app needs a desktop release first.

**Decided while building**
- **Voice notes are stored as AAC at 24 kbps** (about 180 KB a minute) rather than the plan's 16 kbps (120 KB). AAC is what every iPhone, Android phone and browser plays; Opus would be smaller but doesn't play on iPhones. At 16 kbps ffmpeg's built-in AAC encoder is thin for speech; nobody has listened on a phone yet, so this is worth a check.
- **No caption on a voice note.**
- **Reply from the lock screen doesn't ask to unlock.**
- **Reply on Android opens the app.** Sending in the background there needs a background task module (expo-task-manager) in a store build; that's a follow-up.
