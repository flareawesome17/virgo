'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DatePickerField } from '@/components/date-picker-field';
import { PLAN_TYPES, PLAN_TYPE_LABEL, todayIso, type PlanType } from '@/api';
import {
  audienceName,
  firstName,
  namesList,
  type Audience,
  type CardSender,
} from '@/components/chat/share/shared';

/** The API's limits, so a field never takes more than will be kept. */
const MAX_TITLE = 200;
const MAX_PLACE = 120;

/**
 * Plan a date (board ChatPlanDate): it goes on your Schedule, and the chat
 * gets a card each person answers with Going or Can't go.
 */
export function PlanDateDialog({
  open,
  onOpenChange,
  audience,
  sender,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audience: Audience;
  sender: CardSender;
  onSent: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-md">
        <PlanDateForm
          audience={audience}
          sender={sender}
          done={() => {
            onOpenChange(false);
            onSent();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PlanDateForm({
  audience,
  sender,
  done,
}: {
  audience: Audience;
  sender: CardSender;
  done: () => void;
}) {
  const [type, setType] = useState<PlanType>('meeting');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [place, setPlace] = useState('');
  const [invite, setInvite] = useState(true);
  // Made once: today does not change while the form is open.
  const [today] = useState(() => todayIso());
  const kinds = useRef<(HTMLButtonElement | null)[]>([]);

  const names = audience.others.map((p) => firstName(p.name));
  const inviteLabel = audience.isGroup ? 'Invite everyone here' : `Invite ${names[0] ?? 'them'}`;
  // One card for the form as it stands, so sending it again after a lost
  // answer is stored once.
  const sig = `date:${type}:${title.trim()}:${date}:${time}:${place.trim()}:${invite}`;
  const sending = sender.sending === sig;

  const submit = () => {
    if (!date || sender.pending) return;
    sender.sendCard(
      sig,
      {
        kind: 'date-plan',
        type,
        title: title.trim(),
        date,
        ...(time ? { time } : {}),
        ...(place.trim() ? { place: place.trim() } : {}),
        inviteEveryone: audience.others.length > 0 && invite,
      },
      done,
    );
  };

  /** Arrow keys between the kinds, one Tab stop for the group: the radio pattern. */
  const onKindKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % PLAN_TYPES.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (index - 1 + PLAN_TYPES.length) % PLAN_TYPES.length;
    } else return;
    event.preventDefault();
    setType(PLAN_TYPES[next]);
    kinds.current[next]?.focus();
  };

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Plan a date</DialogTitle>
        <DialogDescription>
          It goes on your Schedule, and {audience.isGroup ? 'everyone here gets' : `${audienceName(audience)} gets`}{' '}
          an invite {audience.isGroup ? 'they answer' : 'to answer'} in the chat.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="plan-title">What</Label>
        <Input
          id="plan-title"
          value={title}
          maxLength={MAX_TITLE}
          autoFocus
          placeholder="e.g. Ocular at the venue"
          aria-describedby="plan-title-hint"
          onChange={(e) => setTitle(e.target.value)}
        />
        <p id="plan-title-hint" className="text-xs text-muted-foreground">
          Optional. Left empty, it&apos;s called “{PLAN_TYPE_LABEL[type]}”.
        </p>
      </div>

      <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-1.5">
        {PLAN_TYPES.map((kind, i) => {
          const on = type === kind;
          return (
            <button
              key={kind}
              ref={(el) => {
                kinds.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setType(kind)}
              onKeyDown={(event) => onKindKey(event, i)}
              className={cn(
                'h-8 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                on ? 'border-foreground bg-foreground text-background' : 'border-input hover:bg-accent',
              )}
            >
              {PLAN_TYPE_LABEL[kind]}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="plan-date">Date</Label>
          <DatePickerField id="plan-date" value={date} onChange={setDate} fromDate={today} clearable={false} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-time">
            Time <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <Input id="plan-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="plan-place">
            Place <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          {place.length > MAX_PLACE - 20 && (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {place.length}/{MAX_PLACE}
            </span>
          )}
        </div>
        <Input
          id="plan-place"
          value={place}
          maxLength={MAX_PLACE}
          placeholder="e.g. Sirao Garden, Cebu, or Video call"
          onChange={(e) => setPlace(e.target.value)}
        />
      </div>

      {audience.others.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <Label htmlFor="plan-invite" className="font-semibold">
              {inviteLabel}
            </Label>
            <p className="text-xs text-muted-foreground">
              {audience.isGroup ? namesList(names) : 'They answer Going or Can’t go in the chat.'}
              {audience.isGroup && ' · Only people you’re connected with get an invite.'}
            </p>
          </div>
          <Switch id="plan-invite" checked={invite} onCheckedChange={setInvite} />
        </div>
      )}

      <DialogFooter>
        <Button type="submit" disabled={!date || sender.pending} className="w-full sm:w-auto">
          {sending && <Loader2 className="size-4 animate-spin" />}
          Send, and add to my Schedule
        </Button>
      </DialogFooter>
    </form>
  );
}
