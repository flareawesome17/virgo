'use client';
/* eslint-disable @next/next/no-img-element -- signed bucket links, drawn small and opened in full */

import { useEffect, useRef, useState } from 'react';
import { Download, FileText, Paperclip, Star, X } from 'lucide-react';
import {
  console_,
  MAX_SUPPORT_FILE_BYTES,
  MAX_SUPPORT_FILES,
  SUPPORT_FILE_TYPES,
  type TicketAttachment,
} from '@/api/console';
import { Button } from '@/components/ui/button';
import { bytes } from './primitives';
import { cn } from '@/lib/utils';

interface PendingFile {
  key: number;
  name: string;
  size: number;
  type: string;
  preview: string | null;
  progress: number;
  id: string | null;
  error: string | null;
}

function problem(type: string, size: number): string | null {
  if (!SUPPORT_FILE_TYPES.includes(type)) return 'Only images (JPEG, PNG, WebP, GIF) and PDFs.';
  if (size > MAX_SUPPORT_FILE_BYTES) return 'Over 10 MB.';
  if (size <= 0) return 'Empty file.';
  return null;
}

/** PUT to a signed URL with progress. Content-Length is the browser's to set. */
function put(
  file: File,
  ticket: { uploadUrl: string; requiredHeaders: Record<string, string> },
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', ticket.uploadUrl, true);
    for (const [name, value] of Object.entries(ticket.requiredHeaders)) {
      if (name.toLowerCase() !== 'content-length') xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(e.loaded / e.total, 1));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('The bucket refused it.'));
    xhr.onerror = () => reject(new Error('Could not reach storage.'));
    xhr.send(file);
  });
}

/**
 * Files for one staff reply or note, each uploading as soon as it is picked.
 * A failed one stays listed until removed, so nothing is sent short of what
 * was attached.
 */
export function useStaffUploads() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const count = useRef(0);
  const live = useRef(files);
  useEffect(() => {
    live.current = files;
  }, [files]);
  useEffect(
    () => () => {
      for (const f of live.current) if (f.preview) URL.revokeObjectURL(f.preview);
    },
    [],
  );

  const patch = (key: number, change: Partial<PendingFile>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));

  async function send(key: number, file: File) {
    try {
      const ticket = await console_.signSupportFile({
        contentType: file.type,
        contentLength: file.size,
        name: file.name,
      });
      await put(file, ticket, (progress) => patch(key, { progress }));
      patch(key, { id: ticket.id, progress: 1 });
    } catch (err) {
      patch(key, { error: err instanceof Error ? err.message : 'Did not upload.' });
    }
  }

  function add(list: FileList): string | null {
    const all = Array.from(list);
    const room = Math.max(0, MAX_SUPPORT_FILES - live.current.length);
    for (const file of all.slice(0, room)) {
      const error = problem(file.type, file.size);
      count.current += 1;
      const key = count.current;
      setFiles((current) => [
        ...current,
        {
          key,
          name: file.name,
          size: file.size,
          type: file.type,
          preview: !error && file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          progress: 0,
          id: null,
          error,
        },
      ]);
      if (!error) void send(key, file);
    }
    return all.length > room ? `Up to ${MAX_SUPPORT_FILES} files.` : null;
  }

  function remove(key: number) {
    const gone = live.current.find((f) => f.key === key);
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    setFiles((list) => list.filter((f) => f.key !== key));
  }

  function clear() {
    for (const f of live.current) if (f.preview) URL.revokeObjectURL(f.preview);
    setFiles([]);
  }

  return {
    files,
    add,
    remove,
    clear,
    ids: files.flatMap((f) => (f.id && !f.error ? [f.id] : [])),
    busy: files.some((f) => !f.id && !f.error),
    failed: files.some((f) => !!f.error),
  };
}

export type StaffUploads = ReturnType<typeof useStaffUploads>;

/** The attach button, for the composer's toolbar. */
export function AttachButton({ uploads, disabled }: { uploads: StaffUploads; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept={SUPPORT_FILE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) setNote(uploads.add(e.target.files));
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || uploads.files.length >= MAX_SUPPORT_FILES}
        onClick={() => input.current?.click()}
        title={note ?? 'Images or PDFs, up to 10 MB each'}
      >
        <Paperclip className="size-3.5" />
        Attach
      </Button>
    </>
  );
}

/** The files waiting to go with the reply. */
export function PendingFiles({ uploads }: { uploads: StaffUploads }) {
  if (uploads.files.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {uploads.files.map((f) => (
        <li
          key={f.key}
          className={cn(
            'flex items-center gap-1.5 rounded-md border bg-background py-1 pl-1 pr-0.5 text-xs',
            f.error && 'border-destructive/50',
          )}
        >
          {f.preview ? (
            <img src={f.preview} alt="" className="size-6 rounded object-cover" />
          ) : (
            <FileText className="ml-0.5 size-4 text-muted-foreground" />
          )}
          <span className="max-w-[10rem] truncate">{f.name}</span>
          <span className={cn('tabular-nums', f.error ? 'text-destructive' : 'text-muted-foreground')}>
            {f.error ?? (f.id ? bytes(f.size) : `${Math.round(f.progress * 100)}%`)}
          </span>
          <button
            type="button"
            onClick={() => uploads.remove(f.key)}
            aria-label={`Remove ${f.name}`}
            className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Files on a message: pictures drawn small, everything as a row that opens or saves it. */
export function MessageFiles({ files }: { files?: TicketAttachment[] }) {
  if (!files?.length) return null;
  const pictures = files.filter((f) => f.url && f.content_type.startsWith('image/'));
  return (
    <div className="mt-3 space-y-2">
      {pictures.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {pictures.map((f) => (
            <a
              key={f.id}
              href={f.url!}
              target="_blank"
              rel="noreferrer"
              title={f.name}
              className="block overflow-hidden rounded-md border bg-muted"
            >
              <img src={f.url!} alt={f.name} loading="lazy" className="h-24 w-auto max-w-[12rem] object-cover" />
            </a>
          ))}
        </div>
      )}
      <ul className="flex flex-wrap gap-1.5">
        {files.map((f) => (
          <li key={f.id} className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs">
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
            <a
              href={f.url ?? undefined}
              target="_blank"
              rel="noreferrer"
              className="max-w-[14rem] truncate hover:underline"
            >
              {f.name}
            </a>
            <span className="text-muted-foreground">{bytes(f.size_bytes)}</span>
            {f.download_url && (
              <a
                href={f.download_url}
                aria-label={`Download ${f.name}`}
                className="grid size-5 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Download className="size-3" />
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A rating as stars, for the list, the ticket and insights. */
export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('size-3.5', n <= value ? 'fill-primary text-primary' : 'text-muted-foreground/40')}
        />
      ))}
    </span>
  );
}
