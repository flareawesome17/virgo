'use client';
/* eslint-disable @next/next/no-img-element -- signed bucket links, drawn small and opened in full */

import { useEffect, useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import {
  ApiError,
  fileSizeLabel,
  MAX_SUPPORT_FILES,
  SUPPORT_FILE_TYPES,
  supportApi,
  supportFileProblem,
  type SupportAttachment,
} from '@/api';
import { contentTypeForName, putToBucket } from '@/api/endpoints/storage';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** One file on its way up, or refused before it went. */
interface PendingFile {
  key: number;
  name: string;
  size: number;
  type: string;
  /** A local preview for an image, revoked when it goes. */
  preview: string | null;
  progress: number;
  /** The attachment id, once the bytes are in the bucket. */
  id: string | null;
  error: string | null;
}

/**
 * Files for one support message: each starts uploading the moment it is
 * picked, so sending is not held up by the slowest one at the end.
 *
 * Uploads go to the bucket directly on a ticket from POST /support/attachments;
 * the message then sends their ids. One that fails stays in the list with
 * why, and has to be removed before sending — sending without it silently
 * would leave support without the screenshot the customer thinks they sent.
 */
export function useSupportUploads() {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const count = useRef(0);
  // The list as last rendered, for handlers and the unmount cleanup.
  const live = useRef(files);
  useEffect(() => {
    live.current = files;
  }, [files]);

  // Previews are object URLs, which hold the file in memory until revoked.
  useEffect(
    () => () => {
      for (const f of live.current) if (f.preview) URL.revokeObjectURL(f.preview);
    },
    [],
  );

  const patch = (key: number, change: Partial<PendingFile>) =>
    setFiles((list) => list.map((f) => (f.key === key ? { ...f, ...change } : f)));

  async function send(key: number, file: File, type: string) {
    try {
      const ticket = await supportApi.signAttachment({
        contentType: type,
        contentLength: file.size,
        name: file.name,
      });
      await putToBucket(file, ticket, (progress) => patch(key, { progress }));
      patch(key, { id: ticket.id, progress: 1 });
    } catch (error) {
      patch(key, {
        error: error instanceof ApiError ? error.message : 'That file did not upload. Remove it and try again.',
      });
    }
  }

  /** Adds what was picked or dropped. Returns a note when some did not fit. */
  function add(list: FileList | File[]): string | null {
    const all = Array.from(list);
    const room = Math.max(0, MAX_SUPPORT_FILES - live.current.length);
    for (const file of all.slice(0, room)) {
      const type = file.type || contentTypeForName(file.name);
      const error = supportFileProblem({ type, size: file.size });
      const key = (count.current += 1);
      setFiles((current) => [
        ...current,
        {
          key,
          name: file.name,
          size: file.size,
          type,
          preview: !error && type.startsWith('image/') ? URL.createObjectURL(file) : null,
          progress: 0,
          id: null,
          error,
        },
      ]);
      if (!error) void send(key, file, type);
    }
    return all.length > room ? `Up to ${MAX_SUPPORT_FILES} files a message.` : null;
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
    /** Ids to send with the message. */
    ids: files.flatMap((f) => (f.id && !f.error ? [f.id] : [])),
    /** Still uploading: sending now would leave them behind. */
    busy: files.some((f) => !f.id && !f.error),
    /** A file that failed and is still listed. */
    failed: files.some((f) => !!f.error),
  };
}

export type SupportUploads = ReturnType<typeof useSupportUploads>;

/** The attach button and the files waiting to go with the message. */
export function AttachFiles({
  uploads,
  disabled,
}: {
  uploads: SupportUploads;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState<string | null>(null);
  const full = uploads.files.length >= MAX_SUPPORT_FILES;

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        multiple
        accept={SUPPORT_FILE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) setNote(uploads.add(e.target.files));
          // So picking the same file again after removing it still fires.
          e.target.value = '';
        }}
      />
      {uploads.files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {uploads.files.map((f) => (
            <li
              key={f.key}
              className={cn(
                'flex max-w-full items-center gap-2 rounded-md border py-1.5 pl-1.5 pr-1 text-xs',
                f.error && 'border-destructive/50',
              )}
            >
              {f.preview ? (
                <img src={f.preview} alt="" className="size-8 shrink-0 rounded object-cover" />
              ) : (
                <span className="grid size-8 shrink-0 place-items-center rounded bg-muted">
                  <FileText className="size-4 text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block max-w-[11rem] truncate font-medium">{f.name}</span>
                <span className={cn('block', f.error ? 'text-destructive' : 'text-muted-foreground')}>
                  {f.error ?? (f.id ? fileSizeLabel(f.size) : `Uploading… ${Math.round(f.progress * 100)}%`)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => uploads.remove(f.key)}
                aria-label={`Remove ${f.name}`}
                className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || full}
          onClick={() => input.current?.click()}
        >
          <Paperclip className="size-4" />
          Attach
        </Button>
        <span className="text-xs text-muted-foreground">
          {note ?? 'Screenshots, photos or PDFs, up to 10 MB each.'}
        </span>
      </div>
    </div>
  );
}

/** Files on a message in the thread: pictures drawn small, everything else as a link. */
export function MessageFiles({ files }: { files?: SupportAttachment[] }) {
  if (!files?.length) return null;
  const pictures = files.filter((f) => f.url && f.content_type.startsWith('image/'));
  const others = files.filter((f) => !pictures.includes(f));
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
              <img
                src={f.url!}
                alt={f.name}
                loading="lazy"
                className="h-28 w-auto max-w-[14rem] object-cover"
              />
            </a>
          ))}
        </div>
      )}
      {others.map((f) => (
        <a
          key={f.id}
          href={f.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className="flex w-fit max-w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent/50"
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{fileSizeLabel(f.size_bytes)}</span>
        </a>
      ))}
    </div>
  );
}
