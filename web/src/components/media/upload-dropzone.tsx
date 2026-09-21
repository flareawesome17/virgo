'use client';

import { useCallback, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { CloudUpload } from 'lucide-react';
import { toast } from 'sonner';
import { contentTypeForName } from '@/api';
import { cn } from '@/lib/utils';
import { useUploadQueue, type UploadTarget } from '@/components/upload/upload-provider';

/** What an album accepts; anything else in a dropped folder is left behind. */
const MEDIA_PREFIXES = ['image/', 'video/', 'audio/'];

/**
 * Files a camera or an OS leaves in a folder that nobody means to upload.
 * Sidecars (.xmp, .aae) and thumbnail caches would only be refused by the
 * server one at a time, as failures.
 */
const CLUTTER = /^(\..*|thumbs\.db|desktop\.ini|.*\.(xmp|aae|thm|lrv|db|ini))$/i;

function isMedia(file: File): boolean {
  if (CLUTTER.test(file.name)) return false;
  const type = file.type || contentTypeForName(file.name);
  return MEDIA_PREFIXES.some((prefix) => type.startsWith(prefix));
}

/** Everything under a dropped entry, folders walked all the way down. */
async function filesUnder(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    return [file];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const found: File[] = [];
  // readEntries hands back a folder in batches — a hundred at a time in
  // Chromium — and an empty batch means the end. Reading it once, which is
  // the obvious thing, silently drops everything past the first hundred.
  for (;;) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (batch.length === 0) break;
    for (const child of batch) found.push(...(await filesUnder(child)));
  }
  return found;
}

/**
 * Drag-and-drop upload, folders included.
 *
 * The affordance the phone cannot offer: dragging a whole card's folder off
 * the desktop straight into an album. This read `dataTransfer.files`, which
 * lists a dropped folder as one entry with nothing in it, so the one thing the
 * feature existed for did not work. Folders are now walked, and anything that
 * is not a photograph, a film or audio is left behind and counted rather than
 * sent to fail on the server.
 *
 * The queue itself lives above the page (UploadProvider), so uploads started
 * here carry on after you leave.
 */
export function UploadDropzone({
  target,
  children,
  className,
}: {
  target: UploadTarget;
  /** The content the zone wraps, so the whole page is a drop target. */
  children: ReactNode;
  className?: string;
}) {
  const { enqueue } = useUploadQueue();
  const [dragging, setDragging] = useState(false);
  const filesInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child element, so a boolean flag
  // flickers as the pointer crosses them. Counting entries does not.
  const depth = useRef(0);

  const accept = useCallback(
    (all: File[]) => {
      const media = all.filter(isMedia);
      const skipped = all.length - media.length;
      if (skipped > 0) {
        toast(`Left out ${skipped} file${skipped === 1 ? '' : 's'}`, {
          description: 'Only photographs, films and audio go into an album.',
        });
      }
      enqueue(media, target);
    },
    [enqueue, target],
  );

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
      // Entries have to be taken during the event: the list is emptied the
      // moment this handler returns, so the walk below works from these.
      const entries = Array.from(event.dataTransfer?.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.webkitGetAsEntry?.())
        .filter((entry): entry is FileSystemEntry => !!entry);
      if (entries.length === 0) {
        accept(Array.from(event.dataTransfer?.files ?? []));
        return;
      }
      void Promise.all(entries.map(filesUnder))
        .then((lists) => accept(lists.flat()))
        .catch(() =>
          toast.error('Could not read that folder', {
            description: 'Try choosing it with Upload › Folder instead.',
          }),
        );
    },
    [accept],
  );

  return (
    <div
      className={cn('relative', className)}
      onDragEnter={onDragEnter}
      onDragOver={(event) => {
        if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {children}

      <input
        ref={filesInput}
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          accept(Array.from(event.target.files ?? []));
          // Reset, or picking the same file twice in a row does nothing.
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        // Not in React's types, but every current browser honours it.
        {...{ webkitdirectory: '', directory: '' }}
        onChange={(event) => {
          accept(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      {/* Programmatic click targets so a page's own buttons can open either
          picker. aria-hidden and untabbable: not controls a person should
          meet, and without this each announces as a second button. */}
      <button type="button" data-upload-trigger aria-hidden tabIndex={-1} className="sr-only" onClick={() => filesInput.current?.click()} />
      <button type="button" data-upload-folder-trigger aria-hidden tabIndex={-1} className="sr-only" onClick={() => folderInput.current?.click()} />

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-xl border-2 border-dashed border-primary bg-background/85 backdrop-blur-sm">
          <div className="text-center">
            <CloudUpload className="mx-auto size-10 text-primary" />
            <p className="mt-3 text-base font-bold">Drop to upload</p>
            <p className="mt-1 text-sm text-muted-foreground">Files or whole folders — photos, films and audio</p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Opens the dropzone's file picker from anywhere on the page. */
export function openFilePicker(root: HTMLElement | Document = document) {
  root.querySelector<HTMLButtonElement>('[data-upload-trigger]')?.click();
}

/** Opens the dropzone's folder picker from anywhere on the page. */
export function openFolderPicker(root: HTMLElement | Document = document) {
  root.querySelector<HTMLButtonElement>('[data-upload-folder-trigger]')?.click();
}
