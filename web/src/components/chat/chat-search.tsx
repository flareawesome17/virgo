'use client';

import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { ChevronDown, ChevronUp, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Search in this chat (board 140): the header becomes the search box, with
 * Done to go back to the chat as it was.
 *
 * Enter steps to the next older match and Shift+Enter to the next newer one,
 * as find does in a browser; Escape is Done.
 */
export function ChatSearchHeader({
  inputRef,
  value,
  onChange,
  onDone,
  onOlder,
  onNewer,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
  onOlder: () => void;
  onNewer: () => void;
}) {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onDone();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) onNewer();
      else onOlder();
    }
  };

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
          placeholder="Search this chat"
          aria-label="Search this chat"
          className="pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              inputRef.current?.focus();
            }}
            aria-label="Clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <Button variant="ghost" onClick={onDone} className="font-semibold text-primary hover:text-primary">
        Done
      </Button>
    </div>
  );
}

/**
 * "2 of 5 in Marco Uy", with older (up) and newer (down). Counted from the
 * newest, which is where a search starts.
 */
export function ChatSearchCount({
  term,
  title,
  total,
  index,
  capped,
  loading,
  failed,
  onRetry,
  onOlder,
  onNewer,
}: {
  term: string;
  /** The chat's name. */
  title: string;
  total: number;
  /** Which match is showing, 0 being the newest. */
  index: number;
  /** The server stops at a number; more may be older than that. */
  capped: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onOlder: () => void;
  onNewer: () => void;
}) {
  let line: ReactNode;
  if (!term) {
    line = <span className="font-normal text-muted-foreground">Type a word to look for</span>;
  } else if (loading && total === 0) {
    line = (
      <span className="flex items-center gap-2 font-normal text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Searching…
      </span>
    );
  } else if (failed && total === 0) {
    line = (
      <button
        type="button"
        onClick={onRetry}
        className="font-semibold text-primary underline underline-offset-2"
      >
        Couldn&apos;t search this chat. Try again
      </button>
    );
  } else if (total === 0) {
    line = (
      <>
        No matches <span className="font-normal text-muted-foreground">in {title}</span>
      </>
    );
  } else {
    line = (
      <>
        {index + 1} of {total}
        {capped ? '+' : ''} <span className="font-normal text-muted-foreground">in {title}</span>
      </>
    );
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b pl-4 pr-2">
      <p className="min-w-0 flex-1 truncate text-sm font-semibold" aria-live="polite">
        {line}
      </p>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Older match"
        title="Older match (Enter)"
        disabled={total === 0 || index >= total - 1}
        onClick={onOlder}
      >
        <ChevronUp className="size-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Newer match"
        title="Newer match (Shift+Enter)"
        disabled={total === 0 || index <= 0}
        onClick={onNewer}
      >
        <ChevronDown className="size-4" />
      </Button>
    </div>
  );
}

/** Where the composer was, while searching (board 140). */
export function ChatSearchFooter() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t px-4 py-3 text-xs text-muted-foreground">
      <Search className="size-4 shrink-0" aria-hidden />
      Searching the list finds this chat too, and opens it here
    </div>
  );
}
