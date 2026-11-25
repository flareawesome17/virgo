'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, CircleCheck, Clock, MessageCircle, Send, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JobApplicationStatus, JobPost, MyApplication } from '@/api';
import { useWithdrawApplication } from '@/hooks/useJobs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

/**
 * How an application reads once you have one.
 *
 * One definition for the board card, the post page and the applications list,
 * so the same status cannot be called "Waiting" in one place and "new" in
 * another — which is what happened when each screen formatted it inline.
 */
export const APPLICATION_STATE: Record<
  JobApplicationStatus,
  { label: string; icon: typeof Clock; tone: 'pending' | 'good' | 'gone' }
> = {
  new: { label: 'Applied', icon: Clock, tone: 'pending' },
  shortlisted: { label: 'Shortlisted', icon: Star, tone: 'pending' },
  accepted: { label: 'Accepted', icon: Check, tone: 'good' },
  declined: { label: 'Not selected', icon: X, tone: 'gone' },
};

/**
 * The same four as the foot of a board card says them: about you, in a
 * sentence, where the label above is a word beside a role. The phone's words.
 */
export const APPLICATION_STANDING: Record<
  JobApplicationStatus,
  { text: string; icon: typeof Clock; tone: 'plain' | 'good' | 'quiet' }
> = {
  new: { text: 'You applied', icon: Send, tone: 'plain' },
  shortlisted: { text: 'You are shortlisted', icon: CircleCheck, tone: 'good' },
  accepted: { text: 'You got it', icon: CircleCheck, tone: 'good' },
  declined: { text: 'Not selected', icon: X, tone: 'quiet' },
};

const TONE_CLASS = {
  pending: 'bg-muted text-muted-foreground',
  good: 'bg-success/15 text-success',
  gone: 'bg-muted text-muted-foreground line-through decoration-1',
} as const;

/** The compact form, beside a role. */
export function ApplicationBadge({ status }: { status: JobApplicationStatus }) {
  const state = APPLICATION_STATE[status];
  const Icon = state.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[state.tone]}`}
    >
      <Icon className="size-3" />
      {state.label}
    </span>
  );
}

/**
 * Where you stand on a post, in its Apply card — what replaces the form once
 * you have applied.
 *
 * Accepted is the only state with somewhere to go, and it must lead to the
 * conversation acceptance already created. That link is the whole point: it
 * used to exist for one render and then vanish.
 *
 * An application nobody has answered can be taken back from here. Applying
 * happens on the post's own page, so this is where you are when you realise
 * you picked the wrong role.
 */
export function ApplicationState({
  post,
  conversationId,
}: {
  post: JobPost;
  /** From the applications list; the post itself does not carry it. */
  conversationId?: string | null;
}) {
  const withdraw = useWithdrawApplication();
  /** The application the Withdraw confirmation is asking about. */
  const [withdrawing, setWithdrawing] = useState<MyApplication | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (post.myApplications.length === 0) return null;

  const isOpen = post.status === 'open';
  const as = (application: MyApplication | null) =>
    application?.role ? ` as ${application.role}` : '';

  const takeBack = (application: MyApplication) =>
    // mutateAsync, not per-call callbacks: those are dropped if the page is
    // left before the answer lands, and a failure would vanish.
    withdraw
      .mutateAsync(application.id)
      .then(() => toast.success('Application withdrawn'))
      .catch((e: Error) =>
        toast.error('Could not withdraw it', { description: e.message }),
      );

  // One row each. A post wanting three roles can hold three applications from
  // the same person, at three different statuses — being accepted as HMUA and
  // declined as videographer is one outcome, and collapsing it to a single
  // line would have to throw one of them away.
  return (
    <div className="flex flex-col gap-3.5">
      {post.myApplications.map((application) => {
        const state = APPLICATION_STATE[application.status];
        const Icon = state.icon;
        const unanswered =
          application.status === 'new' || application.status === 'shortlisted';
        // Drawn the moment Apply is pressed, before the server has answered:
        // until it does there is no application of that id to take back.
        const sending = application.id.startsWith('applying-');
        // "Applied as HMUA" says what you did; "Applied · HMUA" read as two
        // unrelated facts.
        const headline = unanswered
          ? `Applied${as(application)}${application.status === 'shortlisted' ? ' · shortlisted' : ''}`
          : application.role
            ? `${state.label} · ${application.role}`
            : state.label;
        return (
          <div key={application.id} className="flex items-start gap-3">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE_CLASS[state.tone]}`}
            >
              <Icon className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-semibold">{headline}</p>
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {application.status === 'new' &&
                  'They have your application. You will hear when they answer.'}
                {application.status === 'shortlisted' &&
                  'They are considering you. Nothing to do yet.'}
                {application.status === 'accepted' && 'You got the job.'}
                {application.status === 'declined' &&
                  'They went with someone else this time.'}
              </p>

              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {application.status === 'accepted' && conversationId ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/chat/${conversationId}`}>
                      <MessageCircle className="size-4" />
                      Open chat
                    </Link>
                  </Button>
                ) : (
                  <>
                    <Badge variant="outline" className="text-[11px]">
                      Applied {new Date(application.createdAt).toLocaleDateString()}
                    </Badge>
                    {/* Only while the post is open, as on the phone. Once it
                        has ended nobody is choosing any more, and "you can
                        apply again" would be untrue. */}
                    {unanswered && isOpen && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={withdraw.isPending || sending}
                        onClick={() => {
                          setWithdrawing(application);
                          setConfirming(true);
                        }}
                      >
                        {withdraw.isPending && withdraw.variables === application.id
                          ? 'Withdrawing…'
                          : 'Withdraw'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Withdraw your application?</AlertDialogTitle>
            <AlertDialogDescription>
              {post.postedBy.displayName} will no longer see you{as(withdrawing)}.
              You can apply again while it is open.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => withdrawing && takeBack(withdrawing)}
            >
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
