import Link from 'next/link';
import { Clock } from 'lucide-react';
import type { Album, MediaAccess, Workspace } from '@/api';
import { plural, relativeTime, roleInSentence } from '@/lib/workspaces';
import { PeopleStack, PersonAvatar, Pill, WorkspaceTile } from './bits';

/**
 * The picture that stands for a workspace: the album its owner chose, else
 * the newest album that has a cover, else nothing.
 *
 * Drawn from the albums the viewer can open, so a member never sees a cover
 * taken from an album that was not shared with them.
 */
export function workspaceCover(workspace: Workspace, albums: Album[]): string | null {
  const own = albums.filter((a) => a.workspace_id === workspace.id && a.cover_url);
  const chosen = workspace.cover_album_id
    ? own.find((a) => a.id === workspace.cover_album_id)
    : undefined;
  return (chosen ?? own[0])?.cover_url ?? null;
}

/** What a member can do across the albums they were given, if it is one thing. */
function sharedAccess(workspace: Workspace, albums: Album[]): string | null {
  const mine = albums.filter((a) => a.workspace_id === workspace.id && a.my_access && a.my_access !== 'owner');
  if (mine.length === 0) return null;
  const levels = new Set(mine.map((a) => a.my_access as MediaAccess));
  const count = plural(mine.length, 'album');
  if (levels.size > 1) return count;
  const [level] = [...levels];
  const verb = { view: 'view', download: 'download from', upload: 'upload to', manage: 'manage' }[level];
  return `${verb} ${count}`;
}

/**
 * One workspace in the list: whose it is, who else is in it, how much it
 * holds, and when something last happened in it.
 */
export function WorkspaceCard({ workspace, albums }: { workspace: Workspace; albums: Album[] }) {
  const cover = workspaceCover(workspace, albums);
  const access = workspace.is_owner ? null : sharedAccess(workspace, albums);
  const alone = workspace.is_owner && workspace.member_count <= 1 && workspace.pending_count === 0;

  return (
    <Link
      href={`/workspaces/${workspace.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-foreground transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span
        className="relative block h-32 shrink-0"
        style={{ backgroundColor: cover ? undefined : `${workspace.accent_color}1F` }}
      >
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="size-full object-cover" />
        )}
        <WorkspaceTile
          name={workspace.name}
          color={workspace.accent_color}
          className="absolute -bottom-[18px] left-4 ring-4 ring-card"
        />
      </span>

      <span className="flex flex-1 flex-col gap-1.5 px-4 pb-3.5 pt-7">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-base font-semibold">{workspace.name}</span>
          {workspace.archived_at ? (
            <Pill tone="muted">Archived</Pill>
          ) : workspace.is_owner ? (
            <Pill>Yours</Pill>
          ) : (
            <span className="flex min-w-0 shrink items-center gap-1.5 text-xs text-secondary-foreground">
              <PersonAvatar
                name={workspace.owner.name}
                url={workspace.owner.avatar_url}
                className="size-[18px] text-[8px]"
              />
              <span className="truncate">Shared by {workspace.owner.name}</span>
            </span>
          )}
        </span>

        {!workspace.is_owner && (
          <span className="text-xs text-muted-foreground">
            You’re {roleInSentence(workspace.my_role, true)}
            {access ? ` · ${access}` : ''}
          </span>
        )}

        {workspace.description && (
          <span className="line-clamp-1 text-[13px] text-muted-foreground">{workspace.description}</span>
        )}

        <span className="mt-auto flex items-center justify-between gap-3 border-t pt-2.5">
          <span className="truncate text-xs text-secondary-foreground">
            {plural(workspace.album_count, 'album')} · {plural(workspace.media_count, 'file')}
            {alone ? ' · private' : ''}
          </span>
          <span className="flex shrink-0 items-center gap-2.5">
            <PeopleStack
              people={workspace.people}
              size="size-[22px]"
              extra={workspace.pending_count > 0 ? `+${workspace.pending_count} invited` : undefined}
            />
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="size-3" aria-hidden />
              <time dateTime={workspace.last_activity_at}>{relativeTime(workspace.last_activity_at)}</time>
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
