'use client';

/* eslint-disable @next/next/no-img-element -- signed thumbnails, already small, as in the album grid */

import type { ReactNode } from 'react';
import { Briefcase, ClipboardCheck, GalleryVerticalEnd, Play, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useBookings } from '@/hooks/useBookings';
import { useMyJobs } from '@/hooks/useJobs';
import { useMyShowcases } from '@/hooks/useShowcases';
import { useMoneyPackages, useMoneyPayMethods } from '@/hooks/useMoney';
import { useSendPayCard } from '@/hooks/usePayCards';
import { cardProblem } from '@/components/chat/chat-errors';
import { jobStatusWord } from '@/components/chat/cards/job-post-card';
import {
  formatMoney,
  payMethodName,
  planDayLabel,
  showcaseStatus,
  type JobPost,
} from '@/api';
import {
  PickerEmpty,
  PickerFailed,
  PickerLoading,
  PickRow,
  RowIcon,
  audienceName,
  capitalise,
  type Audience,
  type CardSender,
} from '@/components/chat/share/shared';

export type ListPickerKind = 'booking' | 'job-post' | 'post' | 'package' | 'pay';

const TITLE: Record<ListPickerKind, string> = {
  booking: 'Share a booking',
  'job-post': 'Share a job post',
  post: 'Share a post',
  package: 'Share a package',
  pay: 'How to pay you',
};

function likes(n: number): string {
  return `${n} like${n === 1 ? '' : 's'}`;
}

/**
 * One of the + menu's lists: choosing a row sends it as a card. Only mounted
 * while open, so nothing is fetched for a list nobody opened.
 */
export function ListPickerDialog({
  kind,
  open,
  onOpenChange,
  conversationId,
  audience,
  sender,
  onSent,
}: {
  kind: ListPickerKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  audience: Audience;
  sender: CardSender;
  onSent: () => void;
}) {
  const who = audienceName(audience);
  const description: Record<ListPickerKind, string> = {
    booking: `Choose one to send. Only the two people on a booking can open it.`,
    'job-post': `Choose one of your job posts to send to ${who}.`,
    post: `Choose one of your posts that is up.`,
    package: 'Sending a package shares its statement.',
    pay: `${capitalise(who)} sees its name, number and QR. Virgo never holds the money.`,
  };
  const done = () => {
    onOpenChange(false);
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLE[kind]}</DialogTitle>
          <DialogDescription>{description[kind]}</DialogDescription>
        </DialogHeader>
        {kind === 'booking' && <BookingList sender={sender} done={done} />}
        {kind === 'job-post' && <JobPostList sender={sender} done={done} />}
        {kind === 'post' && <PostList sender={sender} done={done} />}
        {kind === 'package' && <PackageList sender={sender} done={done} />}
        {kind === 'pay' && <PayMethodList conversationId={conversationId} done={done} />}
      </DialogContent>
    </Dialog>
  );
}

function Rows({ children }: { children: ReactNode }) {
  return <ul className="-mx-2 flex max-h-[min(60vh,28rem)] flex-col gap-0.5 overflow-y-auto">{children}</ul>;
}

function BookingList({ sender, done }: { sender: CardSender; done: () => void }) {
  const { bookings, isLoading, loadFailed, refetch } = useBookings();
  if (isLoading && bookings.length === 0) return <PickerLoading />;
  if (loadFailed && bookings.length === 0) {
    return <PickerFailed what="your bookings" onRetry={() => void refetch()} />;
  }
  if (bookings.length === 0) {
    return (
      <PickerEmpty href="/jobs?tab=bookings" action="Open bookings">
        No bookings yet. When you hire someone or get hired, the booking shows here.
      </PickerEmpty>
    );
  }
  return (
    <Rows>
      {bookings.map((b) => {
        const sig = `booking:${b.id}`;
        const state = b.cancelledAt ? 'Cancelled' : b.confirmed ? 'Agreed' : null;
        return (
          <PickRow
            key={b.id}
            leading={
              <RowIcon>
                <ClipboardCheck />
              </RowIcon>
            }
            title={[b.role, b.postTitle].filter(Boolean).join(' · ')}
            lines={[
              [planDayLabel(b.eventDate) ?? 'No date yet', b.location].filter(Boolean).join(' · '),
              [`With ${b.otherParty.displayName}`, state].filter(Boolean).join(' · '),
            ]}
            dim={!!b.cancelledAt}
            busy={sender.sending === sig}
            disabled={sender.pending}
            onPick={() => sender.sendCard(sig, { kind: 'booking', bookingId: b.id }, done)}
          />
        );
      })}
    </Rows>
  );
}

function jobLine(job: Pick<JobPost, 'eventDate' | 'location'>): string {
  return [planDayLabel(job.eventDate) ?? 'Date to be set', job.location].filter(Boolean).join(' · ');
}

function JobPostList({ sender, done }: { sender: CardSender; done: () => void }) {
  const { jobs, isLoading, loadFailed, refetch } = useMyJobs();
  if (isLoading && jobs.length === 0) return <PickerLoading />;
  if (loadFailed && jobs.length === 0) {
    return <PickerFailed what="your job posts" onRetry={() => void refetch()} />;
  }
  if (jobs.length === 0) {
    return (
      <PickerEmpty href="/jobs/new" action="Post a job">
        You haven&apos;t posted a job yet.
      </PickerEmpty>
    );
  }
  return (
    <Rows>
      {jobs.map((job) => {
        const sig = `job:${job.id}`;
        const status = jobStatusWord(job);
        return (
          <PickRow
            key={job.id}
            leading={
              <RowIcon>
                <Briefcase />
              </RowIcon>
            }
            title={job.title}
            lines={[jobLine(job), job.rolesWanted.join(', ')]}
            dim={!!status}
            trailing={
              <span
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                  status ? 'bg-muted text-muted-foreground' : 'bg-success/15 text-success',
                )}
              >
                {status ?? 'Open'}
              </span>
            }
            busy={sender.sending === sig}
            disabled={sender.pending}
            onPick={() => sender.sendCard(sig, { kind: 'job-post', postId: job.id }, done)}
          />
        );
      })}
    </Rows>
  );
}

function PostList({ sender, done }: { sender: CardSender; done: () => void }) {
  const { showcases, isLoading, loadFailed, refetch } = useMyShowcases();
  if (isLoading && showcases.length === 0) return <PickerLoading />;
  if (loadFailed && showcases.length === 0) {
    return <PickerFailed what="your posts" onRetry={() => void refetch()} />;
  }
  // Only what is up: the server refuses a draft or a take-down.
  const live = showcases.filter((s) => showcaseStatus(s) === 'live');
  if (live.length === 0) {
    return (
      <PickerEmpty href="/showcase/new" action="Make a post">
        {showcases.length === 0
          ? "You haven't posted anything yet."
          : 'None of your posts is up right now. Drafts and posts you took down stay private.'}
      </PickerEmpty>
    );
  }
  return (
    <Rows>
      {live.map((s) => {
        const sig = `post:${s.id}`;
        const first = s.pieces[0];
        return (
          <PickRow
            key={s.id}
            leading={
              <span className="relative block h-12 w-10 overflow-hidden rounded-md bg-muted">
                {first?.url ? (
                  <img src={first.url} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <GalleryVerticalEnd className="size-4" aria-hidden />
                  </span>
                )}
                {first?.kind === 'video' && (
                  <span className="absolute bottom-0.5 left-0.5 grid size-4 place-items-center rounded bg-black/65 text-white">
                    <Play className="size-2.5 fill-current" aria-hidden />
                  </span>
                )}
              </span>
            }
            title={s.title?.trim() || 'Untitled post'}
            lines={[
              [first?.kind === 'video' ? 'Film' : `${s.pieces.length} photo${s.pieces.length === 1 ? '' : 's'}`, likes(s.likeCount)].join(' · '),
            ]}
            busy={sender.sending === sig}
            disabled={sender.pending}
            onPick={() => sender.sendCard(sig, { kind: 'post', showcaseId: s.id }, done)}
          />
        );
      })}
    </Rows>
  );
}

function PackageList({ sender, done }: { sender: CardSender; done: () => void }) {
  const { packages, isLoading, loadFailed, refetch } = useMoneyPackages('all');
  if (isLoading && packages.length === 0) return <PickerLoading />;
  if (loadFailed && packages.length === 0) {
    return <PickerFailed what="your packages" onRetry={() => void refetch()} />;
  }
  if (packages.length === 0) {
    return (
      <PickerEmpty href="/money" action="Open Money">
        No packages yet. Make one in Money to keep track of what a client has paid.
      </PickerEmpty>
    );
  }
  return (
    <Rows>
      {packages.map((p) => {
        const sig = `package:${p.id}`;
        return (
          <PickRow
            key={p.id}
            leading={
              <RowIcon>
                <Receipt />
              </RowIcon>
            }
            title={p.title}
            lines={[
              p.paidInFull
                ? `Paid in full · ${formatMoney(p.totalMinor)}`
                : `Paid ${formatMoney(p.receivedMinor)} · Left ${formatMoney(p.balanceMinor)}`,
              p.clientName,
            ]}
            busy={sender.sending === sig}
            disabled={sender.pending}
            onPick={() => sender.sendCard(sig, { kind: 'package', packageId: p.id }, done)}
          />
        );
      })}
    </Rows>
  );
}

/**
 * Your ways to pay; choosing one sends it as a pay card. Web had no way to
 * send one before this: the phone's PaySendSheet, as a list.
 */
function PayMethodList({ conversationId, done }: { conversationId: string; done: () => void }) {
  const { payMethods, isLoading, loadFailed, refetch } = useMoneyPayMethods();
  const send = useSendPayCard();
  if (isLoading && payMethods.length === 0) return <PickerLoading />;
  if (loadFailed && payMethods.length === 0) {
    return <PickerFailed what="your ways to pay" onRetry={() => void refetch()} />;
  }
  if (payMethods.length === 0) {
    return (
      <PickerEmpty href="/money/pay-methods" action="Add a way to pay">
        You haven&apos;t added a way to get paid yet.
      </PickerEmpty>
    );
  }
  return (
    <Rows>
      {payMethods.map((m, i) => (
        <PickRow
          key={m.id}
          leading={
            <RowIcon>
              <Wallet />
            </RowIcon>
          }
          title={payMethodName(m)}
          lines={[m.accountName, m.accountNumber]}
          trailing={
            // The list comes main first.
            i === 0 && payMethods.length > 1 ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                Main
              </span>
            ) : undefined
          }
          busy={send.isPending && send.variables?.payMethodId === m.id}
          disabled={send.isPending}
          onPick={() =>
            send.mutate(
              { conversationId, payMethodId: m.id },
              {
                onSuccess: done,
                onError: (err) =>
                  toast.error('Could not send it', { description: cardProblem(err, 'pay-card') }),
              },
            )
          }
        />
      ))}
    </Rows>
  );
}
