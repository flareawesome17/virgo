'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  ExternalLink,
  GripVertical,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { profilesApi, profileUrl, storageApi, kindOf, type PortfolioItem } from '@/api';
import {
  usePortfolio,
  usePortfolioActions,
  useProfileSettings,
  useSetHandle,
  useSetPublished,
} from '@/hooks/useProfile';
import { useAlbums } from '@/hooks/useAlbums';

const MAX_IMAGES = 24;
const MAX_ALBUMS = 12;

/** Where a claimed handle actually resolves. */
const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/**
 * Claiming a handle.
 *
 * Availability is checked as they type, but the answer is advisory — two people
 * can pass the same check in the same second and only one insert can win, so
 * the server's unique index stays the authority and its 409 is surfaced.
 */
function HandleField({
  current,
  changedAt,
}: {
  current: string | null;
  changedAt: string | null;
}) {
  const [value, setValue] = useState(current ?? '');
  const [debounced, setDebounced] = useState('');
  const setHandle = useSetHandle();

  useEffect(() => setValue(current ?? ''), [current]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim().toLowerCase()), 350);
    return () => clearTimeout(id);
  }, [value]);

  const check = useQuery({
    queryKey: ['handle-available', debounced],
    queryFn: () => profilesApi.checkHandle(debounced),
    enabled: debounced.length >= 3 && debounced !== current,
  });

  // 30 days from the last change, matching HANDLE_CHANGE_COOLDOWN_DAYS.
  const lockedUntil = useMemo(() => {
    if (!current || !changedAt) return null;
    const next = new Date(changedAt);
    next.setDate(next.getDate() + 30);
    return next > new Date() ? next : null;
  }, [current, changedAt]);

  const unchanged = value.trim().toLowerCase() === (current ?? '');

  return (
    <div className="space-y-2">
      <Label htmlFor="handle">Your address</Label>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center rounded-md border bg-background pl-3">
          <span className="shrink-0 text-sm text-muted-foreground">virgo.ph/@</span>
          <Input
            id="handle"
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/[^A-Za-z0-9_]/g, '').toLowerCase())}
            placeholder="yourname"
            maxLength={30}
            disabled={Boolean(lockedUntil)}
            className="border-0 pl-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <Button
          onClick={() =>
            setHandle.mutate(value.trim().toLowerCase(), {
              onSuccess: () => toast.success('Handle saved'),
              onError: (error: Error) => toast.error(error.message),
            })
          }
          disabled={
            unchanged ||
            Boolean(lockedUntil) ||
            value.trim().length < 3 ||
            setHandle.isPending ||
            check.data?.available === false
          }
        >
          {setHandle.isPending && <Loader2 className="size-4 animate-spin" />}
          {current ? 'Change' : 'Claim'}
        </Button>
      </div>

      {lockedUntil ? (
        <p className="text-xs text-muted-foreground">
          You can change this again on{' '}
          {lockedUntil.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}.
        </p>
      ) : unchanged ? (
        <p className="text-xs text-muted-foreground">
          {current
            ? 'Changing this breaks every link you have already shared — the old address is not kept or redirected.'
            : 'Letters, numbers and underscores. This becomes your public link.'}
        </p>
      ) : check.isFetching ? (
        <p className="text-xs text-muted-foreground">Checking…</p>
      ) : check.data ? (
        <p
          className={cn(
            'text-xs',
            check.data.available ? 'text-emerald-500' : 'text-destructive',
          )}
        >
          {check.data.available ? 'Available' : check.data.reason}
        </p>
      ) : null}
    </div>
  );
}

/** Pick images from everything already uploaded. */
function AddImagesDialog({
  open,
  onOpenChange,
  chosen,
  remaining,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chosen: Set<string>;
  remaining: number;
}) {
  const { addImage } = usePortfolioActions();
  const [selected, setSelected] = useState<string[]>([]);

  const files = useQuery({
    queryKey: ['storage', 'files', 'all'],
    queryFn: () => storageApi.listFiles({ limit: 200 }),
    enabled: open,
  });

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  const available = (files.data?.data ?? []).filter(
    (file) => kindOf(file.contentType) === 'image' && file.url && !chosen.has(file.key),
  );

  const toggle = (key: string) =>
    setSelected((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : current.length >= remaining
          ? current
          : [...current, key],
    );

  const save = async () => {
    // Sequential, not Promise.all: each add returns the whole list and the cap
    // is checked per insert, so parallel writes would race the counter.
    for (const key of selected) {
      try {
        await addImage.mutateAsync({ fileKey: key });
      } catch (error) {
        toast.error((error as Error).message);
        break;
      }
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add work</DialogTitle>
          <DialogDescription>
            Pick from what you have already uploaded. Room for {remaining} more.
          </DialogDescription>
        </DialogHeader>

        {files.isLoading ? (
          <div className="grid place-items-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : available.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No images left to add. Upload some to an album first.
          </p>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {available.map((file) => {
              const isOn = selected.includes(file.key);
              return (
                <button
                  key={file.key}
                  type="button"
                  onClick={() => toggle(file.key)}
                  className={cn(
                    'relative aspect-square overflow-hidden rounded-lg border-2 transition-colors',
                    isOn ? 'border-primary' : 'border-transparent hover:border-border',
                  )}
                >
                  <Image
                    src={file.url as string}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-cover"
                  />
                  {isOn && (
                    <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={selected.length === 0 || addImage.isPending}>
            {addImage.isPending && <Loader2 className="size-4 animate-spin" />}
            Add {selected.length || ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pick albums to showcase as galleries. */
function AddAlbumsDialog({
  open,
  onOpenChange,
  chosen,
  remaining,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chosen: Set<string>;
  remaining: number;
}) {
  const { addAlbum } = usePortfolioActions();
  const { albums } = useAlbums();
  const available = albums.filter((album) => !chosen.has(album.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Showcase a gallery</DialogTitle>
          <DialogDescription>
            A separate public link is created for the profile — the link your
            client already has stays private and untouched.
          </DialogDescription>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No albums left to showcase.
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto">
            {available.map((album) => (
              <li key={album.id}>
                <button
                  type="button"
                  disabled={remaining <= 0 || addAlbum.isPending}
                  onClick={() =>
                    addAlbum.mutate(
                      { albumId: album.id },
                      {
                        onSuccess: () => {
                          toast.success(`${album.name} added to your profile`);
                          onOpenChange(false);
                        },
                        onError: (error: Error) => toast.error(error.message),
                      },
                    )
                  }
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
                >
                  <Layers className="size-4 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{album.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {album.item_count ?? 0} items
                    </p>
                  </div>
                  <Plus className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One row in the portfolio list, draggable to reorder. */
function PortfolioRow({
  item,
  onRemove,
  dragProps,
}: {
  item: PortfolioItem;
  onRemove: () => void;
  dragProps: React.HTMLAttributes<HTMLLIElement>;
}) {
  return (
    <li
      {...dragProps}
      className="flex items-center gap-3 rounded-lg border bg-card p-2 transition-colors hover:border-primary/30"
    >
      <GripVertical className="size-4 shrink-0 cursor-grab text-muted-foreground/50" />

      {item.kind === 'image' ? (
        <Image
          src={item.url}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded object-cover"
        />
      ) : item.coverUrl ? (
        <Image
          src={item.coverUrl}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="grid size-11 shrink-0 place-items-center rounded bg-primary/10">
          <Layers className="size-4 text-primary" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.kind === 'album' ? item.name : (item.caption ?? 'Photo')}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.kind === 'album' ? `Gallery · ${item.itemCount} items` : 'Photo'}
        </p>
      </div>

      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

/**
 * The public profile controls: address, the switch, and the portfolio.
 *
 * Everything about being visible on the open web is in one card, because it is
 * one decision — a publish toggle three sections away from the work it
 * publishes is how people end up live without meaning to be.
 */
export function PublicProfileCard() {
  const { settings, isLoading } = useProfileSettings();
  const setPublished = useSetPublished();
  const { items, images, albums, loadFailed, refetch } = usePortfolio();
  const { remove, reorder } = usePortfolioActions();

  const [pickingImages, setPickingImages] = useState(false);
  const [pickingAlbums, setPickingAlbums] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // The owner's own list carries the source refs, so the pickers can hide what
  // is already on the profile without reverse-engineering a CDN URL.
  const chosenImageKeys = useMemo(
    () =>
      new Set(
        images.flatMap((i) => (i.kind === 'image' && i.fileKey ? [i.fileKey] : [])),
      ),
    [images],
  );
  const chosenAlbumIds = useMemo(
    () =>
      new Set(
        albums.flatMap((a) => (a.kind === 'album' && a.albumId ? [a.albumId] : [])),
      ),
    [albums],
  );

  if (isLoading || !settings) {
    return (
      <Card>
        <CardContent className="grid place-items-center py-10">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const onDrop = (target: number) => {
    if (dragIndex === null || dragIndex === target) return;
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    reorder.mutate(next.map((i) => i.id));
  };

  return (
    <Card>
      <CardContent className="space-y-6 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold">Public profile</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              A page anyone can see, so people looking to hire can find you and
              send work. Off unless you turn it on.
            </p>
          </div>
          <Switch
            checked={settings.published}
            disabled={setPublished.isPending || (!settings.published && !settings.canPublish)}
            onCheckedChange={(next) =>
              setPublished.mutate(next, {
                onSuccess: () =>
                  toast.success(next ? 'Your profile is live' : 'Your profile is private again'),
                onError: (error: Error) => toast.error(error.message),
              })
            }
          />
        </div>

        {!settings.canPublish && settings.blockers.length > 0 && (
          <div className="flex gap-2.5 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <div className="text-xs">
              <p className="font-semibold text-amber-500">
                Before you can publish
              </p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {settings.blockers.map((blocker) => (
                  <li key={blocker}>· {blocker}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <HandleField current={settings.handle} changedAt={settings.handleChangedAt} />

        {settings.published && settings.handle && (
          <a
            href={profileUrl(settings.handle, SITE)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <ExternalLink className="size-3.5" />
            View your public page
          </a>
        )}

        <div className="space-y-3 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Portfolio</p>
              <p className="text-xs text-muted-foreground">
                {images.length}/{MAX_IMAGES} photos · {albums.length}/{MAX_ALBUMS} galleries
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPickingImages(true)}
                disabled={images.length >= MAX_IMAGES}
              >
                <ImagePlus className="size-4" />
                Photos
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPickingAlbums(true)}
                disabled={albums.length >= MAX_ALBUMS}
              >
                <Layers className="size-4" />
                Gallery
              </Button>
            </div>
          </div>

          {loadFailed && items.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
              Could not load your portfolio.{' '}
              <button type="button" className="underline" onClick={() => refetch()}>
                Try again
              </button>
            </p>
          ) : items.length === 0 ? (
            <p className="rounded-lg border border-dashed py-8 text-center text-xs text-muted-foreground">
              Nothing here yet. Add a few of your best photographs — this is what
              someone judges before they get in touch.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {items.map((item, index) => (
                <PortfolioRow
                  key={item.id}
                  item={item}
                  onRemove={() =>
                    remove.mutate(item.id, {
                      onError: (error: Error) => toast.error(error.message),
                    })
                  }
                  dragProps={{
                    draggable: true,
                    onDragStart: () => setDragIndex(index),
                    onDragOver: (e) => e.preventDefault(),
                    onDrop: () => onDrop(index),
                  }}
                />
              ))}
            </ul>
          )}

          {items.length > 1 && (
            <p className="text-[11px] text-muted-foreground">
              Drag to reorder — the first few are what people see first.
            </p>
          )}
        </div>
      </CardContent>

      <AddImagesDialog
        open={pickingImages}
        onOpenChange={setPickingImages}
        chosen={chosenImageKeys}
        remaining={MAX_IMAGES - images.length}
      />
      <AddAlbumsDialog
        open={pickingAlbums}
        onOpenChange={setPickingAlbums}
        chosen={chosenAlbumIds}
        remaining={MAX_ALBUMS - albums.length}
      />
    </Card>
  );
}
