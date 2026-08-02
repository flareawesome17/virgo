'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowLeft,
  CreditCard,
  FileQuestion,
  FolderInput,
  Images,
  Loader2,
  Music,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
import { useUsage } from '@/hooks/useUsage';
import {
  useAttachToAlbum,
  useStorageBreakdown,
  useUnassignedFiles,
} from '@/hooks/useStorageAdmin';
import { useAlbums } from '@/hooks/useAlbums';
import { fileNameFromKey } from '@/hooks/useAlbumFiles';
import { formatBytes } from '@/api';

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
  const { files, isLoading } = useUnassignedFiles();
  const { albums } = useAlbums({ limit: 200 });
  const attach = useAttachToAlbum();

  const [picked, setPicked] = useState<string[]>([]);
  const [albumId, setAlbumId] = useState('');
  const [assigning, setAssigning] = useState(false);

  if (isLoading) return <CenteredSpinner />;
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
          disabled={picked.length === 0}
          onClick={() => setAssigning(true)}
        >
          <FolderInput className="size-3.5" />
          File into an album
        </Button>
      </div>

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
                {albums.map((album) => (
                  <SelectItem key={album.id} value={album.id}>
                    {album.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  const { breakdown, isLoading } = useStorageBreakdown();

  const byType = breakdown?.byType ?? [];
  const byAlbum = breakdown?.byAlbum ?? [];

  return (
    <AppShell title="Storage">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <Button asChild size="icon" variant="ghost" className="-ml-2 shrink-0">
              <Link href="/settings" aria-label="Back">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            Storage
          </span>
        }
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

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <Card>
          <CardContent className="py-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-bold tabular-nums">
                  {formatBytes(storageUsedBytes)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {storageLimitBytes
                    ? `of ${formatBytes(storageLimitBytes)} on the ${usage?.plan ?? 'free'} plan`
                    : 'used'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {usage?.storage.fileCount ?? 0}
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
                  {usage?.workspaces.used ?? 0}
                  {usage?.workspaces.limit != null ? ` / ${usage.workspaces.limit}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">Workspaces</p>
              </div>
              <div className="rounded-lg bg-muted px-3 py-2.5">
                <p className="text-sm font-bold tabular-nums">
                  {usage?.albums.used ?? 0}
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
            {byAlbum.length === 0 ? (
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
      </div>
    </AppShell>
  );
}
