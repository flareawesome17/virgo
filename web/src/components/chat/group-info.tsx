'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  Camera,
  ChevronRight,
  ImageUp,
  Loader2,
  MessageCircle,
  Pencil,
  Pin,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserMinus,
  UserPlus,
  UserRound,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import {
  useAddConversationMember,
  useMuteConversation,
  useOpenDirectChat,
} from '@/hooks/useChat';
import { usePins, useRemoveMember, useSetAdmin, useUpdateGroup } from '@/hooks/useChatCrew';
import { PersonSafetyItems, type PersonSafety } from '@/components/people/person-safety';
import { GroupAvatar } from '@/components/chat/group-avatar';
import { chatProblem, groupProblem } from '@/components/chat/chat-errors';
import { requestChatJump } from '@/components/chat/chat-jump';
import { AVATAR_MAX_EDGE, resizeImage } from '@/lib/image';
import { firstName } from '@/lib/workspaces';
import {
  GROUP_ABOUT_MAX,
  groupSubtitle,
  storageApi,
  titleFromRoles,
  type Conversation,
  type GroupAddPolicy,
  type Participant,
} from '@/api';

/** Minutes, as group info's Mute offers them. The same list the list's ⋯ uses. */
type MuteOption = { label: string; minutes: number };

/** "Videographer", from what they do; their own words after the list's. */
function roleLine(person: Participant): string {
  return titleFromRoles([...(person.roles ?? []), ...(person.custom_roles ?? [])]);
}

/** "Nov 12". */
function sinceLabel(iso: string | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const thisYear = at.getFullYear() === new Date().getFullYear();
  return at.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

function PersonAvatar({ person, className }: { person: Participant; className?: string }) {
  return (
    <Avatar className={cn('size-9', className)}>
      {person.avatar_url && <AvatarImage src={person.avatar_url} alt="" />}
      <AvatarFallback className="bg-primary/15 text-xs font-bold text-primary">
        {person.name.slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

/** A small uppercase heading, as the rest of the sheet has. */
function Heading({ children }: { children: string }) {
  return (
    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Group info (board 138), in the side sheet: the photo, name and what the
 * group is; About; Search, Mute and Pinned; the people, admins first, each
 * with their own menu (board 139); and who can add people.
 *
 * Admins change the photo, name, About and who can add people, and make or
 * remove admins and members. Everyone else sees the same page without the
 * controls. A team chat takes its workspace's name, so it has no rename.
 */
export function GroupInfoBody({
  conversationId,
  conversation,
  participants,
  meId,
  addable,
  muteOptions,
  mutedLabel,
  safety,
  closeThen,
  onNavigate,
}: {
  conversationId: string;
  conversation: Conversation | null;
  participants: Participant[];
  meId: string | undefined;
  /** Connections not in the group yet. */
  addable: { id: string; friend_user_id: string | null; friend_name: string }[];
  muteOptions: MuteOption[];
  /** "Muted until 3:00 PM", while it is. */
  mutedLabel: string;
  safety: PersonSafety;
  /** Closes the sheet, then does this once it has gone, so focus lands in the chat. */
  closeThen: (run: () => void) => void;
  /** Closes the sheet for a link that leaves the chat. */
  onNavigate: () => void;
}) {
  const router = useRouter();
  const update = useUpdateGroup(conversationId);
  const removeMember = useRemoveMember(conversationId);
  const setAdmin = useSetAdmin(conversationId);
  const addMember = useAddConversationMember(conversationId);
  const mute = useMuteConversation(conversationId);
  const openDirect = useOpenDirectChat();
  const { pins } = usePins(conversationId);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingAbout, setEditingAbout] = useState(false);
  const [aboutDraft, setAboutDraft] = useState('');
  const [removing, setRemoving] = useState<Participant | null>(null);
  /** Who the confirm names; kept while it fades out, so the words don't change under it. */
  const [removingFirst, setRemovingFirst] = useState('');
  if (removing && firstName(removing.name) !== removingFirst) setRemovingFirst(firstName(removing.name));

  const title = conversation?.title?.trim() || `${participants.length} people`;
  const isAdmin = !!conversation?.isAdmin;
  const team = conversation?.origin === 'workspace';
  const photo = conversation?.avatarUrl ?? null;
  const about = conversation?.about?.trim() || '';
  // Absent reads as everyone, as an older API's groups were.
  const addPolicy: GroupAddPolicy = conversation?.addPolicy ?? 'everyone';
  const canAdd = addPolicy === 'everyone' || isAdmin;
  const muted = !!conversation?.muted;
  const subtitle =
    (conversation && groupSubtitle(conversation)) ||
    `${participants.length} ${participants.length === 1 ? 'person' : 'people'}`;

  const fail = (label: string) => (err: unknown) =>
    toast.error(label, { description: groupProblem(err) });

  /**
   * A group photo goes up like a profile picture: scaled here, into your
   * own avatars, and its public address given to the group. The server only
   * takes a photo from your avatars, and deletes the one it replaces.
   */
  const changePhoto = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image', { description: 'Pick a JPEG, PNG or WebP.' });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That image is too large', { description: 'Group photos are limited to 8 MB.' });
      return;
    }
    setUploading(true);
    try {
      const scaled = await resizeImage(file, AVATAR_MAX_EDGE);
      const uploaded = await storageApi.uploadFile(scaled, { scope: 'avatars' });
      if (!uploaded.publicUrl) {
        toast.error('Uploaded, but it cannot be served', {
          description: 'No public URL is configured for the avatars bucket.',
        });
        return;
      }
      await update.mutateAsync({ photoUrl: uploaded.publicUrl });
      toast.success('Group photo updated');
    } catch (err) {
      fail('Could not change the photo')(err);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () =>
    update.mutate(
      { photoUrl: null },
      {
        onSuccess: () => toast.success('Group photo removed'),
        onError: fail('Could not remove the photo'),
      },
    );

  const saveTitle = () => {
    const next = titleDraft.trim();
    if (!next) return;
    update.mutate(
      { title: next },
      { onSuccess: () => setRenaming(false), onError: fail('Could not rename') },
    );
  };

  const saveAbout = () => {
    const next = aboutDraft.trim();
    update.mutate(
      { about: next || null },
      { onSuccess: () => setEditingAbout(false), onError: fail('Could not save About') },
    );
  };

  const setPolicy = (value: string) => {
    if (value !== 'everyone' && value !== 'admins') return;
    if (value === addPolicy) return;
    update.mutate({ addPolicy: value }, { onError: fail('Could not change who can add people') });
  };

  const messagePerson = (person: Participant) =>
    openDirect.mutate(person.id, {
      onSuccess: ({ id }) => {
        onNavigate();
        router.push(`/chat/${id}`);
      },
      onError: (err) =>
        toast.error(`Could not message ${firstName(person.name)}`, { description: chatProblem(err) }),
    });

  const toggleAdmin = (person: Participant) =>
    setAdmin.mutate(
      { userId: person.id, admin: !person.is_admin },
      {
        onError: fail(person.is_admin ? 'Could not remove them as admin' : 'Could not make them an admin'),
      },
    );

  const confirmRemove = () => {
    const person = removing;
    if (!person) return;
    removeMember.mutate(person.id, {
      onSuccess: () => setRemoving(null),
      onError: (err) => {
        setRemoving(null);
        fail(`Could not remove ${firstName(person.name)}`)(err);
      },
    });
  };

  const tile =
    'flex h-16 flex-col items-center justify-center gap-1 rounded-xl border bg-card px-2 text-xs font-semibold transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60';

  return (
    <>
      {/* Photo, name, and what the group is. */}
      <div className="flex flex-col items-center py-4 text-center">
        <div className="relative">
          <GroupAvatar
            title={title}
            photoUrl={photo}
            team={team}
            className="size-20"
            initialClassName="text-3xl"
          />
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Change the group photo"
                  title="Change the group photo"
                  disabled={uploading || update.isPending}
                  className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full border bg-background shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {uploading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Camera className="size-4" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-48">
                <DropdownMenuItem onSelect={() => fileRef.current?.click()}>
                  <ImageUp />
                  {photo ? 'Choose another photo' : 'Choose a photo'}
                </DropdownMenuItem>
                {photo && (
                  <DropdownMenuItem variant="destructive" onSelect={removePhoto}>
                    <Trash2 />
                    Remove photo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label="Group photo"
            disabled={!isAdmin || uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              // Cleared so picking the same file again still counts.
              e.target.value = '';
              if (file) void changePhoto(file);
            }}
          />
        </div>

        {renaming ? (
          <div className="mt-4 w-full">
            <Input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setRenaming(false);
                }
              }}
              placeholder="Group name"
              aria-label="Group name"
              autoFocus
              className="text-center"
            />
            <div className="mt-3 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRenaming(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={!titleDraft.trim() || update.isPending} onClick={saveTitle}>
                {update.isPending && <Loader2 className="size-4 animate-spin" />}
                Save
              </Button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="mt-3 flex items-center gap-1 text-lg font-bold">
              <span className="min-w-0 wrap-anywhere">{title}</span>
              {isAdmin && !team && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 shrink-0 text-muted-foreground"
                  aria-label="Rename group"
                  title="Rename group"
                  onClick={() => {
                    setTitleDraft(conversation?.title ?? '');
                    setRenaming(true);
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
            {team && isAdmin && (
              <p className="mt-1 text-xs text-muted-foreground">
                Named after its workspace. Rename the workspace to rename it.
              </p>
            )}
          </>
        )}
      </div>

      {/* About: one line everyone sees at the top of info. */}
      {editingAbout ? (
        <div className="rounded-xl border bg-card p-3">
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">About</p>
          <Textarea
            value={aboutDraft}
            onChange={(e) => setAboutDraft(e.target.value.slice(0, GROUP_ABOUT_MAX))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditingAbout(false);
              }
            }}
            maxLength={GROUP_ABOUT_MAX}
            rows={3}
            autoFocus
            aria-label="About this group"
            placeholder="The date, the venue, where call sheets go"
            className="resize-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="flex-1 text-xs tabular-nums text-muted-foreground">
              {aboutDraft.length} / {GROUP_ABOUT_MAX}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setEditingAbout(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={update.isPending} onClick={saveAbout}>
              {update.isPending && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      ) : (
        (about || isAdmin) && (
          <div className="relative rounded-xl border bg-card px-3 py-2.5 pr-10">
            <p className="text-xs font-semibold text-muted-foreground">About</p>
            <p
              className={cn(
                'mt-0.5 whitespace-pre-wrap text-sm wrap-anywhere',
                !about && 'text-muted-foreground',
              )}
            >
              {about || 'Add a line everyone here sees: the date, the venue, where call sheets go.'}
            </p>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1.5 top-1.5 size-8 text-muted-foreground"
                aria-label="Edit About"
                title="Edit About"
                onClick={() => {
                  setAboutDraft(about);
                  setEditingAbout(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            )}
          </div>
        )
      )}

      {/* Search, Mute, Pinned. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          className={tile}
          onClick={() =>
            closeThen(() =>
              requestChatJump({ conversationId, kind: 'search', q: '', matchId: null }),
            )
          }
        >
          <Search className="size-4" />
          Search
        </button>
        {muted ? (
          <button
            type="button"
            className={tile}
            disabled={mute.isPending}
            title={mutedLabel}
            onClick={() => mute.mutate(0, { onError: fail('Could not unmute') })}
          >
            <BellOff className="size-4" />
            <span>Unmute</span>
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className={tile} disabled={mute.isPending}>
                <Bell className="size-4" />
                Mute
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56">
              {muteOptions.map((option) => (
                <DropdownMenuItem
                  key={option.minutes}
                  onSelect={() => mute.mutate(option.minutes, { onError: fail('Could not mute') })}
                >
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <button
          type="button"
          className={tile}
          onClick={() => closeThen(() => requestChatJump({ conversationId, kind: 'pins' }))}
        >
          <Pin className="size-4" />
          {pins.length > 0 ? `Pinned ${pins.length}` : 'Pinned'}
        </button>
      </div>
      {muted && mutedLabel && (
        <p className="mt-1.5 text-center text-xs text-muted-foreground">{mutedLabel}</p>
      )}

      {/* The people, admins first. */}
      <p className="mb-2 mt-5 text-base font-bold">
        {participants.length} {participants.length === 1 ? 'person' : 'people'}
      </p>
      <ul className="overflow-hidden rounded-xl border bg-card">
        {canAdd && (
          <li>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <span className="grid size-9 place-items-center rounded-full bg-primary/15 text-primary">
                    {addMember.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                  </span>
                  <span className="text-sm font-semibold text-primary">Add people</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-72 w-60 overflow-y-auto">
                {addable.length === 0 ? (
                  <DropdownMenuItem disabled>Everyone you&apos;re connected with is here</DropdownMenuItem>
                ) : (
                  addable.map((friend) => (
                    <DropdownMenuItem
                      key={friend.id}
                      onSelect={() =>
                        addMember.mutate(friend.friend_user_id!, { onError: fail('Could not add') })
                      }
                    >
                      <Avatar className="size-5">
                        <AvatarFallback className="bg-primary/15 text-[9px] font-bold text-primary">
                          {friend.friend_name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      {friend.friend_name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        )}
        {participants.map((person, i) => {
          const me = person.id === meId;
          const role = roleLine(person);
          const since = sinceLabel(person.joined_at);
          const first = firstName(person.name);
          const row = (
            <>
              <PersonAvatar person={person} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{me ? 'You' : person.name}</span>
                {!me && role && (
                  <span className="truncate text-xs text-muted-foreground">{role}</span>
                )}
              </span>
              {person.blocked_by_me && (
                <Badge variant="outline" className="text-[10px]">
                  Blocked
                </Badge>
              )}
              {person.is_admin && (
                <Badge variant="secondary" className="text-[11px]">
                  Admin
                </Badge>
              )}
            </>
          );
          return (
            <li key={person.id} className={cn((canAdd || i > 0) && 'border-t')}>
              {me ? (
                <div className="flex items-center gap-3 px-3 py-2.5">{row}</div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`${person.name}${person.is_admin ? ', admin' : ''}. More`}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-expanded:bg-accent/60"
                    >
                      {row}
                    </button>
                  </DropdownMenuTrigger>
                  {/* A member's menu (board 139). */}
                  <DropdownMenuContent align="end" className="w-72">
                    <div className="flex items-center gap-3 px-2 py-2">
                      <PersonAvatar person={person} className="size-10" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{person.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[role, since && `in this group since ${since}`].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => messagePerson(person)}>
                      <MessageCircle />
                      Message {first}
                    </DropdownMenuItem>
                    {person.handle && (
                      <DropdownMenuItem asChild>
                        <Link href={`/u/${person.handle}`} onClick={onNavigate}>
                          <UserRound />
                          View profile
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {isAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => toggleAdmin(person)} className="items-start">
                          {person.is_admin ? <ShieldOff className="mt-0.5" /> : <ShieldCheck className="mt-0.5" />}
                          <span className="flex flex-col">
                            <span>{person.is_admin ? 'Remove as admin' : 'Make admin'}</span>
                            <span className="text-xs text-muted-foreground">
                              {person.is_admin
                                ? `${first} stays in the group, without admin controls`
                                : 'Can add and remove people, and change the photo'}
                            </span>
                          </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setRemoving(person)}
                          className="items-start"
                        >
                          <UserMinus className="mt-0.5" />
                          <span className="flex flex-col">
                            <span>Remove from group</span>
                            <span className="text-xs text-muted-foreground">
                              {first} won&apos;t see new messages. The chat says {first} was removed.
                            </span>
                          </span>
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuSeparator />
                    <PersonSafetyItems
                      safety={safety}
                      subject={{
                        name: person.name,
                        target: { userId: person.id },
                        blockId: person.block_id ?? null,
                      }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          );
        })}
      </ul>

      {/* Who can add people: admins choose. */}
      {isAdmin && (
        <div className="mt-4">
          <Heading>Settings</Heading>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={update.isPending}
                className="flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <UserPlus className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm font-medium">Who can add people</span>
                <span className="text-sm text-muted-foreground">
                  {addPolicy === 'admins' ? 'Admins' : 'Everyone'}
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuRadioGroup value={addPolicy} onValueChange={setPolicy}>
                <DropdownMenuRadioItem value="everyone" className="items-start">
                  <span className="flex flex-col">
                    <span>Everyone</span>
                    <span className="text-xs text-muted-foreground">
                      Anyone here can add people they&apos;re connected with
                    </span>
                  </span>
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="admins" className="items-start">
                  <span className="flex flex-col">
                    <span>Admins</span>
                    <span className="text-xs text-muted-foreground">Only admins add people</span>
                  </span>
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog open={removing !== null} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removingFirst} from {title}?</AlertDialogTitle>
            <AlertDialogDescription>
              {removingFirst} won&apos;t see new messages. The chat says {removingFirst} was
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removeMember.isPending}
              onClick={(event) => {
                // Stays open until it has worked, so a refusal is seen.
                event.preventDefault();
                confirmRemove();
              }}
            >
              {removeMember.isPending && <Loader2 className="size-4 animate-spin" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
