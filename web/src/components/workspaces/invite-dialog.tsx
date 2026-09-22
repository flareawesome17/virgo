'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Loader2, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAlbums } from '@/hooks/useAlbums';
import { useCreateCollaborator } from '@/hooks/useCollaborators';
import { useFriends } from '@/hooks/useFriends';
import { useWorkspaceMembers } from '@/hooks/useWorkspaces';
import {
  ROLE_DEFAULT_ACCESS,
  type CollaboratorRole,
  type MediaAccess,
  type Workspace,
} from '@/api';
import {
  ACCESS_LABEL,
  ACCESS_LEVELS,
  INVITE_ROLES,
  ROLE_BLURB,
  ROLE_LABEL,
  firstName,
  plural,
} from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { PersonAvatar } from './bits';

/**
 * Invites a friend onto a workspace, saying exactly what they will get.
 *
 * The role now says what it gives — "Upload by default" — rather than being
 * a label whose effect nobody could see. The albums are chosen here, at the
 * one moment the owner actually knows what this person is for, and so is
 * whether albums made later reach them too; before, every later album
 * silently stayed private to them.
 *
 * Someone who declined can be asked again from here: the server reopens
 * their invitation rather than refusing a second one.
 */
export function InviteDialog({
  workspace,
  open,
  onOpenChange,
  preselect,
}: {
  workspace: Workspace;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A person to start with chosen: "Invite again" on a declined invitation. */
  preselect?: string | null;
}) {
  const create = useCreateCollaborator();
  const { friends, isLoading: loadingFriends } = useFriends(
    { status: 'accepted', limit: 100 },
    { enabled: open },
  );
  const { members } = useWorkspaceMembers(open ? workspace.id : undefined);
  const albumsQuery = useAlbums({ workspace_id: workspace.id, limit: 100 }, { enabled: open });
  const albums = albumsQuery.albums;

  const [search, setSearch] = useState('');
  const [friendId, setFriendId] = useState<string | null>(preselect ?? null);
  const [role, setRole] = useState<CollaboratorRole>('photographer');
  const [mode, setMode] = useState<'all' | 'choose'>('all');
  const [chosen, setChosen] = useState<Record<string, MediaAccess | 'none'>>({});
  const [later, setLater] = useState(true);

  // Starts again on every opening, from whoever it was opened for.
  const [openedFor, setOpenedFor] = useState({ open, preselect });
  if (open !== openedFor.open || preselect !== openedFor.preselect) {
    setOpenedFor({ open, preselect });
    if (open) {
      setSearch('');
      setFriendId(preselect ?? null);
      setRole('photographer');
      setMode('all');
      setChosen({});
      setLater(true);
    }
  }

  /** Where each friend stands with this workspace already. */
  const standing = useMemo(() => {
    const map = new Map<string, 'here' | 'invited' | 'declined'>();
    for (const m of members) {
      if (!m.user_id) continue;
      map.set(
        m.user_id,
        m.status === 'declined' ? 'declined' : m.status === 'pending' ? 'invited' : 'here',
      );
    }
    return map;
  }, [members]);

  const query = search.trim().toLowerCase();
  const people = friends
    .filter((f) => f.friend_user_id)
    .filter(
      (f) =>
        !query ||
        f.friend_name.toLowerCase().includes(query) ||
        (f.friend_email ?? '').toLowerCase().includes(query),
    );
  const friend = friends.find((f) => f.friend_user_id === friendId) ?? null;
  const level = ROLE_DEFAULT_ACCESS[role];
  /** Their first name once chosen; "they" until then. */
  const who = friend ? firstName(friend.friend_name) : 'they';

  const grants =
    mode === 'all'
      ? albums.map((a) => ({ album_id: a.id, media_access: level }))
      : Object.entries(chosen)
          .filter((entry): entry is [string, MediaAccess] => entry[1] !== 'none')
          .map(([album_id, media_access]) => ({ album_id, media_access }));

  // Waits for the album list, or "all albums" would be sent as none of them.
  const ready = !!friend && albumsQuery.isSuccess && !create.isPending;

  const submit = () => {
    if (!friend?.friend_user_id || !ready) return;
    create.mutate(
      {
        workspace_id: workspace.id,
        collaborator_user_id: friend.friend_user_id,
        // Shown on the members list until they have an account name to join.
        name: friend.friend_name,
        avatar_url: friend.friend_avatar_url,
        role,
        albums: grants,
        new_album_access: later ? level : null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          toast.success(`Invitation sent to ${firstName(friend.friend_name)}`, {
            description: 'It waits in their Workspaces, with what you are sharing.',
          });
        },
        onError: (err: Error) => toast.error('Could not send the invitation', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite to {workspace.name}</DialogTitle>
          <DialogDescription>
            Friends only. Nothing is shared until they accept.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="invite-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your friends"
                className="pl-9"
                aria-label="Search your friends"
              />
            </div>
            <div
              role="radiogroup"
              aria-label="Who to invite"
              className="max-h-52 overflow-y-auto rounded-lg border p-1"
            >
              {loadingFriends ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading your friends…</p>
              ) : friends.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  You can invite people you are friends with.{' '}
                  <Link href="/network" className="font-medium text-primary hover:underline">
                    Find people on Network
                  </Link>
                  .
                </p>
              ) : people.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No friends match “{search.trim()}”.
                </p>
              ) : (
                people.map((f) => {
                  const state = standing.get(f.friend_user_id!);
                  const disabled = state === 'here' || state === 'invited';
                  const note =
                    state === 'here'
                      ? 'Already here'
                      : state === 'invited'
                        ? 'Invited already'
                        : state === 'declined'
                          ? 'Declined last time — you can ask again'
                          : f.friend_email;
                  const selected = friendId === f.friend_user_id;
                  return (
                    <label
                      key={f.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2',
                        selected && 'bg-secondary',
                        disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-muted',
                      )}
                    >
                      <input
                        type="radio"
                        name="invite-friend"
                        className="accent-primary"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => setFriendId(f.friend_user_id)}
                      />
                      <PersonAvatar name={f.friend_name} url={f.friend_avatar_url} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{f.friend_name}</span>
                        {note && (
                          <span className="block truncate text-xs text-muted-foreground">{note}</span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Role</legend>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INVITE_ROLES.map((r) => {
                const on = role === r;
                return (
                  <label
                    key={r}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1 rounded-xl border-[1.5px] p-3 transition-colors',
                      on ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <input
                        type="radio"
                        name="invite-role"
                        className="accent-primary"
                        checked={on}
                        onChange={() => setRole(r)}
                      />
                      {ROLE_LABEL[r]}
                    </span>
                    <span className="text-xs leading-4 text-muted-foreground">{ROLE_BLURB[r]}</span>
                    <span className="text-[11px] font-semibold text-secondary-foreground">
                      {ACCESS_LABEL[ROLE_DEFAULT_ACCESS[r]]} by default
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold">Albums</legend>
            {albumsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading this workspace’s albums…</p>
            ) : albums.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This workspace has no albums yet.
              </p>
            ) : (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="invite-albums"
                    className="accent-primary"
                    checked={mode === 'all'}
                    onChange={() => setMode('all')}
                  />
                  {albums.length === 1
                    ? `${albums[0].name}, at ${ACCESS_LABEL[level]}`
                    : `All ${plural(albums.length, 'album')}, at ${ACCESS_LABEL[level]}`}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="invite-albums"
                    className="accent-primary"
                    checked={mode === 'choose'}
                    onChange={() => setMode('choose')}
                  />
                  Choose albums and what {who} can do in each
                </label>
                {mode === 'choose' && (
                  <ul className="max-h-48 overflow-y-auto rounded-lg border">
                    {albums.map((album) => (
                      <li key={album.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-0">
                        <span className="min-w-0 flex-1 truncate text-sm">{album.name}</span>
                        <select
                          aria-label={`What ${who} can do in ${album.name}`}
                          value={chosen[album.id] ?? 'none'}
                          onChange={(e) =>
                            setChosen((prev) => ({
                              ...prev,
                              [album.id]: e.target.value as MediaAccess | 'none',
                            }))
                          }
                          className="rounded-md border bg-background px-2 py-1 text-xs"
                        >
                          <option value="none">Can’t see</option>
                          {ACCESS_LEVELS.map((l) => (
                            <option key={l} value={l}>
                              {ACCESS_LABEL[l]}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            <label className="mt-1 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-primary"
                checked={later}
                onChange={(e) => setLater(e.target.checked)}
              />
              Also share albums I add later, at {ACCESS_LABEL[level]}
            </label>
          </fieldset>
        </div>

        <DialogFooter className="items-center gap-3 border-t pt-4 sm:justify-between">
          <p className="text-xs text-muted-foreground sm:max-w-xs">
            {friend
              ? `${who} gets a notification and an email, and sees exactly what you are sharing before accepting.`
              : 'They get a notification and an email, and see exactly what you are sharing before accepting.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!ready}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send invite
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
