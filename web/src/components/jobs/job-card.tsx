'use client';

import Link from 'next/link';
import { Users } from 'lucide-react';
import { budgetLabel, headlineApplication, isRoleFilled, type JobPost } from '@/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CARD, DateTile } from '@/components/kit';
import { cn } from '@/lib/utils';
import { APPLICATION_STANDING } from './application-state';
import { isFreshJob, jobCountdown, jobDay, jobPlace, postedAgo } from './job-format';

const STANDING_TONE = {
  plain: 'text-secondary-foreground',
  good: 'text-success',
  quiet: 'text-muted-foreground',
} as const;

const initials = (name: string) => name.slice(0, 2).toUpperCase();

/**
 * The card's last line. Who is asking and how many applied, unless the card
 * is about you: then where you stand, or that the post is yours, so a job you
 * already applied to is obvious from the list and not two clicks away.
 */
function Foot({ job }: { job: JobPost }) {
  // The furthest any of your applications got: accepted for the HMUA slot is
  // what you want to see even if the videographer one was declined.
  const mine = headlineApplication(job);
  const applied = job.applicantCount > 0 ? `${job.applicantCount} applied` : null;
  const strip = 'flex min-h-11 items-center gap-2 border-t border-border/40 px-4 text-[13px]';
  const aside = 'min-w-0 flex-1 truncate text-right text-muted-foreground';

  if (job.isMine) {
    const waiting = job.newApplicantCount;
    return (
      <div className={strip}>
        <Users aria-hidden className="size-[15px] shrink-0 text-primary" />
        <span className="shrink-0 font-semibold text-primary">
          Your post ·{' '}
          {waiting > 0
            ? `${waiting} new ${waiting === 1 ? 'applicant' : 'applicants'}`
            : (applied ?? 'nobody has applied yet')}
        </span>
        <span className={aside}>Posted {postedAgo(job.createdAt)}</span>
      </div>
    );
  }

  if (mine) {
    const standing = APPLICATION_STANDING[mine.status];
    const Icon = standing.icon;
    return (
      <div className={strip}>
        <Icon aria-hidden className={cn('size-[15px] shrink-0', STANDING_TONE[standing.tone])} />
        <span className={cn('shrink-0 font-semibold', STANDING_TONE[standing.tone])}>{standing.text}</span>
        <span className={aside}>{[job.postedBy.displayName, applied].filter(Boolean).join(' · ')}</span>
      </div>
    );
  }

  return (
    <div className={strip}>
      <Avatar className="size-[22px]">
        <AvatarImage src={job.postedBy.avatarUrl ?? undefined} alt="" />
        <AvatarFallback className="text-[8px] font-bold">{initials(job.postedBy.displayName)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 truncate text-secondary-foreground">
        <span className="font-semibold">{job.postedBy.displayName}</span> · {postedAgo(job.createdAt)}
      </span>
      {applied && <span className="shrink-0 text-muted-foreground">{applied}</span>}
    </div>
  );
}

/**
 * One job on the board, read top to bottom the way somebody decides: when and
 * what, where, what it pays and how soon, who it wants, who is asking.
 *
 * The brief is not on the card. Two lines of it said little, and it is the
 * first thing on the job's own page; without it the pay is the loudest thing
 * on each card.
 */
export function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const when = job.eventDate ? jobDay(job.eventDate) : null;
  const countdown = job.eventDate ? jobCountdown(job.eventDate) : null;
  const where = jobPlace(job);
  const fresh = isFreshJob(job) && !job.isMine && !headlineApplication(job);

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className={cn(
        CARD,
        'flex flex-col overflow-hidden outline-none transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50',
      )}
    >
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {/* With no date set, the person who posted it stands in. */}
          {when ? (
            <DateTile top={when.month} day={when.day} />
          ) : (
            <Avatar className="size-11">
              <AvatarImage src={job.postedBy.avatarUrl ?? undefined} alt="" />
              <AvatarFallback className="text-xs">{initials(job.postedBy.displayName)}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-start gap-2">
              <h3 className="line-clamp-2 min-w-0 text-[15px] font-semibold leading-5">{job.title}</h3>
              {fresh && (
                <span role="img" aria-label="New" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
              )}
            </div>
            {where && <p className="truncate text-[13px] text-muted-foreground">{where}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2.5">
          <span
            className={cn(
              'text-xl font-bold leading-[26px] tracking-[-0.01em] tabular-nums',
              !budget && 'text-muted-foreground',
            )}
          >
            {budget ?? 'Pay not stated'}
          </span>
          <span
            className={cn(
              'text-[13px]',
              countdown?.soon ? 'font-semibold text-destructive' : 'text-muted-foreground',
            )}
          >
            {countdown ? countdown.text : job.eventDate ? '' : 'No date set'}
          </span>
        </div>

        {/* A filled role reads as struck through rather than disappearing: a
            post that wanted three people and has two left is a different
            thing from a post that only ever wanted one, and the card should
            not make those look identical. */}
        {job.rolesWanted.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {job.rolesWanted.map((role) => {
              const filled = isRoleFilled(job, role);
              return (
                <span
                  key={role}
                  className={cn(
                    'rounded-full bg-muted px-2.5 py-[3px] text-xs font-semibold',
                    filled ? 'text-muted-foreground line-through decoration-1' : 'text-secondary-foreground',
                  )}
                >
                  {role}
                  {filled && <span className="sr-only">, filled</span>}
                </span>
              );
            })}
          </div>
        )}
      </div>

      <Foot job={job} />
    </Link>
  );
}

/**
 * The one dark card: the open post that fits you best of those on the board.
 *
 * Picked from what the board already loaded, so it costs no request and can
 * only ever name a job that is also in the list's results.
 */
export function BestJobCard({ job, reason }: { job: JobPost; reason: string }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const when = job.eventDate ? jobDay(job.eventDate) : null;
  const countdown = job.eventDate ? jobCountdown(job.eventDate) : null;
  const line = [jobPlace(job), countdown?.text.toLowerCase()].filter(Boolean).join(' · ');

  return (
    // Drawn as a card with a button, pressed as one link: the whole card
    // opens the job, and a link inside a link is one too many for a reader.
    <Link
      href={`/jobs/${job.slug}`}
      className="flex flex-wrap items-center gap-5 rounded-[20px] bg-foreground px-6 py-5 text-background outline-none transition-opacity hover:opacity-95 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {when && <DateTile size="lg" inverted top={when.month} day={when.day} />}
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
        <span className="text-[13px] font-semibold text-background/70">{reason}</span>
        <h2 className="text-xl font-bold leading-[26px] tracking-[-0.02em]">{job.title}</h2>
        {line && <span className="text-sm text-background/70">{line}</span>}
      </div>
      <span className="text-[22px] font-bold tracking-[-0.02em] tabular-nums">{budget ?? 'Pay not stated'}</span>
      <span className="flex h-10 items-center rounded-[10px] bg-background px-4 text-sm font-semibold text-foreground">
        View job
      </span>
    </Link>
  );
}
