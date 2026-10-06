'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CreditCard,
  FileQuestion,
  FolderInput,
  Images,
  Loader2,
  Music,
  Trash2,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useUsage } from '@/hooks/useUsage';
import {
  unassignedFilesKey,
  useAttachToAlbum,
  useStorageBreakdown,
  useUnassignedFiles,
} from '@/hooks/useStorageAdmin';
import { useDeleteFiles } from '@/hooks/useMediaSelection';
import { useWipeStorage } from '@/hooks/useStorageAdmin';
import { useAlbums } from '@/hooks/useAlbums';
import { fileNameFromKey } from '@/hooks/useAlbumFiles';
import { formatBytes } from '@/api';

/** Typed into the box before a wipe is allowed to run. */
const CONFIRM_WORD = 'DELETE';

const TYPE_META: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
    color: string;
  }
> = {
  image: { label: 'Photos', icon: Images, color: 'var(--chart-1)' },
  video: { label: 'Videos', icon: Video, color: 'var(--chart-2)' },
  audio: { label: 'Audio', icon: Music, color: 'var(--chart-3)' },
  other: { label: 'Other', icon: FileQuestion, color: 'var(--chart-5)' },
};

/**
 * Files that landed without an album.
 *
 * Real recovery, not a diagnostic: an upload interrupted before the album was
 * chosen counts against the quota while showing up nowhere, and this is how it
 * gets filed.
 */
function UnassignedFiles() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { files, isLoading, loadFailed, refetch } = useUnassignedFiles();
  const { albums } = useAlbums({ limit: 100 });
  const attach = useAttachToAlbum();
  const remove = useDeleteFiles(undefined);

  // Only your own: the server files into an album it checks you own, so
  // offering a shared one ended in a refusal after the choice was made.
  const ownAlbums = useMemo(
    () =>
      albums.filter((album) =>
        album.my_access ? album.my_access === 'owner' : album.user_id === user?.id,
      ),
    [albums, user?.id],
  );

  const [picked, setPicked] = useState<string[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteNow = () =>
    remove.mutate(picked, {
      onSuccess: (result) => {
        setDeleting(false);
        setPicked([]);
        // useDeleteFiles refreshes the album lists; this list is its own key.
        void queryClient.invalidateQueries({ queryKey: unassignedFilesKey });
        if (result.failed > 0) {
          toast.error('Some files were not deleted', {
            description: `${result.failed} ${result.failed === 1 ? 'is' : 'are'} still here. Try those again.`,
          });
        } else {
          toast.success(`Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'}`);
        }
      },
      onError: (err: Error) => toast.error('Could not delete', { description: err.message }),
    });

  if (isLoading) return <CenteredSpinner />;
  if (loadFailed) {
    return <ErrorState message="Could not load your unfiled media." onRetry={() => refetch()} />;
  }
  if (files.length === 0) {
    return (
      <p className="px-5 py-6 text-center text-sm text-muted-foreground">
        Every stored file belongs to an album.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <Checkbox
          checked={picked.length === files.length && files.length > 0}
          onCheckedChange={(checked) =>
            setPicked(checked ? files.map((f) => f.key) : [])
          }
        />
        <p className="flex-1 text-xs text-muted-foreground">
          {picked.length > 0 ? `${picked.length} selected` : `${files.length} unassigned`}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={picked.length === 0 || remove.isPending}
          onClick={() => setDeleting(true)}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
        <Button
          size="sm"
          disabled={picked.length === 0}
          onClick={() => setAssigning(true)}
        >
          <FolderInput className="size-3.5" />
          File into an album
        </Button>
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {picked.length} file{picked.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              They are removed from storage for good, along with their previews.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(event) => {
                // Open until the request settles, so a failure is reported.
                event.preventDefault();
                deleteNow();
              }}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ul className="max-h-80 overflow-y-auto">
        {files.map((file) => (
          <li key={file.key}>
            <label className="flex cursor-pointer items-center gap-3 border-b px-5 py-2.5 last:border-0 hover:bg-accent/40">
              <Checkbox
                checked={picked.includes(file.key)}
                onCheckedChange={(checked) =>
                  setPicked((prev) =>
                    checked ? [...prev, file.key] : prev.filter((k) => k !== file.key),
                  )
                }
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {fileNameFromKey(file.key)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatBytes(file.sizeBytes)}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <Dialog open={assigning} onOpenChange={setAssigning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File into an album</DialogTitle>
            <DialogDescription>
              {picked.length} file{picked.length === 1 ? '' : 's'} will appear in
              the album you choose.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2">
            <Label>Album</Label>
            <Select value={albumId} onValueChange={setAlbumId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an album" />
              </SelectTrigger>
              <SelectContent>
                {ownAlbums.map((album) => (
                  <SelectItem key={album.id} value={album.id}>
                    {album.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {ownAlbums.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Files can only go into an album of your own, and you have none yet.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigning(false)}>
              Cancel
            </Button>
            <Button
              disabled={!albumId || attach.isPending}
              onClick={() =>
                attach.mutate(
                  { keys: picked, albumId },
                  {
                    onSuccess: (result) => {
                      setAssigning(false);
                      setPicked([]);
                      toast.success(
                        `Filed ${result.attached} file${result.attached === 1 ? '' : 's'}`,
                      );
                    },
                    onError: (err: Error) =>
                      toast.error('Could not file those', { description: err.message }),
                  },
                )
              }
            >
              {attach.isPending && <Loader2 className="size-4 animate-spin" />}
              File them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function StorageSettingsPage() {
  const { usage, storageUsedBytes, storageLimitBytes, storageFraction } = useUsage();
  const { breakdown, isLoading, loadFailed, refetch } = useStorageBreakdown();

  const byType = breakdown?.byType ?? [];
  const byAlbum = breakdown?.byAlbum ?? [];

  // Wiping everything lived on the long Settings page; it belongs with the
  // storage it empties.
  const wipe = useWipeStorage();
  const [confirmingWipe, setConfirmingWipe] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const fail = (label: string) => (err: Error) =>
    toast.error(label, { description: err.message });

  return (
    <Screen title="Storage">
      <PageHeader
        title="Storage"
        description="What you have uploaded, and where it sits"
        actions={
          <Button asChild variant="outline">
            <Link href="/settings/plans">
              <CreditCard className="size-4" />
              Plans
            </Link>
          </Button>
        }
      />

      <div className="w-full max-w-3xl">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                {/* Dashes until the reading arrives: "0 B" and "0 files" are
                    real answers, and they were given before there was one. */}
                <p className="text-3xl font-bold tabular-nums">
                  {usage ? formatBytes(storageUsedBytes) : '—'}
                </p>
                {/*
                  "on the free plan" only while the plan is the whole story.
                  A claimed promo raises this ceiling above what the tier
                  gives, and attributing the total to the plan then makes the
                  reward look like it did nothing.
                */}
                <p className="mt-1 text-sm text-muted-foreground">
                  {storageLimitBytes
                    ? `of ${formatBytes(storageLimitBytes)}${
                        usage?.bonus?.storageBytes
                          ? `, including ${formatBytes(usage.bonus.storageBytes)} from rewards`
                          : ` on the ${usage?.plan ?? 'free'} plan`
                      }`
                    : 'used'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {usage ? (usage.storage.fileCount ?? 0) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">files</p>
              </div>
            </div>
            {storageLimitBytes ? (
              <Progress value={storageFraction * 100} className="mt-4 h-2" />
            ) : null}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted px-3 py-2.5">
                <p className="text-sm font-bold tabular-nums">
                  {usage ? usage.workspaces.used : '—'}
                  {usage?.workspaces.limit != null ? ` / ${usage.workspaces.limit}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">Workspaces</p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2.5">
                <p className="text-sm font-bold tabular-nums">
                  {usage ? usage.albums.used : '—'}
                  {usage?.albums.limit != null ? ` / ${usage.albums.limit} each` : ''}
                </p>
                <p className="text-xs text-muted-foreground">Albums</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* By type */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          By type
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {isLoading && byType.length === 0 ? (
              <CenteredSpinner />
            ) : loadFailed && byType.length === 0 ? (
              <ErrorState message="Could not load your storage." onRetry={() => refetch()} />
            ) : byType.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted-foreground">
                Nothing uploaded yet.
              </p>
            ) : (
              <ul>
                {byType.map((row) => {
                  const meta = TYPE_META[row.kind] ?? TYPE_META.other;
                  const Icon = meta.icon;
                  return (
                    <li
                      key={row.kind}
                      className="flex items-center gap-3 border-b px-5 py-3 last:border-0"
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-lg"
                        style={{ backgroundColor: `color-mix(in oklab, ${meta.color} 15%, transparent)` }}
                      >
                        <Icon className="size-4" style={{ color: meta.color }} />
                      </span>
                      <span className="flex-1 text-sm font-medium">{meta.label}</span>
                      <Badge variant="secondary" className="tabular-nums">
                        {row.files}
                      </Badge>
                      <span className="w-20 text-right text-sm font-semibold tabular-nums">
                        {formatBytes(row.bytes)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* By album */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          By album
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            {loadFailed && byAlbum.length === 0 ? (
              <ErrorState message="Could not load your storage." onRetry={() => refetch()} />
            ) : byAlbum.length === 0 ? (
              <EmptyState
                icon={Images}
                title="No media yet"
                description="Upload into an album to see it broken down here."
              />
            ) : (
              <ul>
                {byAlbum.map((row) => (
                  <li
                    key={row.albumId ?? 'unassigned'}
                    className="flex items-center gap-3 border-b px-5 py-3 last:border-0"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {row.name ?? (
                        <span className="italic text-muted-foreground">Not in an album</span>
                      )}
                    </span>
                    <Badge variant="secondary" className="tabular-nums">
                      {row.files}
                    </Badge>
                    <span className="w-20 text-right text-sm font-semibold tabular-nums">
                      {formatBytes(row.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Unassigned */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Unassigned files
        </h2>
        <Card className="py-0">
          <CardContent className="p-0">
            <UnassignedFiles />
          </CardContent>
        </Card>

        {/* Last, and apart: it cannot be undone. */}
        <h2 className="mb-2 mt-8 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Wipe
        </h2>
        <Card className="border-destructive/25">
          <CardContent className="py-5">
            <div className="flex items-start gap-4">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-destructive/10">
                <Trash2 className="size-4 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Wipe cloud data</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Deletes every photo, video and audio file you have uploaded,
                  across all workspaces. This cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive"
                onClick={() => {
                  setConfirmText('');
                  setConfirmingWipe(true);
                }}
              >
                Wipe
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmingWipe} onOpenChange={setConfirmingWipe}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe every uploaded file?</AlertDialogTitle>
            <AlertDialogDescription>
              {/* "Deletes 0 B" before the reading arrives would make the wipe
                  sound harmless. */}
              This deletes {usage ? `${formatBytes(storageUsedBytes)} of media` : 'every file you have uploaded'}{' '}
              from storage permanently. Albums and workspaces survive, but they
              will be empty. We cannot recover the files for you.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-2">
            <p className="text-sm">
              Type <span className="font-mono font-bold">{CONFIRM_WORD}</span> to confirm.
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmText !== CONFIRM_WORD || wipe.isPending}
              onClick={(event) => {
                // The dialog closes on action by default; keep it open while
                // the request runs so the result can be reported.
                event.preventDefault();
                wipe.mutate(undefined, {
                  onSuccess: (result) => {
                    setConfirmingWipe(false);
                    toast.success(`Deleted ${result.deleted} file${result.deleted === 1 ? '' : 's'}`, {
                      description:
                        result.failed > 0
                          ? `${result.failed} could not be deleted and still count towards your quota.`
                          : `Freed ${formatBytes(result.freedBytes)}.`,
                    });
                  },
                  onError: fail('Could not wipe storage'),
                });
              }}
            >
              {wipe.isPending && <Loader2 className="size-4 animate-spin" />}
              Wipe everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Screen>
  );
}
