'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DiscardChangesDialog } from '@/components/discard-changes-dialog';
import { useCreateReminder } from '@/hooks/useReminders';
import type { Reminder } from '@/api';
import { useDiscardGuard, useGuardedClose, useOpeningKey } from '@/lib/discard-guard';

export type NewReminderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Told once the reminder exists, after the dialog has closed. */
  onCreated?: (reminder: Reminder) => void;
};

/** Keyed on the opening, as EventDialog is, so each one starts empty. */
export function NewReminderDialog(props: NewReminderDialogProps) {
  const opening = useOpeningKey(props.open);
  return <NewReminderForm key={opening} {...props} />;
}

function NewReminderForm({ open, onOpenChange, onCreated }: NewReminderDialogProps) {
  const create = useCreateReminder();
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const { dirty } = useDiscardGuard({ title, when }, open);
  const guard = useGuardedClose(dirty, onOpenChange);
  const close = guard.close;
  // Refused here, as on the phone: a reminder for a time already gone was
  // saved and then never went off. Judged when the time is picked and again
  // on save, since a form left open can pass the time it holds.
  const [inPast, setInPast] = useState(false);
  const isPast = (value: string) => !!value && new Date(value).getTime() <= Date.now();

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New reminder</DialogTitle>
          <DialogDescription>
            At this time you get an alert here, and a push on your phone if you
            use the Virgo app.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="reminder-title">Title</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Send the Reyes gallery"
              autoFocus
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reminder-when">When</Label>
            <Input
              id="reminder-when"
              type="datetime-local"
              value={when}
              onChange={(e) => {
                setWhen(e.target.value);
                setInPast(isPast(e.target.value));
              }}
              aria-invalid={inPast || undefined}
            />
            {inPast && (
              <p className="text-xs text-destructive">
                That time has passed. Pick a later one.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || !when || inPast || create.isPending}
            onClick={() => {
              if (isPast(when)) {
                setInPast(true);
                return;
              }
              create.mutate(
                {
                  title: title.trim(),
                  // datetime-local has no zone; the Date constructor reads it
                  // as local time, which is what the user meant.
                  reminder_time: new Date(when).toISOString(),
                  is_alarm_enabled: true,
                },
                {
                  onSuccess: (reminder) => {
                    onOpenChange(false);
                    onCreated?.(reminder);
                  },
                  onError: (err: Error) =>
                    toast.error('Could not create reminder', { description: err.message }),
                },
              );
            }}
          >
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            Create reminder
          </Button>
        </DialogFooter>
      </DialogContent>
      <DiscardChangesDialog guard={guard} />
    </Dialog>
  );
}
