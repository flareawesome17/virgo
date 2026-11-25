import Link from 'next/link';
import { Folder } from 'lucide-react';
import { formatBytes, type Album, type MediaAccess, type Workspace } from '@/api';
import { Pill } from '@/components/kit';
import { plural, relativeTime, roleInSentence } from '@/lib/workspaces';
import { Faces } from './faces';

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

/**
 * A workspace's own colour, pale enough to sit behind a picture or a folder.
 * The colour is its owner's choice, so it is data and set inline.
 */
export function workspaceTint(workspace: Workspace): string {
  return `color-mix(in srgb, ${workspace.accent_color || 'var(--primary)'} 15%, transparent)`;
}

/**
 * “4 albums · 312 files · 3.1 GB”: what a workspace holds, in the phone's
 * words. Its size only for the owner: the API keeps a member's share of
 * somebody else's storage to itself.
 */
export function workspaceHolds(workspace: Workspace): string {
  return [
    workspace.album_count > 0 ? plural(workspace.album_count, 'album') : 'No albums yet',
    workspace.media_count > 0 ? plural(workspace.media_count, 'file') : null,
    workspace.storage_bytes ? formatBytes(workspace.storage_bytes) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * “Yours · 3 members”, “Yours · only you”, and who has not answered yet. The
 * invitations used to be a “+1 invited” after the faces; here they end the
 * sentence the faces start.
 */
export function yoursLine(workspace: Workspace): string {
  return [
    'Yours',
    workspace.member_count <= 1 ? 'only you' : plural(workspace.member_count, 'member'),
    workspace.pending_count > 0 ? `${workspace.pending_count.toLocaleString()} invited` : null,
  ]
    .filter(Boolean)
    .join(' · ');
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
 * One workspace in the list, led by a photograph from it: its name and when
 * something last happened there, how much it holds, what it is for, then who
 * is in it and whose it is.
 *
 * With no photograph yet it is a folder in the workspace's own colour. It was
 * a letter on a coloured square over a banner: in an app for photographs, the
 * one thing a list of work did not show was the work.
 */
export function WorkspaceCard({ workspace, albums }: { workspace: Workspace; albums: Album[] }) {
  const cover = workspaceCover(workspace, albums);
  const access = workspace.is_owner ? null : sharedAccess(workspace, albums);
  const whose = workspace.is_owner
    ? yoursLine(workspace)
    : [workspace.owner.name, `you’re ${roleInSentence(workspace.my_role, true)}`, access]
        .filter(Boolean)
        .join(' · ');

  return (
    <Link
      href={`/workspaces/${workspace.id}`}
      className="group flex min-w-0 flex-col gap-2.5 rounded-[14px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <span
        className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[14px]"
        style={{ backgroundColor: workspaceTint(workspace) }}
      >
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed storage URL, not an asset to optimise
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform group-hover:scale-[1.02]"
          />
        ) : (
          <Folder
            aria-hidden
            className="size-10 transition-transform group-hover:scale-105"
            strokeWidth={1.6}
            style={{ color: workspace.accent_color || 'var(--primary)' }}
          />
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-[15px] font-semibold leading-5">{workspace.name}</span>
            {workspace.archived_at && <Pill>Archived</Pill>}
          </span>
          <time dateTime={workspace.last_activity_at} className="shrink-0 text-[13px] text-muted-foreground">
            {relativeTime(workspace.last_activity_at)}
          </time>
        </span>
        <span className="truncate text-[13px] leading-[18px] text-secondary-foreground">
          {workspaceHolds(workspace)}
        </span>
        {workspace.description && (
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {workspace.description}
          </span>
        )}
        <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
          <Faces people={workspace.people} />
          <span className="truncate">{whose}</span>
        </span>
      </span>
    </Link>
  );
}
