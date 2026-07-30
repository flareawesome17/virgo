# Fullstack Supabase

Base template for RapidNative fullstack projects — a monorepo with an Expo app, a SQL database, and companion API/web workspaces.

```
├── mobile/            # Expo 54 + React Native 0.81 (primary workspace)
├── supabase/          # SQL migrations + seed — the schema's source of truth
├── api/               # Express.js API server
├── web/               # Static HTML web app
└── rapidnative.json   # Workspace manifest for the RapidNative editor
```

## Workspaces

- **mobile/** — Primary workspace. Expo Router 6 for navigation, NativeWind 4 for styling, TanStack Query 5 for data fetching, and `@supabase/supabase-js` for data and auth. See `mobile/README.md`.
- **supabase/** — The database. `migrations/*.sql` define the schema (Supabase CLI conventions, timestamped filenames); `seed.sql` inserts demo rows. At the repo root, not inside mobile/, because the database belongs to the project — all workspaces reach it and the Supabase CLI expects it here.
- **api/** — Minimal Express server with a health check endpoint. Add custom API routes here.
- **web/** — Static HTML placeholder for companion web pages.

## The database

The database is Supabase — the app talks plain `@supabase/supabase-js`, and the schema has exactly one source of truth: `supabase/migrations/*.sql`. `mobile/src/db/types.ts` is generated from the applied migrations — never edited by hand.

**In the RapidNative editor** the Supabase API is served by tinbase, a Supabase-compatible engine running inside your browser session. Two instances per project:

- **Designer** — rebuilt on every session start: all migrations, then `seed.sql`. Always reflects the current schema with fresh demo data.
- **Production** — persistent across sessions, migrations only. `seed.sql` never runs here.

Both are browsable from the editor's Database panel (Tinbase Studio). Connection env (`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`) is wired automatically at preview boot.

**Running locally** (after downloading the project):

```bash
# 1 — install app dependencies
cd mobile
bun install

# 2 — start the database (repo root; applies migrations + seed, serves on :54321)
cd ..
npx tinbase@0.11.1 start

# 3 — start the app (second terminal)
cd mobile
npx expo start
```

Downloads ship `mobile/.env` pre-filled with `EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321` and a working anon key, so this works out of the box.

**Using real Supabase instead:** the migrations are plain Postgres SQL. Create a Supabase project (or `supabase start` locally), apply `supabase/migrations` with the Supabase CLI, and point `mobile/.env` at your project's URL and anon key (Project Settings → API).

## `rapidnative.json`

Workspace manifest consumed by the RapidNative editor: entry points, path aliases, per-workspace runners, and the `workspaces.database` entry that tells the editor where migrations live.
