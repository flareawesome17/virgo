'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { useAnswerEnquiry, useHireEnquiries } from '@/hooks/useHire';
import type { HireEnquiry } from '@/api';

/** "Sat 14 Nov" — a job date is a day, and the year is usually noise. */
function readableDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

function StatusBadge({ status }: { status: HireEnquiry['status'] }) {
  if (status === 'accepted') {
    return <Badge variant="secondary">Accepted</Badge>;
  }
  if (status === 'declined') {
    return <Badge variant="outline" className="text-muted-foreground">Declined</Badge>;
  }
  return <Badge>Waiting</Badge>;
}

function EnquiryCard({ enquiry }: { enquiry: HireEnquiry }) {
  const router = useRouter();
  const answer = useAnswerEnquiry();
  const [acting, setActing] = useState<'accept' | 'decline' | null>(null);

  const respond = (accept: boolean) => {
    setActing(accept ? 'accept' : 'decline');
    answer.mutate(
      { id: enquiry.id, accept },
      {
        onSuccess: (result) => {
          if (accept) {
            toast.success(`You are now connected with ${enquiry.personName}`, {
              description: 'Open the chat to talk about the job.',
              action: result.conversationId
                ? {
                    label: 'Open chat',
                    onClick: () => router.push(`/chat/${result.conversationId}`),
                  }
                : undefined,
            });
          } else {
            toast.success('Enquiry declined');
          }
        },
        onError: (error: Error) => toast.error(error.message),
        onSettled: () => setActing(null),
      },
    );
  };

  const isIncoming = enquiry.direction === 'received';
  const waiting = enquiry.status === 'new';

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          <Avatar className="size-10">
            <AvatarImage src={enquiry.personAvatarUrl ?? undefined} alt="" />
            <AvatarFallback>
              {enquiry.personName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            {/* The space is inside the string, not left to the margin: a
                margin positions the words but does not separate them, so
                copied text and screen readers both got "Cruzwants". */}
            <p className="truncate text-sm font-semibold">
              {enquiry.personName}
              <span className="font-normal text-muted-foreground">
                {isIncoming ? ' wants to hire you' : ' — your enquiry'}
              </span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {enquiry.roleWanted && (
                <span className="inline-flex items-center gap-1">
                  <BriefcaseBusiness className="size-3" />
                  {enquiry.roleWanted}
                </span>
              )}
              {enquiry.eventDate && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3" />
                  {readableDate(enquiry.eventDate)}
                </span>
              )}
              {enquiry.budget && (
                <span className="inline-flex items-center gap-1">
                  <Banknote className="size-3" />
                  {enquiry.budget}
                </span>
              )}
            </div>
          </div>

          <StatusBadge status={enquiry.status} />
        </div>

        <p className="whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
          {enquiry.message}
        </p>

        {isIncoming && waiting && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => respond(true)} disabled={answer.isPending}>
              {acting === 'accept' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => respond(false)}
              disabled={answer.isPending}
            >
              {acting === 'decline' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <X className="size-4" />
              )}
              Decline
            </Button>
            <p className="ml-auto hidden text-xs text-muted-foreground sm:block">
              Accepting connects you and opens a chat
            </p>
          </div>
        )}

        {enquiry.status === 'accepted' && enquiry.conversationId && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(`/chat/${enquiry.conversationId}`)}
          >
            <MessageCircle className="size-4" />
            Open chat
          </Button>
        )}

        {/* Declining is silent to the sender, so their own list is the only
            place it is ever reported. */}
        {!isIncoming && enquiry.status === 'new' && (
          <p className="text-xs text-muted-foreground">
            Waiting for {enquiry.personName.split(' ')[0]} to answer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Both inboxes: what was sent to you, then what you sent. */
export function EnquiriesTab() {
  const { received, sent, isLoading, loadFailed, refetch } = useHireEnquiries();

  if (isLoading && received.length === 0 && sent.length === 0) {
    return <ListSkeleton rows={2} />;
  }

  if (loadFailed && received.length === 0 && sent.length === 0) {
    return <ErrorState message="Could not load your enquiries." onRetry={() => refetch()} />;
  }

  if (received.length === 0 && sent.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BriefcaseBusiness}
          title="No enquiries yet"
          description="Publish your profile so people who find you on virgo.ph can send you work. Enquiries you send land here too."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {received.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sent to you
          </h3>
          {received.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </section>
      )}

      {sent.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            You sent
          </h3>
          {sent.map((enquiry) => (
            <EnquiryCard key={enquiry.id} enquiry={enquiry} />
          ))}
        </section>
      )}
    </div>
  );
}
