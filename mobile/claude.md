# Virgo — mobile

Expo 54 / React Native 0.81 / Expo Router 6 / TanStack Query 5 / NativeWind 4 /
TypeScript strict / lucide-react-native.

## There is no Supabase here

This app talks to **Virgo's own NestJS API over HTTP**. It has no database
client, no RLS, no `auth.uid()`, and no generated schema types. If you find a
reference to Supabase anywhere, it is a leftover and should go.

Authorisation is the API's job. A screen never scopes its own data — it calls
an endpoint, and the server decides what that account may see.

## Where things live

| Type | Location | Export |
| --- | --- | --- |
| Screens (protected) | `app/(app)/*.tsx` | default |
| Screens (public) | `app/(auth)/*.tsx` | default |
| Components | `components/*.tsx` | named → `components/index.ts` |
| Hooks | `src/hooks/*.ts` | named → `src/hooks/index.ts` |
| API endpoints | `src/api/endpoints/*.ts` | named → `src/api/index.ts` |
| Query keys | `src/api/queryKeys.ts` | `queryKeys` |
| HTTP client | `src/api/client.ts` | `api` |
| Migrations | `../api/migrations/*.sql` | SQL — **in `api/`, not here** |

Import alias is `@/*` → the package root, so hooks are `@/src/hooks`, not
`@/hooks`.

## Shared with web

`src/api/**` and `src/hooks/**` are duplicated byte-for-byte in `web/`.
`node scripts/check-client-sync.mjs` enforces it from the repo root and fails
the moment the two drift.

**Change both, or change neither.** A fix applied to one client only is the
most common defect this project has had.

## Data

- Server state is TanStack Query. There is no other store.
- Query keys come from `queryKeys`, never hand-written arrays.
- Every list hook returns `loadFailed`, not just `isError` — React Query pauses
  rather than errors when the device is offline, so `isError` stays false and a
  failed fetch renders as an empty list. Distinguishing "failed" from "empty" is
  not optional; getting it wrong tells someone their albums are gone.

## Rules

**Do**

- Use React Native primitives with NativeWind `className`
- Use semantic colour classes (`bg-background`, `text-foreground`)
- Register every icon in the file's `cssInterop` array as well as importing it —
  one left out renders without its colour and nobody traces it back
- Use `useCallback` for `FlatList` handlers
- Add new endpoints to `src/api/endpoints/` and re-export from `src/api/index.ts`

**Don't**

- Use `StyleSheet.create()` or hardcode colours
- Write unitless arbitrary classNames — `h-[20]` silently does nothing; use
  `h-[20px]` or `h-5`
- Use `any`
- Show a raw error message to a user
- Auto-redirect signed-in users off auth screens

**Will break the app**

- **Hallucinated icon names.** Only emit icons that exist in
  `lucide-react-native`. `MessageIcon` and `RecordIcon` do not
  (use `MessageCircleIcon` / `DiscIcon`).
- **Hooks at module top level.** `const qc = useQueryClient()` outside a
  component is "Invalid hook call".
- **Native-only packages** that break the web preview on import.
- **Provider/consumer asymmetry.** A method called on a context must be on the
  context type, in the provider `value`, *and* in the no-op fallback.
