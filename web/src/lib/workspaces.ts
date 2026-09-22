import type {
  CollaboratorInvitation,
  CollaboratorRole,
  MediaAccess,
  Workspace,
  WorkspaceActivityItem,
  WorkspaceMember,
} from '@/api';

/**
 * Words for workspaces, members and access, in one place, so the list, the
 * overview, the members panel and the invite dialog never describe the same
 * thing two ways.
 */

/** The colours a workspace can take. The phone app offers the same eight. */
export const ACCENT_COLORS: { name: string; hex: string }[] = [
  { name: 'Copper', hex: '#B66A40' },
  { name: 'Bronze', hex: '#C17745' },
  { name: 'Espresso', hex: '#8B5E3C' },
  { name: 'Terracotta', hex: '#C76B4A' },
  { name: 'Sage', hex: '#7A8B6E' },
  { name: 'Slate blue', hex: '#5B7B9A' },
  { name: 'Plum', hex: '#8B5B7A' },
  { name: 'Charcoal', hex: '#54433C' },
];

export const ROLE_LABEL: Record<CollaboratorRole, string> = {
  owner: 'Owner',
  photographer: 'Photographer',
  editor: 'Editor',
  reviewer: 'Reviewer',
  client: 'Client',
};

/** The roles someone can be invited as, in the order they are offered. */
export const INVITE_ROLES: CollaboratorRole[] = ['photographer', 'editor', 'reviewer', 'client'];

/** What each role is for, in the words the invite dialog uses. */
export const ROLE_BLURB: Record<CollaboratorRole, string> = {
  owner: 'Everything',
  photographer: 'Uploads to the albums you share',
  editor: 'Arranges, uploads and deletes',
  reviewer: 'Views and downloads',
  client: 'Views what you share',
};

/** Access levels, least to most. */
export const ACCESS_LEVELS: MediaAccess[] = ['view', 'download', 'upload', 'manage'];

export const ACCESS_LABEL: Record<MediaAccess, string> = {
  view: 'View',
  download: 'Download',
  upload: 'Upload',
  manage: 'Manage',
};

/** What each level lets someone do, for a tooltip or a hint. */
export const ACCESS_HINT: Record<MediaAccess, string> = {
  view: 'Can look through the album',
  download: 'Can also download the originals',
  upload: 'Can also add files',
  manage: 'Can also delete files and arrange sections',
};

/** "a photographer", "an editor" — or "a Photographer" where a role is a title. */
export function roleInSentence(
  role: CollaboratorRole | null | undefined,
  capitalised = false,
): string {
  const name = role ?? 'editor';
  return `${/^[aeiou]/.test(name) ? 'an' : 'a'} ${capitalised ? ROLE_LABEL[name] : name}`;
}

/** What a level lets you do, as the rest of a sentence: "you could upload to …". */
const ACCESS_VERB: Record<MediaAccess, string> = {
  view: 'view',
  download: 'download from',
  upload: 'upload to',
  manage: 'manage',
};

/** The first name, for lines that would otherwise read like a form letter. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "You", "You and Carlo", "You, Carlo and Andrea". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

/**
 * A time as a feed says it: "just now", "5m ago", "2h ago", "Yesterday",
 * "Mon", then "12 Sep" — and the year once it is not this one.
 */
export function relativeTime(iso: string, now = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (then >= startOfToday) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.ceil((startOfToday.getTime() - then.getTime()) / 86_400_000);
  if (days <= 1) return 'Yesterday';
  if (days < 7) return then.toLocaleDateString(undefined, { weekday: 'short' });
  return then.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    ...(then.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/** "Mon", "Yesterday", "today" — when an invitation went out. */
export function invitedWhen(iso: string, now = new Date()): string {
  const said = relativeTime(iso, now);
  return /ago$|just now/.test(said) ? 'today' : said;
}

/**
 * What a member was given, in one line for the members list:
 * "Upload · 4 of 5 albums", "Manage · all 5 albums", "View · Delivery".
 */
export function accessSummary(member: WorkspaceMember, albumTotal: number): string {
  const access = member.access;
  if (!access || access.albums === 0 || !access.top) return 'No albums yet';
  const level = access.uniform ? ACCESS_LABEL[access.top] : `Up to ${ACCESS_LABEL[access.top]}`;
  if (access.albums === 1 && access.only_album) return `${level} · ${access.only_album}`;
  if (access.albums >= albumTotal) return `${level} · all ${plural(albumTotal, 'album')}`;
  return `${level} · ${access.albums} of ${plural(albumTotal, 'album')}`;
}

/**
 * What a member was given, as the rest of a sentence after their role:
 * "upload to 4 of 5 albums", "manage all 5 albums", "view Delivery".
 */
export function accessPhrase(member: WorkspaceMember, albumTotal: number): string {
  const access = member.access;
  if (!access || access.albums === 0 || !access.top) return 'no albums yet';
  const which =
    access.albums === 1 && access.only_album
      ? access.only_album
      : access.albums >= albumTotal
        ? `all ${plural(albumTotal, 'album')}`
        : `${access.albums} of ${plural(albumTotal, 'album')}`;
  if (!access.uniform) return `${which}, up to ${access.top}`;
  return `${ACCESS_VERB[access.top]} ${which}`;
}

/**
 * What accepting an invitation would give you:
 * "As a Photographer · you could upload to 3 albums: Studio sessions,
 * Headshots, Family day".
 */
export function invitationOffer(invitation: CollaboratorInvitation): string {
  const role = `As ${roleInSentence(invitation.role, true)}`;
  const albums = invitation.albums ?? [];
  if (albums.length === 0) return `${role} · no albums shared yet`;
  const levels = new Set(albums.map((a) => a.media_access));
  const names = albums.map((a) => a.name);
  const listed =
    names.length <= 3 ? names.join(', ') : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  const count = plural(albums.length, 'album');
  if (levels.size === 1) {
    const [only] = [...levels];
    return `${role} · you could ${ACCESS_VERB[only]} ${albums.length === 1 ? names[0] : `${count}: ${listed}`}`;
  }
  return `${role} · ${count}: ${listed}`;
}

/**
 * What deleting a workspace takes, and what it leaves: the albums and
 * everyone's access go; the files stay in the owner's library, unsorted, and
 * still count. It used to say the media went too, which was never true — and
 * someone could keep a workspace they wanted gone for fear of losing work that
 * was never at risk.
 */
export function deleteConsequence(
  workspace: Pick<Workspace, 'album_total' | 'media_count' | 'collaborator_count' | 'pending_count'>,
): string {
  const albums = workspace.album_total;
  const files = workspace.media_count;
  const what = albums === 0 ? 'Deletes it' : `Deletes its ${plural(albums, 'album')}`;
  const access =
    workspace.collaborator_count + workspace.pending_count > 0 ? ' and everyone’s access to them' : '';
  const kept =
    files === 0
      ? ''
      : ` The ${plural(files, 'file')} stay in your library, unsorted, and still count toward your storage.`;
  return `${what}${access}.${kept}`;
}

/** A piece of an activity line: plain words, or a name set in bold. */
export type LinePart = { text: string; strong?: boolean };

/**
 * One line of the feed, and the grey line under it.
 *
 * `waiting` holds the people whose invitation is still unanswered, so an old
 * "You invited Paolo" can say whether Paolo has answered since.
 */
export function describeActivity(
  item: WorkspaceActivityItem,
  waiting: ReadonlySet<string> = new Set(),
): { parts: LinePart[]; subline: string } {
  const actor = item.actor;
  const who: LinePart = actor?.is_you
    ? { text: 'You', strong: true }
    : { text: actor?.name ?? 'Someone', strong: true };
  const subject = item.subject;
  const subjectName = subject ? (subject.is_you ? 'you' : subject.name) : 'someone';
  const album: LinePart = { text: item.album?.name ?? 'an album', strong: true };
  const role = actor?.role ? ROLE_LABEL[actor.role] : '';
  const files = item.count === 1 ? 'a file' : plural(item.count, 'file');

  switch (item.kind) {
    case 'upload':
      return { parts: [who, { text: ` uploaded ${files} to ` }, album], subline: role };
    case 'sections':
      return {
        parts: [who, { text: ` added ${item.count === 1 ? 'a section' : plural(item.count, 'section')} to ` }, album],
        subline: role,
      };
    case 'picks':
      return {
        parts: [{ text: 'Your client', strong: true }, { text: ` sent picks: ${files} from ` }, album],
        subline: 'Client picks',
      };
    case 'album-created':
      return { parts: [who, { text: ' made ' }, album], subline: role };
    case 'album-moved':
      return { parts: [who, { text: ' moved ' }, album, { text: ' here' }], subline: role };
    case 'invited': {
      const invitedRole = subject?.role ?? item.data.role;
      const stillWaiting = subject?.id ? waiting.has(subject.id) : false;
      return {
        parts: [
          who,
          { text: ' invited ' },
          { text: subjectName, strong: true },
          { text: invitedRole ? ` as ${roleInSentence(invitedRole)}` : '' },
        ],
        subline: stillWaiting ? `Waiting for ${firstName(subjectName)} to accept` : 'Invitation',
      };
    }
    case 'joined':
      return { parts: [who, { text: ' joined' }], subline: role };
    case 'declined':
      return { parts: [who, { text: ' declined your invitation' }], subline: 'Invitation' };
    case 'left':
      return { parts: [who, { text: ' left' }], subline: 'Member' };
    case 'removed':
      return { parts: [who, { text: ' removed ' }, { text: subjectName, strong: true }], subline: 'Member' };
    case 'shared': {
      const person = firstName(subjectName);
      const added = item.data.added ?? [];
      const addedCount = item.data.added_count ?? added.length;
      if (addedCount > 0) {
        const what: LinePart[] =
          addedCount <= added.length && addedCount <= 3
            ? joinNames(added)
                .split(/(, | and )/)
                .map((text) => ({ text, strong: text !== ', ' && text !== ' and ' }))
            : [{ text: plural(addedCount, 'album'), strong: true }];
        const can = item.data.access ? ` — ${person} can ${item.data.access}` : '';
        return {
          parts: [who, { text: ' shared ' }, ...what, { text: ' with ' }, { text: subjectName, strong: true }, { text: can }],
          subline: 'Sharing',
        };
      }
      const removed = item.data.removed_count ?? 0;
      const changed = item.data.changed_count ?? 0;
      if (removed > 0 && changed === 0) {
        return {
          parts: [who, { text: ` took ${plural(removed, 'album')} away from ` }, { text: subjectName, strong: true }],
          subline: 'Sharing',
        };
      }
      return {
        parts: [who, { text: ' changed what ' }, { text: subjectName, strong: true }, { text: ` can do in ${plural(changed + removed, 'album')}` }],
        subline: 'Sharing',
      };
    }
    default:
      return { parts: [who, { text: ' did something here' }], subline: '' };
  }
}
