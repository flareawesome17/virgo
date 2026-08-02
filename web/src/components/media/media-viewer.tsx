'use client';

import { useCallback, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Download, Music, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes, kindOf, type StoredFile } from '@/api';
import { fileNameFromKey } from '@/hooks/useAlbumFiles';

/**
 * Full-screen media viewer.
 *
 * Its own overlay rather than a Dialog: a lightbox wants the whole viewport
 * with no padding, no card chrome and no max-width, and arrow keys that page
 * through the set — which is the browser affordance a phone gallery has to
 * approximate with swipes.
 */
export function MediaViewer({
  files,
  index,
  onIndexChange,
  onClose,
  onDelete,
}: {
  files: StoredFile[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  onDelete?: (file: StoredFile) => void;
}) {
  const file = files[index];

  const step = useCallback(
    (by: number) => {
      if (files.length === 0) return;
      // Wraps, so holding a key does not dead-end at either edge.
      onIndexChange((index + by + files.length) % files.length);
    },
    [files.length, index, onIndexChange],
  );

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') step(1);
      if (event.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', handle);
    // The page behind must not scroll while the overlay is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handle);
      document.body.style.overflow = previous;
    };
  }, [onClose, step]);

  if (!file) return null;

  const kind = kindOf(file.contentType);
  const name = fileNameFromKey(file.key);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-xs text-white/60">
            {formatBytes(file.sizeBytes)} · {index + 1} of {files.length}
          </p>
        </div>

        {file.url && (
          <Button
            asChild
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
          >
            {/* `download` is only a hint cross-origin, but the new tab is a
                working fallback when the CDN serves it inline. */}
            <a href={file.url} download={name} target="_blank" rel="noreferrer" aria-label="Download">
              <Download className="size-4" />
            </a>
          </Button>
        )}
        {onDelete && (
          <Button
            size="icon"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-destructive"
            onClick={() => onDelete(file)}
            aria-label="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
        {files.length > 1 && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => step(-1)}
            aria-label="Previous"
            className="absolute left-4 z-10 size-11 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
          >
            <ChevronLeft className="size-5" />
          </Button>
        )}

        {!file.url ? (
          <p className="text-sm text-white/70">
            This file has no public URL. The bucket may be private.
          </p>
        ) : kind === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url}
            alt={name}
            className="max-h-full max-w-full object-contain"
          />
        ) : kind === 'video' ? (
          <video
            key={file.key}
            src={file.url}
            controls
            autoPlay
            className="max-h-full max-w-full"
          />
        ) : kind === 'audio' ? (
          <div className="w-full max-w-md rounded-2xl bg-white/5 p-8 text-center">
            <div className="mx-auto grid size-20 place-items-center rounded-full bg-primary/20">
              <Music className="size-8 text-primary" />
            </div>
            <p className="mt-4 truncate text-sm font-semibold text-white">{name}</p>
            <audio key={file.key} src={file.url} controls autoPlay className="mt-5 w-full" />
          </div>
        ) : (
          <div className="text-center text-white/70">
            <p className="text-sm">No preview for this file type.</p>
            <Button asChild variant="outline" className="mt-4">
              <a href={file.url} target="_blank" rel="noreferrer">
                Open in a new tab
              </a>
            </Button>
          </div>
        )}

        {files.length > 1 && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => step(1)}
            aria-label="Next"
            className="absolute right-4 z-10 size-11 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
          >
            <ChevronRight className="size-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
