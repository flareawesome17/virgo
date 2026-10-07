'use client';

import { useEffect, useRef, type ChangeEvent } from 'react';
import { FileText, Loader2, Receipt, X } from 'lucide-react';
import {
  ApiError,
  fileSizeLabel,
  moneyApi,
  receiptFileProblem,
  type MoneyReceipt,
} from '@/api';
import { contentTypeForName, putToBucket } from '@/api/endpoints/storage';
import { cn } from '@/lib/utils';

/**
 * The receipt on the form: one already saved on the entry, or one on its way
 * up. `id` is set once the bytes are in the bucket — that is what the entry
 * sends — and `error` says why it never will be. The phone's ReceiptDraft.
 */
export interface ReceiptDraft {
  id: string | null;
  name: string;
  contentType: string;
  sizeBytes: number;
  /** An object URL for a file picked here, or the signed link of a saved one. */
  previewUrl: string | null;
  progress: number;
  error: string | null;
}

export function draftOf(receipt: MoneyReceipt | null | undefined): ReceiptDraft | null {
  if (!receipt) return null;
  return {
    id: receipt.id,
    name: receipt.name,
    contentType: receipt.contentType,
    sizeBytes: receipt.sizeBytes,
    previewUrl: receipt.url,
    progress: 1,
    error: null,
  };
}

export function receiptBusy(draft: ReceiptDraft | null): boolean {
  return !!draft && !draft.id && !draft.error;
}

/**
 * A photo or PDF of the receipt, uploaded the moment it is chosen. HEIC is
 * turned away with the reason: a browser cannot draw it, and unlike the
 * phone the browser has nothing to re-encode it with.
 */
export function ReceiptField({
  value,
  onChange,
  disabled,
}: {
  value: ReceiptDraft | null;
  onChange: (next: ReceiptDraft | null) => void;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const attempt = useRef(0);
  // The value as last rendered, for an upload that finishes later.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  // An object URL holds the file in memory until it is revoked.
  const objectUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  async function upload(file: File) {
    attempt.current += 1;
    const mine = attempt.current;
    const type = file.type || contentTypeForName(file.name);
    const problem = receiptFileProblem({ type, size: file.size });
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = !problem && type.startsWith('image/') ? URL.createObjectURL(file) : null;
    onChange({
      id: null,
      name: file.name,
      contentType: type,
      sizeBytes: file.size,
      previewUrl: objectUrl.current,
      progress: 0,
      error: problem,
    });
    if (problem) return;
    const update = (change: Partial<ReceiptDraft>) => {
      if (attempt.current !== mine || !latest.current) return;
      onChange({ ...latest.current, ...change });
    };
    try {
      const ticket = await moneyApi.signReceipt({
        contentType: type,
        contentLength: file.size,
        name: file.name,
      });
      await putToBucket(file, ticket, (progress) => update({ progress }));
      update({ id: ticket.id, progress: 1 });
    } catch (error) {
      update({
        error:
          error instanceof ApiError && error.status !== 0
            ? error.message
            : "The receipt didn't upload. Remove it and try again.",
      });
    }
  }

  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void upload(file);
  };

  const remove = () => {
    attempt.current += 1;
    onChange(null);
  };

  const chooser = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,application/pdf"
      className="hidden"
      onChange={picked}
    />
  );

  if (!value) {
    return (
      <>
        {chooser}
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={disabled}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed px-3 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
        >
          <Receipt className="size-4 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Add receipt</span>
            <span className="block text-xs text-muted-foreground">A photo or a PDF, up to 10 MB</span>
          </span>
        </button>
      </>
    );
  }

  const uploading = receiptBusy(value);
  const isImage = value.contentType.startsWith('image/');
  const canOpen = !!value.id && !!value.previewUrl?.startsWith('http');

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border p-2',
        value.error ? 'border-destructive' : 'border-border',
      )}
    >
      {chooser}
      <a
        href={canOpen ? (value.previewUrl ?? undefined) : undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!canOpen}
        className={cn('flex min-w-0 flex-1 items-center gap-3', canOpen && 'hover:opacity-80')}
      >
        {isImage && value.previewUrl && !value.error ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value.previewUrl} alt="" className="size-11 rounded-md object-cover" />
        ) : (
          <span className="grid size-11 place-items-center rounded-md bg-muted">
            <FileText className="size-4 text-muted-foreground" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{value.name}</span>
          <span
            className={cn(
              'block truncate text-xs',
              value.error ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {value.error ??
              (uploading
                ? `Uploading… ${Math.round(value.progress * 100)}%`
                : value.sizeBytes > 0
                  ? fileSizeLabel(value.sizeBytes)
                  : 'Receipt')}
          </span>
        </span>
      </a>
      {uploading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
      <button
        type="button"
        onClick={remove}
        disabled={disabled}
        aria-label={`Remove ${value.name}`}
        className="grid size-8 place-items-center rounded-full hover:bg-muted"
      >
        <X className="size-4 text-muted-foreground" />
      </button>
    </div>
  );
}
