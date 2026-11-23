'use client';

import { useRef, useState, type ComponentType } from 'react';
import {
  Briefcase,
  CalendarPlus,
  ClipboardCheck,
  FileText,
  GalleryVerticalEnd,
  ImageIcon,
  Images,
  MessageSquareText,
  Plus,
  Receipt,
  Wallet,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SavedRepliesPanel, SavedReplyDialogs, type SavedReplyDraft } from '@/components/chat/saved-replies';
import { AlbumPickerDialog } from '@/components/chat/share/album-picker';
import { ListPickerDialog, type ListPickerKind } from '@/components/chat/share/list-pickers';
import { PlanDateDialog } from '@/components/chat/share/plan-date-dialog';
import { useCardSender, type Audience } from '@/components/chat/share/shared';
import type { SavedReply } from '@/api';

type Picker = 'album' | 'date' | ListPickerKind;

const TILES: { picker: Picker | 'saved'; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { picker: 'album', label: 'Album photos', icon: Images },
  { picker: 'date', label: 'Plan a date', icon: CalendarPlus },
  { picker: 'booking', label: 'Booking', icon: ClipboardCheck },
  { picker: 'job-post', label: 'Job post', icon: Briefcase },
  { picker: 'post', label: 'A post', icon: GalleryVerticalEnd },
  { picker: 'package', label: 'Package', icon: Receipt },
  { picker: 'pay', label: 'How to pay', icon: Wallet },
  { picker: 'saved', label: 'Saved replies', icon: MessageSquareText },
];

const LIST_PICKERS: ListPickerKind[] = ['booking', 'job-post', 'post', 'package', 'pay'];

/**
 * The round + at the left of the composer (boards ChatPlus, ChatWeb): Share
 * in this chat. Virgo things go as cards that use none of your storage, and
 * Saved replies opens your saved replies in the same place. Under them,
 * photos and a PDF from this computer, which do use your storage (phase 4).
 *
 * Each choice opens a dialog once the menu has closed, so focus goes back to
 * this button when the dialog is done with, not to the page.
 */
export function ShareMenu({
  conversationId,
  audience,
  onInsertSaved,
  onSent,
  onPickFiles,
}: {
  conversationId: string;
  audience: Audience;
  /** A saved reply, into the message box at the caret. */
  onInsertSaved: (body: string) => void;
  /** A card went: show the newest end of the thread. */
  onSent: () => void;
  /** Photos or a PDF picked from this computer, to check before they go. */
  onPickFiles: (files: File[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'saved'>('menu');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [draft, setDraft] = useState<SavedReplyDraft | null>(null);
  const [deleting, setDeleting] = useState<SavedReply | null>(null);
  const sender = useCardSender(conversationId);
  /** What to open once the menu has finished closing. */
  const after = useRef<(() => void) | null>(null);
  /** Set as a saved reply goes in, so focus stays in the message box. */
  const inserted = useRef(false);
  const savedTile = useRef<HTMLButtonElement>(null);
  const photosInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /** Opens the computer's own picker straight from the click, then closes the menu. */
  const pickFrom = (input: HTMLInputElement | null) => {
    input?.click();
    setOpen(false);
  };
  const picked = (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    // Cleared, so picking the same file again still counts as a change.
    input.value = '';
    if (files.length > 0) onPickFiles(files);
  };

  /** Back from Saved replies, with focus on the tile that opened them. */
  const backToMenu = () => {
    setView('menu');
    requestAnimationFrame(() => savedTile.current?.focus());
  };

  const closeThen = (run: () => void) => {
    after.current = run;
    setOpen(false);
  };

  const closePicker = (next: boolean) => {
    if (!next) setPicker(null);
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Always opens on the tiles. Reset on opening rather than closing,
          // so the closing menu does not flash back to them as it fades.
          if (next) setView('menu');
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            aria-label="Share in this chat"
            title="Share in this chat"
            className="shrink-0 rounded-full"
          >
            {open ? <X className="size-4" /> : <Plus className="size-4" />}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={8}
          aria-label="Share in this chat"
          className="w-[min(26rem,calc(100vw-2rem))] gap-3 rounded-2xl p-3"
          onCloseAutoFocus={(event) => {
            if (inserted.current) {
              inserted.current = false;
              event.preventDefault();
              return;
            }
            // Focus goes back to the + first, then the dialog opens over it,
            // so closing the dialog brings focus back here.
            const run = after.current;
            after.current = null;
            run?.();
          }}
        >
          {view === 'saved' ? (
            <SavedRepliesPanel
              onBack={backToMenu}
              onInsert={(body) => {
                inserted.current = true;
                setOpen(false);
                onInsertSaved(body);
              }}
              onStartDraft={(next) => closeThen(() => setDraft(next))}
              onAskDelete={(reply) => closeThen(() => setDeleting(reply))}
            />
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                From Virgo · uses none of your storage
              </p>
              <ul className="grid grid-cols-4 gap-1">
                {TILES.map(({ picker: target, label, icon: Icon }) => (
                  <li key={target}>
                    <button
                      ref={target === 'saved' ? savedTile : undefined}
                      type="button"
                      onClick={() =>
                        target === 'saved' ? setView('saved') : closeThen(() => setPicker(target))
                      }
                      className={cn(
                        'flex h-[76px] w-full flex-col items-center justify-center gap-1.5 rounded-xl px-1 text-center text-xs font-semibold leading-tight transition-colors',
                        'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      {label}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                From this computer · uses your storage
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => pickFrom(photosInput.current)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ImageIcon className="size-4" aria-hidden />
                  Photos
                </button>
                <button
                  type="button"
                  onClick={() => pickFrom(fileInput.current)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3.5 text-[13px] font-semibold text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileText className="size-4" aria-hidden />
                  A file
                </button>
                <span className="text-xs text-muted-foreground pointer-coarse:hidden">or drag them into the chat</span>
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Outside the menu, which unmounts as it closes. */}
      <input
        ref={photosInput}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-files-input="photos"
        onChange={(event) => picked(event.currentTarget)}
      />
      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        data-files-input="file"
        onChange={(event) => picked(event.currentTarget)}
      />

      <SavedReplyDialogs
        draft={draft}
        onDraftChange={setDraft}
        deleting={deleting}
        onDeletingChange={setDeleting}
      />

      <AlbumPickerDialog
        open={picker === 'album'}
        onOpenChange={closePicker}
        audience={audience}
        sender={sender}
        onSent={onSent}
      />
      <PlanDateDialog
        open={picker === 'date'}
        onOpenChange={closePicker}
        audience={audience}
        sender={sender}
        onSent={onSent}
      />
      {LIST_PICKERS.map((kind) => (
        <ListPickerDialog
          key={kind}
          kind={kind}
          open={picker === kind}
          onOpenChange={closePicker}
          conversationId={conversationId}
          audience={audience}
          sender={sender}
          onSent={onSent}
        />
      ))}
    </>
  );
}
