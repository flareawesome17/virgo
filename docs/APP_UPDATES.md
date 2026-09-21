# Update announcements

When Virgo ships an update, the people it affects get a notification about it —
in the notification list on every platform, and as a push on phones. Each
announcement says which platforms and which versions it is for, and a client
only ever sees the ones that apply to it.

## Why targeting has to be chosen, not detected

Every `v*` release rebuilds the web app **and** all three desktop installers,
whether or not it changed them. An API-only fix still produces a new Windows
installer. So "a new build exists" is not the same as "this changed for you",
and announcing every build everywhere would tell people about changes that do
not touch them.

Only whoever shipped the update knows what it actually changed. So each
announcement is posted by hand — by the same person, at the same moment, as the
ship itself.

## Who sees what

A client sees an announcement when **all** of these hold:

| rule | why |
| --- | --- |
| its platform is in the announcement's `platforms` | a Mac fix is not news in a browser |
| its version is within `min_version`…`max_version`, when either is set | an OTA reaches exactly one native version |
| the announcement was published after the account was created | a new account has no use for old notes |
| the announcement is under 90 days old | the same window the notification list keeps |

Platforms are `web`, `windows`, `macos` (the desktop app), `ios` and `android`
(the phone app).

A client that reports no version sees only announcements with **no** version
bounds. A bound exists because the update does not apply everywhere, so an
unknown version is left out rather than assumed to match.

### Common shapes

| update | platforms | version bounds |
| --- | --- | --- |
| Web change (also reaches desktop, which runs the same client) | `web,windows,macos` | none |
| Desktop-only change, e.g. the installer or updater | `windows,macos` — or just one | none |
| Mac-only fix | `macos` | none |
| Phone OTA | `ios,android` | `min` = `max` = the one native version it reaches, e.g. `1.3.4` |
| New phone build, e.g. 1.3.5 | `ios,android` | `max_version` = `1.3.4` — only the builds below it |
| Server change people notice everywhere | all five | none |

## Posting one

```bash
gh workflow run announce-update.yml \
  -f slug=ota-1.3.4-instant-images \
  -f platforms=ios,android \
  -f min_version=1.3.4 -f max_version=1.3.4 \
  -f title="Pictures load instantly" \
  -f body="Thumbnails and profile pictures you've already seen now open straight from your phone."
```

- **`slug`** is the announcement's identity. Posting the same slug again does
  nothing — no second entry, no second push — so a re-run is always safe.
- **`url`** is optional and opened when the announcement is tapped. The desktop
  app can only open links on `api.virgo.ph` (a deliberate restriction on what a
  page can make the app open), so prefer those.
- **`push`** defaults to true. Only phones are ever pushed, and only phones that
  registered with an app version — see below.

## Phones and push

A phone reports its app version when it registers for push, on every launch.
Announcements are pushed only to devices that did. That is what makes version
targeting possible, and it is also what guarantees the device can show the
push: registering creates the Android "App updates" channel first, and Android
does not display a notification sent to a channel the device never created.

Devices registered by a build older than this feature report no version, so they
are not pushed announcements until they update — which, for an OTA, is their
next launch.

Pushes arrive on the "App updates" channel: visible, silent, and mutable on its
own in Android's settings without silencing anything else.

## One-time setup

The workflow and the API share one secret, `APP_UPDATES_TOKEN`. It lives in two
places and nowhere else — never in the repository, never in a chat.

1. **Generate it** on your own machine, from the operating system's
   cryptographic random source — not `Get-Random`, which is predictable and
   wrong for a secret:

   ```powershell
   $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes); [Convert]::ToBase64String($bytes)
   ```

2. **Give it to GitHub** as a repository secret named `APP_UPDATES_TOKEN`
   (Settings → Secrets and variables → Actions), or:

   ```bash
   gh secret set APP_UPDATES_TOKEN
   ```

   which prompts for the value rather than taking it on the command line.

3. **Give it to the API**: add `APP_UPDATES_TOKEN=<the value>` to
   `C:\VirgoProduction\.env`, then restart it:

   ```powershell
   docker compose -f docker-compose.prod.yml up -d --force-recreate api
   ```

Until both are set, the workflow fails with a message saying so, and the API
answers `503` — nothing else is affected.

## Where it lives

| piece | file |
| --- | --- |
| Tables | `api/migrations/066_app_updates.sql` |
| Targeting rules, and their tests | `api/src/notifications/app-update-targeting.ts` |
| Listing, read state, push | `api/src/notifications/app-updates.service.ts` |
| The endpoint the workflow posts to | `api/src/notifications/app-updates.controller.ts` |
| Each app saying what it is | `{web,mobile}/src/api/client-identity.ts` |
| The workflow | `.github/workflows/announce-update.yml` |
