# Chat: what it does today, and how it could do more

Status: **all five phases approved (2026-11-17), nothing built.** Canvas mockups are boards 120–148 on the design canvas and await approval before the build.

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
