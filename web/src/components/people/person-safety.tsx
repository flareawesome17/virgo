'use client';

import { useState, type ReactNode } from 'react';
import { Ban, Ellipsis, Flag, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { useBlockPerson, useReportPerson, useUnblock } from '@/hooks/useBlocks';
import { firstName } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import {
  ApiError,
  USER_REPORT_REASONS,
  type BlockedPerson,
  type PersonRef,
  type ReportSource,
  type UserReportReason,
} from '@/api';

const NOTE_LIMIT = 500;

/**
 * What a failed block, unblock or report says. The phone's words.
 *
 * Never the raw message. A 400 is the exception because its text is the API's
 * own copy for something the person did — "You cannot block yourself" — and
 * says more than a generic line could. Everything else is worded here, which
 * also covers an older API that has no /blocks at all: its 404 reads as the
 * person being gone rather than as "Cannot POST /blocks".
 */
export function safetyError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) return "You're offline. Try again when you're connected.";
    if (err.status === 429) return "You've done this a lot in a short time. Try again later.";
    if (err.status === 400) return err.message;
    if (err.status === 404) return "We couldn't find that person. They may have left Virgo.";
  }
  return 'Something went wrong. Please try again.';
}

/** Who an action is about, in whichever terms the screen has. */
export interface SafetySubject {
  name: string;
  /** What blocking and reporting take. Unblocking needs only `blockId`. */
  target?: PersonRef | null;
  /** Your block on them, when there is one. */
  blockId?: string | null;
  /** Which screen a report came from, where it is not the hook's own. */
  from?: ReportSource;
}

type Asking = 'block' | 'unblock' | 'report';

export type PersonSafety = ReturnType<typeof usePersonSafety>;

/**
 * Report, block and unblock, for whoever a screen hands it.
 *
 * One per screen, as on the phone, however many people the screen lists: each
 * action takes the person it is about, and the person is kept here from the
 * moment it is chosen, so the dialog that follows still knows who it is about
 * after the menu it came from has closed. `dialogs` has to be rendered for
 * anything to show.
 *
 * Neither a block nor a report tells the other person anything.
 */
export function usePersonSafety(
  source: ReportSource,
  {
    onBlocked,
    onUnblocked,
  }: {
    onBlocked?: (block: BlockedPerson, subject: SafetySubject) => void;
    onUnblocked?: (subject: SafetySubject) => void;
  } = {},
) {
  const block = useBlockPerson();
  const unblock = useUnblock();
  const report = useReportPerson();

  const [asking, setAsking] = useState<Asking | null>(null);
  // Kept after a dialog closes, so its words do not empty on the way out.
  const [subject, setSubject] = useState<SafetySubject | null>(null);
  const first = firstName(subject?.name ?? '');

  const ask = (what: Asking) => (person: SafetySubject) => {
    if (what === 'unblock' ? !person.blockId : !person.target) return;
    setSubject(person);
    setAsking(what);
  };

  const confirmBlock = () => {
    if (!subject?.target) return;
    const person = subject;
    block.mutate(person.target!, {
      onSuccess: (blocked) => {
        setAsking(null);
        toast.success('Blocked', {
          description: `${firstName(person.name)} is blocked. You can unblock them in Settings › Blocked people.`,
        });
        onBlocked?.(blocked, person);
      },
      onError: (err) => toast.error('Could not block', { description: safetyError(err) }),
    });
  };

  const confirmUnblock = () => {
    if (!subject?.blockId) return;
    const person = subject;
    unblock.mutate(person.blockId!, {
      onSuccess: () => {
        setAsking(null);
        toast.success(`${firstName(person.name)} is unblocked`);
        onUnblocked?.(person);
      },
      onError: (err) => toast.error('Could not unblock', { description: safetyError(err) }),
    });
  };

  const dialogs = (
    <>
      <AlertDialog
        open={asking === 'block' || asking === 'unblock'}
        onOpenChange={(open) => {
          if (!open && !block.isPending && !unblock.isPending) setAsking(null);
        }}
      >
        <AlertDialogContent>
          {asking === 'unblock' ? (
            <AlertDialogHeader>
              <AlertDialogTitle>Unblock {first}?</AlertDialogTitle>
              <AlertDialogDescription>
                They&apos;ll be able to find you and send you requests again. Your connection
                isn&apos;t restored — send a new request if you want to reconnect.
              </AlertDialogDescription>
            </AlertDialogHeader>
          ) : (
            <AlertDialogHeader>
              <AlertDialogTitle>Block {first}?</AlertDialogTitle>
              <AlertDialogDescription>
                They won&apos;t be able to message you, send you connection requests, enquiries or
                invitations, or apply to your jobs, and you won&apos;t see each other in search,
                Nearby or the job board. Anything between you that&apos;s still waiting for an
                answer — connection requests, enquiries, job applications and invitations — is
                closed. Your chat history stays, and in groups you share you&apos;ll both stay but
                won&apos;t be notified about each other. We won&apos;t tell them.
              </AlertDialogDescription>
            </AlertDialogHeader>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={block.isPending || unblock.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={block.isPending || unblock.isPending}
              variant={asking === 'unblock' ? 'default' : 'destructive'}
              onClick={(event) => {
                // Open until it settles, so a failure is seen.
                event.preventDefault();
                if (asking === 'unblock') confirmUnblock();
                else confirmBlock();
              }}
            >
              {(block.isPending || unblock.isPending) && <Loader2 className="size-4 animate-spin" />}
              {asking === 'unblock' ? 'Unblock' : 'Block'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={asking === 'report'}
        onOpenChange={(open) => {
          // Nothing closes it while a report is on its way: the result is what
          // decides what comes next.
          if (!open && !report.isPending) setAsking(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {/* Keyed on the opening, so every report starts with nothing chosen. */}
          <ReportForm
            key={`${subject?.name}|${asking === 'report'}`}
            first={first}
            pending={report.isPending}
            onSubmit={(reason, note, setError) => {
              const person = subject;
              if (!person?.target) return;
              report.mutate(
                { ref: person.target, reason, note, from: person.from ?? source },
                {
                  onSuccess: () => {
                    setAsking(null);
                    const name = firstName(person.name);
                    toast.success('Thanks for telling us', {
                      description: 'We’ll review it.',
                      // The offer the phone makes after a report, unless
                      // they are blocked already.
                      action: person.blockId
                        ? undefined
                        : { label: `Block ${name}`, onClick: () => ask('block')(person) },
                    });
                  },
                  onError: (err) => setError(safetyError(err)),
                },
              );
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );

  return {
    /** Opens the report form for this person. */
    report: ask('report'),
    /** Asks, then blocks. */
    block: ask('block'),
    /** Asks, then unblocks. */
    unblock: ask('unblock'),
    dialogs,
    pending: block.isPending || unblock.isPending,
  };
}

/** A reason, an optional note, and Send. A failure stays in the form. */
function ReportForm({
  first,
  pending,
  onSubmit,
}: {
  first: string;
  pending: boolean;
  onSubmit: (reason: UserReportReason, note: string, setError: (error: string) => void) => void;
}) {
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!reason || pending) return;
        setError('');
        onSubmit(reason, note, setError);
      }}
    >
      <DialogHeader>
        <DialogTitle>Report {first}</DialogTitle>
        <DialogDescription>Reports are private. They won&apos;t know it was you.</DialogDescription>
      </DialogHeader>

      <fieldset className="grid gap-1.5" disabled={pending}>
        <legend className="sr-only">Why are you reporting them?</legend>
        {USER_REPORT_REASONS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors hover:bg-accent/50',
              reason === option.value && 'border-primary bg-primary/5',
            )}
          >
            <input
              type="radio"
              name="report-reason"
              value={option.value}
              checked={reason === option.value}
              onChange={() => setReason(option.value)}
              className="size-4 accent-primary"
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="report-note" className="sr-only">
          Details
        </Label>
        <Textarea
          id="report-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add details (optional)"
          maxLength={NOTE_LIMIT}
          disabled={pending}
          rows={3}
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {note.length}/{NOTE_LIMIT}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!reason || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {pending ? 'Sending…' : 'Send report'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Report, and Block or Unblock, as items in a menu the screen already has. */
export function PersonSafetyItems({
  safety,
  subject,
}: {
  safety: PersonSafety;
  subject: SafetySubject;
}) {
  const first = firstName(subject.name);
  return (
    <>
      {subject.target && (
        <DropdownMenuItem onSelect={() => safety.report(subject)}>
          <Flag />
          Report {first}
        </DropdownMenuItem>
      )}
      {subject.blockId ? (
        <DropdownMenuItem onSelect={() => safety.unblock(subject)}>
          <Ban />
          Unblock {first}
        </DropdownMenuItem>
      ) : (
        subject.target && (
          <DropdownMenuItem variant="destructive" onSelect={() => safety.block(subject)}>
            <Ban />
            Block {first}
          </DropdownMenuItem>
        )
      )}
    </>
  );
}

/** A "…" of its own with the safety items, for a row that has no menu yet. */
export function PersonSafetyMenu({
  safety,
  subject,
  className,
  variant = 'ghost',
  children,
}: {
  safety: PersonSafety;
  subject: SafetySubject;
  className?: string;
  /** Outline beside other outline buttons, as on a profile. */
  variant?: 'ghost' | 'outline';
  /** Anything else the menu should offer, above the safety items. */
  children?: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={variant}
          size="icon"
          className={cn(variant === 'ghost' && 'size-8', 'shrink-0', className)}
          aria-label={`More for ${subject.name}`}
        >
          <Ellipsis className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {children}
        <PersonSafetyItems safety={safety} subject={subject} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
