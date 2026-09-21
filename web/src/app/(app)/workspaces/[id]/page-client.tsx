'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Images,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { MEDIA_ACCESS_OPTIONS } from '@/components/workspace-invitations';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useDeleteWorkspace, useWorkspace } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { NewAlbumDialog } from '@/components/new-album-dialog';
import {
  useCollaborators,
  useCreateCollaborator,
  useDeleteCollaborator,
} from '@/hooks/useCollaborators';
import { useFriends } from '@/hooks/useFriends';
import { useUsage } from '@/hooks/useUsage';
import type { CollaboratorRole, MediaAccess } from '@/api';

const ROLES: CollaboratorRole[] = ['photographer', 'editor', 'reviewer', 'client'];

/**
 * Invites a friend onto the workspace.
 *
 * Friends only, and the album picker is part of the invite rather than a
 * follow-up: deciding what someone can see at the moment you add them is the
 * point where you actually know.
 */
function InviteDialog({
  workspaceId,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateCollaborator();
  const { friends } = useFriends({ status: 'accepted', limit: 100 });
  const { albums } = useAlbums({ workspace_id: workspaceId, limit: 100 });
  const { collaborators } = useCollaborators({ workspace_id: workspaceId, limit: 100 });

  const [friendId, setFriendId] = useState('');
  const [role, setRole] = useState<CollaboratorRole>('photographer');
  // Null means "the workspace as it stands", which is what the server does
  // when no selection is sent. A map once they start choosing, because each
  // album carries its own access level.
  const [albumAccess, setAlbumAccess] = useState<Record<string, MediaAccess> | null>(null);

  // Someone already on this workspace cannot be added again.
  const invitable = useMemo(() => {
    const inside = new Set(
      collaborators.map((c) => c.collaborator_user_id).filter(Boolean) as string[],
    );
    return friends.filter((f) => f.friend_user_id && !inside.has(f.friend_user_id));
  }, [friends, collaborators]);

  const submit = () => {
    if (!friendId) return;
    // The row carries a display name so the list renders before the invitee
    // has accepted and their profile is joinable.
    const friend = invitable.find((f) => f.friend_user_id === friendId);
    create.mutate(
      {
        workspace_id: workspaceId,
        collaborator_user_id: friendId,
        name: friend?.friend_name ?? 'Collaborator',
        avatar_url: friend?.friend_avatar_url ?? null,
        role,
        ...(albumAccess
          ? {
              albums: Object.entries(albumAccess).map(([album_id, media_access]) => ({
                album_id,
                media_access,
              })),
            }
          : {}),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setFriendId('');
          setAlbumAccess(null);
          toast.success('Invitation sent', {
            description: 'They will see it in their network and can accept it there.',
          });
        },
        onError: (err: Error) =>
          toast.error('Could not invite', { description: err.message }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a collaborator</DialogTitle>
          <DialogDescription>
            Only people you are friends with. They must accept before they gain
            access.
          </DialogDescription>
        </DialogHeader>

        {invitable.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {friends.length === 0
              ? 'No friends yet. Find people on the Network page first.'
              : 'Everyone you are friends with is already on this workspace.'}
          </p>
        ) : (
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label>Person</Label>
              <Select value={friendId} onValueChange={setFriendId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a friend" />
                </SelectTrigger>
                <SelectContent>
                  {invitable.map((friend) => (
                    <SelectItem key={friend.id} value={friend.friend_user_id!}>
                      {friend.friend_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as CollaboratorRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {albums.length > 0 && (
              <div className="grid gap-2">
                <Label>Albums</Label>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 hover:bg-accent/50">
                  <Checkbox
                    checked={albumAccess === null}
                    onCheckedChange={(checked) => setAlbumAccess(checked ? null : {})}
                  />
                  <span className="text-sm font-medium">
                    Every album in this workspace
                  </span>
                </label>
                {albumAccess !== null && (
                  <div className="max-h-52 overflow-y-auto rounded-lg border p-1">
                    {albums.map((album) => {
                      const level = albumAccess[album.id];
                      return (
                        <div
                          key={album.id}
                          className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-accent/50"
                        >
                          <Checkbox
                            id={`invite-album-${album.id}`}
                            checked={level !== undefined}
                            onCheckedChange={(checked) =>
                              setAlbumAccess((prev) => {
                                const base = { ...(prev ?? {}) };
                                if (checked) base[album.id] = 'view';
                                else delete base[album.id];
                                return base;
                              })
                            }
                          />
                          <label
                            htmlFor={`invite-album-${album.id}`}
                            className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                          >
                            {album.name}
                          </label>
                          {level !== undefined && (
                            <select
                              value={level}
                              onChange={(e) =>
                                setAlbumAccess((prev) => ({
                                  ...(prev ?? {}),
                                  [album.id]: e.target.value as MediaAccess,
                                }))
                              }
                              className="rounded-md border bg-background px-2 py-1 text-xs"
                            >
                              {MEDIA_ACCESS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Albums you create later stay private until you share them.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!friendId || create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data: workspace, isLoading: loadingWorkspace } = useWorkspace(id);
  const {
    albums,
    isLoading: loadingAlbums,
    loadFailed: albumsFailed,
    refetch: refetchAlbums,
  } = useAlbums({ workspace_id: id, limit: 100 });
  const { collaborators } = useCollaborators({ workspace_id: id, limit: 100 });
  const removeWorkspace = useDeleteWorkspace();
  const removeCollaborator = useDeleteCollaborator();
  const { usage } = useUsage();

  const [creatingAlbum, setCreatingAlbum] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const albumLimit = usage?.albums.limit ?? null;
  const atAlbumLimit = albumLimit !== null && albums.length >= albumLimit;

  const startCreateAlbum = () => {
    if (atAlbumLimit) {
      toast.error('Album limit reached', {
        description: `Your ${usage?.plan ?? 'free'} plan includes ${albumLimit} album${albumLimit === 1 ? '' : 's'} per workspace. Delete one or upgrade to add another.`,
        action: { label: 'See plans', onClick: () => router.push('/settings/plans') },
      });
      return;
    }
    setCreatingAlbum(true);
  };

  return (
    <AppShell title={workspace?.name ?? 'Workspace'}>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/workspaces" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            {workspace?.name ?? (loadingWorkspace ? 'Loading…' : 'Workspace')}
          </span>
        }
        description={workspace?.description || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setInviting(true)}>
              <UserPlus className="size-4" />
              Invite
            </Button>
            <Button onClick={startCreateAlbum}>
              <Plus className="size-4" />
              New album
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Workspace actions">
                  <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
                    <circle cx="8" cy="3" r="1.4" />
                    <circle cx="8" cy="8" r="1.4" />
                    <circle cx="8" cy="13" r="1.4" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setInviting(true)}>
                  <UserPlus className="size-4" />
                  Invite a collaborator
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  <Trash2 className="size-4" />
                  Delete workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-6">
        <Tabs defaultValue="albums">
          <TabsList>
            <TabsTrigger value="albums">
              Albums
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {albums.length}
                {albumLimit !== null ? `/${albumLimit}` : ''}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="collaborators">
              Collaborators
              <Badge variant="secondary" className="ml-1.5 tabular-nums">
                {collaborators.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="albums" className="mt-5">
            {loadingAlbums && albums.length === 0 ? (
              <ListSkeleton rows={3} />
            ) : albumsFailed && albums.length === 0 ? (
              <Card>
                <ErrorState message="Could not load these albums." onRetry={() => refetchAlbums()} />
              </Card>
            ) : albums.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Images}
                  title="No albums yet"
                  description="An album holds the media for one shoot or one delivery."
                  action={
                    <Button onClick={startCreateAlbum}>
                      <Plus className="size-4" />
                      Create the first album
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {albums.map((album) => (
                  <Link key={album.id} href={`/albums/${album.id}`}>
                    <Card className="h-full overflow-hidden py-0 transition-colors hover:border-primary/40">
                      <div className="aspect-[4/3] bg-muted">
                        {album.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={album.cover_url}
                            alt=""
                            loading="lazy"
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="grid size-full place-items-center">
                            <Images className="size-7 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <CardContent className="px-4 pb-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate font-semibold">{album.name}</p>
                          <Badge variant="secondary" className="shrink-0 capitalize">
                            {album.status}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {album.item_count ?? 0} item
                          {(album.item_count ?? 0) === 1 ? '' : 's'}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="collaborators" className="mt-5">
            {collaborators.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Users}
                  title="Nobody else here yet"
                  description="Invite a friend to give them access to this workspace and its albums."
                  action={
                    <Button onClick={() => setInviting(true)}>
                      <UserPlus className="size-4" />
                      Invite a collaborator
                    </Button>
                  }
                />
              </Card>
            ) : (
              <Card>
                <CardContent className="p-0">
                  <ul>
                    {collaborators.map((collaborator) => (
                      <li
                        key={collaborator.id}
                        className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                      >
                        <Avatar className="size-10 shrink-0">
                          {collaborator.avatar_url && (
                            <AvatarImage src={collaborator.avatar_url} alt="" />
                          )}
                          <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
                            {collaborator.name.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{collaborator.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] capitalize">
                              {collaborator.role}
                            </Badge>
                            {collaborator.status === 'pending' && (
                              <Badge variant="outline" className="text-[10px]">
                                Pending
                              </Badge>
                            )}
                            {collaborator.status === 'declined' && (
                              <Badge variant="outline" className="text-[10px] text-destructive">
                                Declined
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <Link href="/network">Access</Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            removeCollaborator.mutate(collaborator.id, {
                              onError: (err: Error) =>
                                toast.error('Could not remove', { description: err.message }),
                            })
                          }
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <NewAlbumDialog
        workspaceId={id}
        open={creatingAlbum}
        onOpenChange={setCreatingAlbum}
      />
      <InviteDialog workspaceId={id} open={inviting} onOpenChange={setInviting} />

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {workspace?.name} and its {albums.length} album
              {albums.length === 1 ? '' : 's'} will be removed, along with the
              media in them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeWorkspace.mutate(id, {
                  onSuccess: () => router.replace('/workspaces'),
                  onError: (err: Error) =>
                    toast.error('Could not delete', { description: err.message }),
                })
              }
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
