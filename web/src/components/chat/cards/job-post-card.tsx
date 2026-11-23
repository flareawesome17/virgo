'use client';

import { Briefcase } from 'lucide-react';
import { budgetRangeLabel, planDayLabel, type JobPostCardContext } from '@/api';
import { CardAction, CardKindLabel, GoneNote, cardShell, type CardEnv } from '@/components/chat/cards/card-parts';

type JobNow = NonNullable<JobPostCardContext['job']>;

/** What a post's status says once it is no longer open. Open says nothing. */
const STATUS_WORD: Record<string, string> = {
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

/** "Filled", "Closed", "Expired", or null while it is open. */
export function jobStatusWord(job: Pick<JobNow, 'status'>): string | null {
  return job.status === 'open' ? null : (STATUS_WORD[job.status] ?? 'Not open');
}

/** "Sat, Dec 13 · Tagaytay · Videographer, Editor". */
export function jobCardLine(job: JobNow): string {
  return [planDayLabel(job.eventDate), job.location, job.roles.join(', ')].filter(Boolean).join(' · ');
}

/**
 * A job post (board ChatCards): what it is, when and where, what it pays, and
 * whether it still takes applications.
 */
export function JobPostCard({ context, env }: { context: JobPostCardContext | null; env: CardEnv }) {
  const job = context?.job;
  if (!job) {
    return (
      <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 py-3')}>
        <CardKindLabel icon={Briefcase}>Job post</CardKindLabel>
        <GoneNote>This job post isn&apos;t available any more.</GoneNote>
      </div>
    );
  }

  const status = jobStatusWord(job);
  const budget = budgetRangeLabel(job.budgetMin, job.budgetMax);
  const line = jobCardLine(job);

  return (
    <div className={cardShell(env.mine, 'flex w-72 flex-col gap-1.5 px-3.5 pb-3.5 pt-3')}>
      <span className="flex items-center justify-between gap-2">
        <CardKindLabel icon={Briefcase}>Job post</CardKindLabel>
        {status && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {status}
          </span>
        )}
      </span>
      <p className="text-[15px] font-bold leading-snug">{job.title}</p>
      {line && <p className="text-sm text-muted-foreground">{line}</p>}
      {budget && <p className="text-sm font-bold">{budget}</p>}
      <CardAction href={`/jobs/${job.slug}`}>View job</CardAction>
    </div>
  );
}
