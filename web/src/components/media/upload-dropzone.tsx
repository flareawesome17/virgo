'use client';

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CheckCircle2, CloudUpload, Loader2, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatBytes } from '@/api';
import type { UploadItem } from '@/hooks/useUpload';

/**
 * Drag-and-drop upload.
 *
 * The affordance the phone cannot offer: a photographer dragging a folder off
 * the desktop straight into an album, rather than tapping through a picker one
 * batch at a time. The file input stays as the keyboard and click path.
 */
export function UploadDropzone({
  onFiles,
  items,
  onCancel,
  onClearFinished,
  accept,
  children,
  className,
}: {
  onFiles: (files: File[]) => void;
  items: UploadItem[];
  onCancel: (id: string) => void;
  onClearFinished: () => void;
  /** Passed to the file input; the drop path accepts whatever is dropped. */
  accept?: string;
  /** The content the zone wraps, so the whole page is a drop target. */
  children: ReactNode;
  className?: string;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element, so a boolean flag
  // flickers as the pointer crosses them. Counting entries does not.
  const depth = useRef(0);

  const onDragEnter = useCallback((event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    depth.current -= 1;
    if (depth.current <= 0) {
      depth.current = 0;
      setDragging(false);
    }
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const active = items.filter((i) => i.status === 'uploading' || i.status === 'queued');
  const failed = items.filter((i) => i.status === 'failed');
  const done = items.filter((i) => i.status === 'done');

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onFiles(files);
          // Reset, or picking the same file twice in a row does nothing.
          event.target.value = '';
        }}
      />

      {/* A programmatic click target so callers can open the picker from
          their own buttons. aria-hidden and untabbable: it is not a control a
          person should meet, and without this it announces as a second
          "Choose files" next to the real one. */}
      <button
        type="button"
        data-upload-trigger
        aria-hidden
        tabIndex={-1}
        className="sr-only"
        onClick={() => inputRef.current?.click()}
      />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <div className="text-center">
            <CloudUpload className="mx-auto size-10 text-primary" />
            <p className="mt-3 text-base font-bold">Drop to upload</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Photos, video and audio
            </p>
          </div>
        </div>
      )}

      {/* Progress panel, anchored so it survives scrolling the grid. */}
      {items.length > 0 && (
        <div className="fixed bottom-4 right-4 z-40 w-80 overflow-hidden rounded-xl border bg-popover shadow-lg">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {active.length > 0 ? (
              <Loader2 className="size-3.5 animate-spin text-primary" />
            ) : failed.length > 0 ? (
              <XCircle className="size-3.5 text-destructive" />
            ) : (
              <CheckCircle2 className="size-3.5 text-success" />
            )}
            <p className="flex-1 text-xs font-bold">
              {active.length > 0
                ? `Uploading ${active.length} file${active.length === 1 ? '' : 's'}`
                : failed.length > 0
                  ? `${done.length} uploaded, ${failed.length} failed`
                  : `${done.length} uploaded`}
            </p>
            {active.length === 0 && (
              <Button size="icon" variant="ghost" className="size-6" onClick={onClearFinished}>
                <X className="size-3" />
              </Button>
            )}
          </div>

          <ul className="max-h-56 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id} className="border-b px-3 py-2 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs" title={item.name}>
                    {item.name}
                  </span>
                  {item.status === 'uploading' || item.status === 'queued' ? (
                    <button
                      onClick={() => onCancel(item.id)}
                      aria-label={`Cancel ${item.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  ) : item.status === 'done' ? (
                    <CheckCircle2 className="size-3 shrink-0 text-success" />
                  ) : (
                    <XCircle className="size-3 shrink-0 text-destructive" />
                  )}
                </div>

                {item.status === 'uploading' || item.status === 'queued' ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={item.progress * 100} className="h-1 flex-1" />
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {Math.round(item.progress * 100)}%
                    </span>
                  </div>
                ) : (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {item.status === 'failed'
                      ? (item.error ?? 'Failed')
                      : item.status === 'cancelled'
                        ? 'Cancelled'
                        : formatBytes(item.sizeBytes)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Opens the dropzone's file picker from anywhere on the page. */
export function openFilePicker(root: HTMLElement | Document = document) {
  root.querySelector<HTMLButtonElement>('[data-upload-trigger]')?.click();
}
