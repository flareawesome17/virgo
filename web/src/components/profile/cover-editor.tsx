'use client';
/* eslint-disable @next/next/no-img-element -- a local preview from a blob: URL, which next/image cannot load */

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { showcaseActionMessage } from '@/components/showcase/action-message';
import { useRemoveCover, useSetCover } from '@/hooks/useProfile';
import { storageApi } from '@/api';
import { renderCover } from '@/lib/image';

/** The largest photo worth reading in the browser to crop. */
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/**
 * Your cover: add one, change it, or take it off.
 *
 * The phone had the only way to set one. The photo is cropped here to the
 * cover's 2:1, where you put it, and re-encoded before it leaves the browser,
 * so what the camera wrote into the file never reaches the public bucket.
 */
export function CoverControl({ hasCover }: { hasCover: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  /** The photo picked, and a local address to preview it from. */
  const [chosen, setChosen] = useState<{ file: File; preview: string } | null>(null);
  const remove = useRemoveCover();

  const choose = () => input.current?.click();

  const picked = (next: File | undefined) => {
    if (!next) return;
    if (!next.type.startsWith('image/')) {
      toast.error('That is not an image', { description: 'Pick a JPEG, PNG or WebP.' });
      return;
    }
    if (next.size > MAX_SOURCE_BYTES) {
      toast.error('That image is too large', { description: 'Choose one under 40 MB.' });
      return;
    }
    setChosen({ file: next, preview: URL.createObjectURL(next) });
  };

  const close = () => {
    if (chosen) URL.revokeObjectURL(chosen.preview);
    setChosen(null);
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const next = e.target.files?.[0];
          // Cleared, so picking the same file again still fires.
          e.target.value = '';
          picked(next);
        }}
      />
      {hasCover ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="bg-background/85 backdrop-blur">
              <ImagePlus className="size-4" />
              Cover
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={choose}>
              <ImagePlus />
              Change cover
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              disabled={remove.isPending}
              onSelect={() =>
                remove.mutate(undefined, {
                  onSuccess: () => toast.success('Cover removed'),
                  onError: (err) =>
                    toast.error("Couldn't remove it", { description: showcaseActionMessage(err, 'cover') }),
                })
              }
            >
              <Trash2 />
              Remove cover
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button size="sm" variant="secondary" className="bg-background/85 backdrop-blur" onClick={choose}>
          <ImagePlus className="size-4" />
          Add a cover
        </Button>
      )}

      <CoverDialog chosen={chosen} onClose={close} />
    </>
  );
}

function CoverDialog({
  chosen,
  onClose,
}: {
  chosen: { file: File; preview: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!chosen} onOpenChange={(open) => !open && onClose()}>
      {/* Keyed by the photo, so each one starts in the middle. */}
      {chosen && (
        <CoverForm key={chosen.preview} file={chosen.file} preview={chosen.preview} onClose={onClose} />
      )}
    </Dialog>
  );
}

function CoverForm({ file, preview, onClose }: { file: File; preview: string; onClose: () => void }) {
  const setCover = useSetCover();
  const [focusY, setFocusY] = useState(0.5);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const cover = await renderCover(file, focusY);
      const uploaded = await storageApi.uploadFile(cover, { scope: 'covers' });
      await setCover.mutateAsync(uploaded.key);
      toast.success('Cover updated');
      onClose();
    } catch (err) {
      toast.error("Couldn't change your cover", { description: showcaseActionMessage(err, 'cover') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Your cover</DialogTitle>
        <DialogDescription>
          It runs across the top of your profile. Slide to choose which part of the photo shows.
        </DialogDescription>
      </DialogHeader>

      <div className="overflow-hidden rounded-lg bg-muted" style={{ aspectRatio: '2 / 1' }}>
        <img
          src={preview}
          alt=""
          className="size-full object-cover"
          // object-position over the excess height is the same placement
          // coverCropRect makes, so what is shown is what is stored.
          style={{ objectPosition: `50% ${focusY * 100}%` }}
        />
      </div>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">Position</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(focusY * 100)}
          onChange={(e) => setFocusY(Number(e.target.value) / 100)}
          className="accent-primary"
          aria-label="Which part of the photo shows, from the top to the bottom"
        />
      </label>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {saving ? 'Saving…' : 'Use this cover'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
