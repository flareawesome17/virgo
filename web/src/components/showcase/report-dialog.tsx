'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  SHOWCASE_REPORT_REASONS,
  showcaseReportsApi,
  type ShowcaseReportReason,
} from '@/api';
import { cn } from '@/lib/utils';
import { showcaseActionMessage } from './action-message';

/** Matches the server's limit on a report's note. */
const NOTE_LIMIT = 500;

/**
 * Reporting a post.
 *
 * The phone's report sheet: a reason, an optional note, and Send. Reporting
 * the post rather than the person is the point — "report this account" is
 * heavier than most situations warrant, and says nothing about which of their
 * posts is the problem. And the reasons are a post's: it can be somebody
 * else's work, or credited to the wrong person, which an account cannot be.
 *
 * A failure stays in the dialog, with the reason and the note still filled in,
 * so sending again is one click. Nothing closes it while a report is on its
 * way: the answer decides what comes next, and a dialog already gone has
 * nowhere to say it failed.
 */
export function ShowcaseReportDialog({
  showcaseId,
  onClose,
}: {
  /** The post being reported; null when the dialog is closed. */
  showcaseId: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ShowcaseReportReason | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Cleared as it opens rather than as it closes, so the dialog does not
  // visibly empty itself on its way out.
  const [shownFor, setShownFor] = useState(showcaseId);
  if (showcaseId !== shownFor) {
    setShownFor(showcaseId);
    if (showcaseId) {
      setReason(null);
      setNote('');
      setError(null);
    }
  }

  const report = useMutation({
    mutationFn: (input: { id: string; reason: ShowcaseReportReason; note: string }) =>
      showcaseReportsApi.report(input.id, input.reason, input.note.trim() || undefined),
  });

  const close = () => {
    if (!report.isPending) onClose();
  };

  const send = () => {
    if (!showcaseId || !reason) return;
    setError(null);
    report.mutate(
      { id: showcaseId, reason, note },
      {
        onSuccess: () => {
          onClose();
          toast.success("Thanks — we'll take a look.", {
            description: 'You will not hear back about it unless we need to ask you something.',
          });
        },
        onError: (err) => setError(showcaseActionMessage(err, 'report')),
      },
    );
  };

  return (
    <Dialog open={showcaseId !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report this post</DialogTitle>
          <DialogDescription>
            Somebody at Virgo reads every report. The person who posted it is not told who
            reported it.
          </DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label="Why" className="grid overflow-hidden rounded-lg border">
          {SHOWCASE_REPORT_REASONS.map((r, i) => {
            const checked = reason === r.value;
            return (
              <button
                key={r.value}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={report.isPending}
                onClick={() => setReason(r.value)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-60',
                  i > 0 && 'border-t',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'grid size-4 shrink-0 place-items-center rounded-full border-2',
                    checked ? 'border-primary' : 'border-muted-foreground/40',
                  )}
                >
                  {checked && <span className="size-2 rounded-full bg-primary" />}
                </span>
                <span className="font-medium">{r.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="showcase-report-note">Add details (optional)</Label>
          <Textarea
            id="showcase-report-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={NOTE_LIMIT}
            disabled={report.isPending}
            className="max-h-40"
          />
          <p className="text-right text-[11px] text-muted-foreground tabular-nums">
            {note.length}/{NOTE_LIMIT}
          </p>
        </div>

        {/* Always there, so a screen reader hears it when the message lands
            in it — a live region that has only just appeared has nothing
            earlier to have changed from. */}
        <p role="status" aria-live="polite" className="-mt-2 text-sm text-destructive empty:hidden">
          {error}
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={report.isPending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={!reason || report.isPending}>
            {report.isPending && <Loader2 className="animate-spin" />}
            {report.isPending ? 'Sending…' : 'Send report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
