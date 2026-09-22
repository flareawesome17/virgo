'use client';

import { useState } from 'react';
import { Loader2, RefreshCw, Trash2, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ErrorState, ListSkeleton } from '@/components/states';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCollaboratorAlbums,
  useDeleteCollaborator,
  useResendInvitation,
  useSetCollaboratorAlbums,
  useUpdateCollaborator,
} from '@/hooks/useCollaborators';
import { useWorkspaceMembers } from '@/hooks/useWorkspaces';
import type { CollaboratorRole, MediaAccess, Workspace, WorkspaceMember } from '@/api';
import {
  ACCESS_HINT,
  ACCESS_LABEL,
  ACCESS_LEVELS,
  INVITE_ROLES,
  ROLE_LABEL,
  accessSummary,
  firstName,
  invitedWhen,
  plural,
  roleInSentence,
} from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import { PersonAvatar, Pill } from './bits';

/**
 * Who is on a workspace and what each of them can do — for its owner.
 *
 * Everything about one person is in one place now: their role, which albums
 * they have and at what level, what albums added later give them, a waiting
 * invitation to resend or withdraw, a declined one to make again, and taking
 * them off. It was spread across the workspace page, which listed people, and
 * the Network page, which edited their access.
 */
export function MembersPanel({
  workspace,
  onInvite,
}: {
  workspace: Workspace;
  /** Opens the invite dialog, with a person already chosen for "Invite again". */
  onInvite: (preselect?: string | null) => void;
}) {
  const { members, isLoading, loadFailed, refetch } = useWorkspaceMembers(workspace.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<WorkspaceMember | null>(null);
  const updateRole = useUpdateCollaborator();
  const resend = useResendInvitation();
  const remove = useDeleteCollaborator();

  const open = members.find((m) => m.id === selected && m.status === 'accepted') ?? null;

  const changeRole = (member: WorkspaceMember, role: CollaboratorRole) =>
    updateRole.mutate(
      { id: member.id!, role },
      {
        onSuccess: () => toast.success(`${firstName(member.name)} is now ${roleInSentence(role, true)}`),
        onError: (err: Error) => toast.error('Could not change the role', { description: err.message }),
      },
    );

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <section className="min-w-0 flex-1 overflow-hidden rounded-2xl border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold">Members</h2>
            <p className="text-xs text-muted-foreground">Everyone here can see who else is.</p>
          </div>
          <Button size="sm" onClick={() => onInvite()}>
            <UserPlus className="size-4" />
            Invite
          </Button>
        </div>

        {isLoading ? (
          <div className="px-4 pb-4">
            <ListSkeleton rows={2} />
          </div>
        ) : loadFailed && members.length === 0 ? (
          <div className="px-4 pb-4">
            <ErrorState message="Could not load who is here." onRetry={() => refetch()} />
          </div>
        ) : (
          <ul>
            {members.map((member) => (
              <li
                key={member.id ?? `owner-${member.user_id}`}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-2 border-t px-4 py-3 sm:flex-nowrap',
                  member.id && member.id === selected && 'bg-secondary',
                )}
              >
                <PersonAvatar name={member.name} url={member.avatar_url} className="size-9" />
                <div className="min-w-0 flex-1 basis-40 sm:basis-auto">
                  <p className="truncate text-sm font-semibold">
                    {member.name}
                    {member.is_you && <span className="font-normal text-muted-foreground"> (you)</span>}
                  </p>
                  {member.status === 'accepted' && (
                    <p className="truncate text-xs text-muted-foreground">
                      {accessSummary(member, workspace.album_total)}
                    </p>
                  )}
                </div>

                <div className="w-36 shrink-0">
                  {member.status === 'owner' ? (
                    <Pill>Owner</Pill>
                  ) : member.status === 'accepted' ? (
                    <Select
                      value={member.role}
                      onValueChange={(role) => changeRole(member, role as CollaboratorRole)}
                    >
                      <SelectTrigger size="sm" aria-label={`${member.name}’s role`} className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INVITE_ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABEL[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-sm text-secondary-foreground">{ROLE_LABEL[member.role]}</span>
                  )}
                </div>

                <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                  {member.status === 'owner' && (
                    <span className="text-sm text-muted-foreground">Everything</span>
                  )}
                  {member.status === 'accepted' && (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-pressed={member.id === selected}
                      onClick={() => setSelected(member.id === selected ? null : member.id)}
                    >
                      Access
                    </Button>
                  )}
                  {member.status === 'pending' && (
                    <>
                      <Pill tone="warning">Invited {invitedWhen(member.invited_at)}</Pill>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={resend.isPending}
                        onClick={() =>
                          resend.mutate(member.id!, {
                            onSuccess: () => toast.success(`Sent to ${firstName(member.name)} again`),
                            onError: (err: Error) => toast.error('Not sent', { description: err.message }),
                          })
                        }
                      >
                        <RefreshCw className="size-3.5" />
                        Resend
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setCancelling(member)}>
                        Cancel
                      </Button>
                    </>
                  )}
                  {member.status === 'declined' && (
                    <>
                      <Pill tone="muted">Declined</Pill>
                      <Button size="sm" variant="outline" onClick={() => onInvite(member.user_id)}>
                        Invite again
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {open && (
        <AccessEditor
          key={open.id}
          workspace={workspace}
          member={open}
          onClose={() => setSelected(null)}
        />
      )}

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the invitation to {cancelling?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from their Workspaces. You can invite them again whenever you like.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                cancelling &&
                remove.mutate(cancelling.id!, {
                  onSuccess: () => toast.success('Invitation cancelled'),
                  onError: (err: Error) => toast.error('Could not cancel it', { description: err.message }),
                })
              }
            >
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** "Can't see" for no grant, then the levels. */
type Level = MediaAccess | 'none';
const LEVELS: Level[] = ['none', ...ACCESS_LEVELS];
const LEVEL_LABEL: Record<Level, string> = { none: 'None', ...ACCESS_LABEL };

/**
 * One member's access, album by album, and what albums added later give them.
 *
 * Save waits for the albums to load. It did not on the Network page, where a
 * quick Save sent the empty starting selection — and a selection is the whole
 * list, so that removed every album the person had.
 */
function AccessEditor({
  workspace,
  member,
  onClose,
}: {
  workspace: Workspace;
  member: WorkspaceMember;
  onClose: () => void;
}) {
  const { albums, isSuccess, isLoading, loadFailed, refetch } = useCollaboratorAlbums(member.id);
  const save = useSetCollaboratorAlbums();
  const remove = useDeleteCollaborator();
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const name = firstName(member.name);

  // What they have today is where the choices start: derived, so it is right
  // from the render the albums arrive, and only copied once something changes.
  const current: Record<string, Level> = {};
  for (const album of albums) current[album.id] = album.shared ? (album.media_access ?? 'view') : 'none';
  const [picked, setPicked] = useState<Record<string, Level> | null>(null);
  const levels = picked ?? current;

  const currentLater: Level = member.access?.new_albums ?? 'none';
  const [later, setLater] = useState<Level>(currentLater);

  const changed =
    picked !== null && albums.some((a) => (picked[a.id] ?? 'none') !== current[a.id]);
  const dirty = changed || later !== currentLater;

  const submit = () =>
    save.mutate(
      {
        id: member.id!,
        albums: albums
          .filter((a) => levels[a.id] && levels[a.id] !== 'none')
          .map((a) => ({ album_id: a.id, media_access: levels[a.id] as MediaAccess })),
        newAlbumAccess: later === 'none' ? null : later,
      },
      {
        onSuccess: () => {
          toast.success(`Saved what ${name} can do`);
          onClose();
        },
        onError: (err: Error) => toast.error('Could not save', { description: err.message }),
      },
    );

  return (
    <aside
      aria-label={`${member.name}’s access`}
      className="order-first flex w-full shrink-0 flex-col gap-4 rounded-2xl border bg-card p-4 lg:order-none lg:w-[470px]"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={member.name} url={member.avatar_url} className="size-10" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold">{member.name}</p>
          <p className="text-xs text-muted-foreground">
            {ROLE_LABEL[member.role]}
            {member.responded_at &&
              ` · joined ${new Date(member.responded_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`}
          </p>
        </div>
        <Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          What {name} can do in each album
        </p>
        {isLoading ? (
          <div className="py-6 text-center">
            <Loader2 className="mx-auto size-5 animate-spin text-primary" />
          </div>
        ) : loadFailed && !isSuccess ? (
          <ErrorState message="Could not load the albums." onRetry={() => refetch()} />
        ) : albums.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            This workspace has no albums yet. Choose below what {name} gets when you add one.
          </p>
        ) : (
          <ul className="max-h-[45vh] overflow-y-auto">
            {albums.map((album) => {
              const value = levels[album.id] ?? 'none';
              return (
                <li key={album.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t py-2.5 first:border-t-0">
                  <div className="min-w-0 flex-1 basis-28">
                    <p className="truncate text-[13px] font-semibold">{album.name}</p>
                    <p className="text-xs text-muted-foreground">{plural(album.item_count, 'file')}</p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`What ${name} can do in ${album.name}`}
                    className="flex gap-0.5 rounded-[9px] bg-muted p-0.5"
                  >
                    {LEVELS.map((level) => {
                      const on = level === value;
                      return (
                        <button
                          key={level}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          title={level === 'none' ? `${name} can’t see it` : ACCESS_HINT[level]}
                          onClick={() => setPicked({ ...levels, [album.id]: level })}
                          className={cn(
                            'h-7 rounded-[7px] px-2 text-xs transition-colors',
                            on
                              ? 'bg-card font-semibold text-foreground shadow-xs'
                              : 'font-medium text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {LEVEL_LABEL[level]}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl bg-secondary p-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Albums you add later</p>
          <p className="text-xs text-muted-foreground">
            {later === 'none'
              ? `Stay private until you share them with ${name}`
              : `Shared with ${name} straight away`}
          </p>
        </div>
        <Select value={later} onValueChange={(v) => setLater(v as Level)}>
          <SelectTrigger size="sm" className="w-32" aria-label={`What ${name} gets in albums you add later`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Don’t share</SelectItem>
            {ACCESS_LEVELS.map((level) => (
              <SelectItem key={level} value={level}>
                {ACCESS_LABEL[level]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="destructive" onClick={() => setConfirmingRemove(true)}>
          <Trash2 className="size-4" />
          Remove from workspace
        </Button>
        <span className="flex-1" />
        <Button size="sm" onClick={submit} disabled={!isSuccess || !dirty || save.isPending}>
          {save.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </div>

      <AlertDialog open={confirmingRemove} onOpenChange={setConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {member.name} from {workspace.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} loses access to this workspace and all of its albums. Anything {name} uploaded
              stays in your albums. {name} stays in your friends, so you can invite them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep {name}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() =>
                remove.mutate(member.id!, {
                  onSuccess: () => {
                    toast.success(`${name} is no longer in ${workspace.name}`);
                    onClose();
                  },
                  onError: (err: Error) => toast.error('Could not remove', { description: err.message }),
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
