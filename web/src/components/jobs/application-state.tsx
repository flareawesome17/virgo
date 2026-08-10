'use client';

import Link from 'next/link';
import { Check, Clock, MessageCircle, Star, X } from 'lucide-react';
import type { JobApplicationStatus, JobPost } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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

const TONE_CLASS = {
  pending: 'bg-muted text-muted-foreground',
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  gone: 'bg-muted text-muted-foreground line-through decoration-1',
} as const;

/** The compact form, for a board card. */
export function ApplicationBadge({ status }: { status: JobApplicationStatus }) {
  const state = APPLICATION_STATE[status];
  const Icon = state.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[state.tone]}`}
    >
      <Icon className="size-3" />
      {state.label}
    </span>
  );
}

/**
 * The action row on a post page — what replaces Apply once you have applied.
 *
 * Accepted is the only state with somewhere to go, and it must lead to the
 * conversation acceptance already created. That link is the whole point: it
 * used to exist for one render and then vanish.
 */
export function ApplicationState({
  post,
  conversationId,
}: {
  post: JobPost;
  /** From the applications list; the post itself does not carry it. */
  conversationId?: string | null;
}) {
  if (post.myApplications.length === 0) return null;

  // One row each. A post wanting three roles can hold three applications from
  // the same person, at three different statuses — being accepted as HMUA and
  // declined as videographer is one outcome, and collapsing it to a single
  // line would have to throw one of them away.
  return (
    <div className="space-y-3 border-t pt-5">
      {post.myApplications.map((application) => {
        const state = APPLICATION_STATE[application.status];
        const Icon = state.icon;
        return (
          <div
            key={application.id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE_CLASS[state.tone]}`}
              >
                <Icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-medium">
                  {application.role
                    ? `${state.label} · ${application.role}`
                    : state.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {application.status === 'new' &&
                    'They have your application. You will hear when they answer.'}
                  {application.status === 'shortlisted' &&
                    'They are considering you. Nothing to do yet.'}
                  {application.status === 'accepted' && 'You got the job.'}
                  {application.status === 'declined' &&
                    'They went with someone else this time.'}
                </p>
              </div>
            </div>

            {application.status === 'accepted' && conversationId ? (
              <Button asChild variant="outline">
                <Link href={`/chat/${conversationId}`}>
                  <MessageCircle className="size-4" />
                  Open chat
                </Link>
              </Button>
            ) : (
              <Badge variant="outline" className="text-[11px]">
                Applied {new Date(application.createdAt).toLocaleDateString()}
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
