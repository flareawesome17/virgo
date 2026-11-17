# How clients pay you: review and plan

Status: **approved 2026-11-17 as "A with safety"** (boards 109–117 and 150–152), built on branch `feat/pay-methods` and opened as PR #241. The chat pay card and booking pay details (118–119) were then approved and built on the same branch: a `pay-card` message kind (migration 110), `POST /messages/:id/pay-card`, the card in both apps' threads, the Send how to pay sheet with "A Virgo chat", and `payTo` on a confirmed booking for the poster.

> "you fill out the fields, add your account then can even attach your bank's QR but I don't get how this works, like what was the QR for? when it won't let you show it for the clients to scan? it just doesn't make sense."

The complaint is right. You can save a QR, but you can never show it to anyone yourself. It reaches a client only through a link that the screen never explains.

## How it works today

**Setting it up.** Money → the QR button beside *Add entry* → *How clients pay you*. You can add up to 4: GCash, Maya, Bank or Other, each with an account name, a number and an optional QR image (a screenshot). Each one needs either a number or a QR. Tapping a saved one opens the edit form. The list shows the QR as a 64-point thumbnail, and nothing on the phone or web shows it any bigger.

**The only way it reaches a client: a package statement.** Money → a package → *Share statement* turns on a private link (`/s/statement/<token>`) and opens the share sheet with that link. The client opens a plain web page with the total, what's paid, what's still due and, under **How to pay**, *every* saved pay method in the order you added them, each with its number and a 148 px QR (200 px on a phone). After that comes "Send <name> a screenshot of your payment…". The whole How to pay section disappears once the package is paid in full. The page runs no script, isn't cached, and pulls pay methods live, so editing or removing one changes statements you've already sent.

**Where it doesn't reach a client:**

| Place | Pay details? |
|---|---|
| Package statement link `/s/statement/<token>` | Yes, the only place |
| Showing it on your own phone to scan | No. There's no full-size view at all |
| Share sheet (Messenger, Viber, SMS) | Only as the statement link; never the QR or the number on their own |
| Chat | No. Text only, plus the app's own "job accepted" card |
| Bookings (a job poster hiring a creative at an agreed rate) | No |
| Album client links `/s/<token>` | No |
| Public profile `/u/<handle>` | No |
| Invoices | None exist; the statement says it isn't one |
| Web and desktop | Same list and edit dialog as the phone (64 px thumbnail, click to edit); desktop is the web app |

Code: phone `mobile/app/(app)/money/pay-methods/{index,edit}.tsx`, entry points `mobile/app/(app)/money/index.tsx` (QR button) and `money/packages/[id].tsx` (Share statement, "How clients pay you" row). Server `api/src/money/money-pay-methods.service.ts` and `money-packages.controller.ts` (`/money/pay-methods` CRUD, `/money/packages/:id/share`, public `/s/statement/:token`). The page itself is `statement.template.ts`. Tables: `money_pay_methods` (it already has an unused `position` column) and the QR stored in `money_receipts.pay_method_id` (migration 094). Web: `web/src/app/(app)/money/pay-methods/page-client.tsx`, `web/src/components/money/pay-method-dialog.tsx`.

## Why it doesn't make sense

1. **The word "statement" is never explained.** The screen says "Shown on statements you share", but statements live inside packages, which sit behind a different button. Nothing connects the two.
2. **You can't show your own QR.** The most common use is in person: collecting the balance at the event and asking the client to scan. That's impossible today, because tapping the QR opens the edit form.
3. **You can't send pay details without making a package.** A quick job or a "send me the down payment" chat has no way to pass on your GCash.
4. **A client on their phone can't scan a QR that's on the same phone.** They have to save the image and use *Upload QR* in GCash or Maya. Nothing on the statement tells them that, and there's no way to open the QR on its own to save it.
5. **There's no main method.** Every method shows with equal weight in the order you added them, and they can't be reordered.
6. **Bookings and chat leave it out**, even where one Virgo user owes another an agreed rate.

## Proposal

Details and QR only. No payment processing, and Virgo never holds money. That part doesn't change.

### 1. A main way to pay
- The first method you add becomes **Main**. *Make main* in its menu moves another one to the top. This uses the existing `position` column, so no new table is needed, just a reorder route.
- Main comes first and biggest everywhere. The others sit under *Other ways to pay*.

### 2. Show to scan, in person
- Tapping a method opens a full-screen **Scan to pay** view: a white background, the QR as large as the screen allows, then GCash/Maya/bank name, account name and number. Swipe to reach the others. The screen stays awake. Edit moves to a pencil in the corner.
- With no QR saved, it shows the number large with *Copy*, which still works for bank transfers.
- Buttons: **Copy number · Save to Photos · Share**.
- **From Money, for quick sends** (asked for by the user 2026-11-17): the icon-only QR button becomes a labelled **Show QR** button beside *Add entry*. It opens a *Show a QR* sheet with every saved account as a large tile (GCash, Maya, BPI, BDO…), the main one first. An account with no QR shows "Number only". Tapping a tile opens that account's QR full screen. With only one account saved, it skips the sheet. On the full-screen QR, chips along the top switch to another account in one tap. *Edit ways to pay* moves into the sheet. (Boards 150–152.)
- Other ways in: a package gets **Show QR** beside *Record payment*. When opened from a package, the view also offers *They've paid → Record payment*, with the balance filled in.

### 3. Sending it
- **Share sheet**, to wherever clients actually are (Messenger, Viber, SMS): the QR image plus one line, e.g. "GCash · Juan Dela Cruz · 0917 123 4567". iPhones can share the image today. On Android the built-in share sends text only, so Android sends the line and offers Save to Photos until the next native build adds image sharing.
- **Statement link**: kept, and improved (see 4).
- **Chat** (needs a decision, see below): *Send how to pay* in a conversation posts a pay card, built the same way as the existing "job accepted" card. It shows the main method, number and a QR thumbnail, and tapping it opens the full-size QR. This is a card drawn from your saved details, not an image upload.
- **Bookings**: once confirmed, the poster sees the creative's main way to pay ("Pay <name>"), with Show QR. Only the other side of that booking sees it.
- **Not on the public profile.** Anyone could read your account number there, and a fake profile could copy it.
- **Not on album client links** for now: albums aren't tied to packages.

### 4. What the client sees
- **In person**: your phone showing a big QR, your name and your number.
- **On Messenger or Viber**: the QR image and one line of details.
- **On the statement page**: *How to pay* moves up under the balance and shows the amount to send ("Send ₱15,000"). The main method comes first with a bigger QR and an *Open QR full size* link (the image alone, so it's easy to long-press and save). Under it: "On your phone? Save the QR, then in GCash or Maya tap Scan → Upload QR." Other methods sit in a fold that works without script. Numbers are large and easy to select.
- **In Virgo** (chat or booking): the pay card, which opens full-screen.

### 5. The setup screen
- Subtitle: "Show your QR to scan, or send it to a client" in place of "Shown on statements you share".
- One line on where it shows: *Scan to pay · package statements · bookings · chat*, depending on what gets approved.
- A QR help line: most GCash, Maya and bank QRs are now QR Ph, so a client can usually pay yours from another wallet or bank app (fees may apply).

### 6. Keeping it safe, because money is involved

The user asked for the feature to show it is "end-to-end encrypted". It isn't, and the boards don't say so. Virgo's server reads pay details to draw the statement page, and chat isn't end-to-end encrypted either. Pay details are meant to be handed to every client, so keeping them secret isn't what protects the money. The real danger is a **swap**: someone gets into the account (as with the workspace deleted on 2026-10-25) and puts their own QR in place of yours. Then clients pay the wrong person. So:

- **Changes need your password.** Adding, changing or removing a way to pay asks for the password, or an emailed code when two-step sign-in is on. This reuses `ReauthService`, the same check album and workspace deletes already use.
- **You're told.** Every change sends an email and a notification, the same way sign-in alerts are sent, with a way into Devices.
- **The client is told.** The statement says when the pay details last changed. For a day after a change, it shows a "These pay details are new" warning above the QR.
- **A name check:** the client is asked to check that their app shows your name before sending.
- **True today, and said plainly:** the statement link is private and random, sent over a secure connection (https), never listed by search engines, and you can turn it off at any time. Stored QR images are served through links that expire after an hour.

Real end-to-end encryption (details encrypted on the phone, with a key only the link carries) would hide account numbers from Virgo's own database. But it wouldn't stop a swap, it would break live updates to statements, and it would need scripts on a page that runs none today. It isn't recommended.

Canvas: boards 108–119 and 150–152 (numbers 120–148 belong to the chat-upgrades boards) on the "Virgo Home Screen Direction" canvas (https://claude.ai/artifact/2m6a8akAfk4qWYLuwQuwt4), in the rows "How clients pay you: show it, send it, keep it safe" and "What the client sees".

## Build order, after the canvas is approved

1. **Phone and server (can ship as an OTA):** main and reorder, Scan to pay, Copy / Save / Share, the new ways in from Money and packages, the setup copy, and the statement page changes. Add the safety part too: the password check on pay-method changes (older apps will be told to update, as with deletes), the change email and notification, and the statement's "last changed" date and "new" warning, which needs a changed-at time stored per method. Web gets Scan to pay as a large dialog; the statement page is server-made, so web gets it for free. Keep the client copies in sync (`node scripts/check-client-sync.mjs`), and bump `CACHE_VERSION` if the pay-method payload changes shape.
2. **Chat pay card and booking card**, if approved: a new message type in the API, the phone and the web.
3. **Next native build:** image sharing on Android (`expo-sharing`), full screen brightness while showing the QR (`expo-brightness`). Optionally one "pay card" picture with the QR, name and number baked in, so the details survive forwarding (`react-native-view-shot`).

## Decisions for the user

1. **Direction:** (A) phase 1 above (recommended), (B) smaller: just Scan to pay and Save, with no main method or statement changes, or (C) A plus chat and bookings now.
2. **Chat:** a pay card, plain text lines, or nothing? Launch said text-only chat. A card isn't an upload, but it's your call.
3. ~~Money's QR button~~ Settled 2026-11-17: Money gets a labelled Show QR button that opens the account picker (boards 150–152).
4. **Bookings:** show the creative's pay details to the poster once a booking is confirmed?
5. **Safety:** password on every pay-detail change, an email when they change, and a "new details" warning for clients (recommended), in place of an "end-to-end encrypted" label?
