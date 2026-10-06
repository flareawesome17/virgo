'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';
import type { SupportTicket } from '@/api';
import { useRateTicket } from '@/hooks/useSupport';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const LABEL: Record<number, string> = {
  1: 'Very poor',
  2: 'Poor',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

/**
 * "How did we do?" under a resolved or closed request.
 *
 * Asked only then: mid-conversation a rating would score help that has not
 * finished. Once given it reads back as thanks, with a way to change it —
 * a later reply that reopens the ticket does not erase it.
 */
export function RateTicket({ ticket }: { ticket: SupportTicket }) {
  const rate = useRateTicket(ticket.id);
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  if (ticket.status !== 'resolved' && ticket.status !== 'closed') return null;

  if (ticket.rating && !editing) {
    return (
      <Card className="mt-5">
        <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4">
          <StarRow value={ticket.rating} />
          <p className="text-sm">
            Thanks — you rated this {ticket.rating} out of 5.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setStars(ticket.rating ?? 0);
              setComment(ticket.rating_comment ?? '');
              setEditing(true);
            }}
          >
            Change
          </Button>
          {ticket.rating_comment && (
            <p className="basis-full text-xs text-muted-foreground">
              “{ticket.rating_comment}”
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-5">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">How did we do?</p>
          <p className="text-xs text-muted-foreground">
            Your answer goes to the support team.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div role="radiogroup" aria-label="Your rating" className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={`${n} out of 5, ${LABEL[n].toLowerCase()}`}
                onClick={() => setStars(n)}
                className="rounded p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={cn(
                    'size-7',
                    n <= stars ? 'fill-primary text-primary' : 'text-muted-foreground/60',
                  )}
                />
              </button>
            ))}
          </div>
          {stars > 0 && <span className="text-sm text-muted-foreground">{LABEL[stars]}</span>}
        </div>
        {stars > 0 && (
          <Textarea
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Anything you'd like to add? (optional)"
            maxLength={1000}
          />
        )}
        {rate.isError && (
          <p role="alert" className="text-sm text-destructive">
            That did not send. Check your connection and try again.
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!stars || rate.isPending}
            onClick={() =>
              rate.mutate({ rating: stars, comment }, { onSuccess: () => setEditing(false) })
            }
          >
            {rate.isPending ? 'Sending…' : 'Send'}
          </Button>
          {editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StarRow({ value }: { value: number }) {
  return (
    <span className="flex" aria-label={`${value} out of 5`} role="img">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden
          className={cn('size-4', n <= value ? 'fill-primary text-primary' : 'text-muted-foreground/50')}
        />
      ))}
    </span>
  );
}
