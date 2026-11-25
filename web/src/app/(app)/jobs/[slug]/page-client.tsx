'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BriefcaseBusiness,
  ChevronRight,
  Ellipsis,
  Flag,
  MapPin,
  Share,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CARD, DateTile, SectionTitle } from '@/components/kit';
import {
  applicationFor,
  budgetLabel,
  isRoleFilled,
  openRolesOf,
  roleBudgetLabel,
  type ReportReason,
} from '@/api';
import { IS_DESKTOP } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { useJob, useMyApplications, useReportJob } from '@/hooks/useJobs';
import { PersonSafetyItems, usePersonSafety } from '@/components/people/person-safety';
import { ApplicationBadge } from '@/components/jobs/application-state';
import { ApplyCard } from '@/components/jobs/apply-card';
import { copyJobLink } from '@/components/jobs/copy-job-link';
import { CrewChatCard } from '@/components/jobs/crew-chat-card';
import { jobDay, jobDistance, jobWeekday, postedAgo } from '@/components/jobs/job-format';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Looks like a scam' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'not-a-job', label: 'Not a real job' },
];

/** One row of a card: the place, a role. */
const ROW = 'flex min-h-[52px] items-center gap-3 px-4';

/**
 * A job post, inside the app.
 *
 * Owns `/jobs/<slug>` on this host; the public copy of the same post lives at
 * the same path on virgo.ph, which the proxy sends to `/j/<slug>`. So one
 * address is both the link you share with a stranger and the screen a
 * signed-in reader gets natively — rather than the app throwing its own users
 * onto a marketing page in a new tab.
 *
 * Two columns: the post on the left, read in the order a decision is made
 * (when and what it pays, where, who they need, the brief), and applying on
 * the right, where it stays in sight. Applying was a second page.
 */
export default function JobPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const job = useJob(slug);
  const report = useReportJob();
  const [reported, setReported] = useState(false);
  // By post: it names the poster and carries no account id. Across a block
  // the post is gone, so blocking goes back, as on the phone.
  const safety = usePersonSafety('job', {
    onBlocked: () => {
      if (window.history.length > 1) router.back();
      else router.replace('/jobs');
    },
  });
  /*
   * The conversation, if acceptance already opened one.
   *
   * The post itself does not carry it — only an application does — so this
   * joins the two by postId. Cheap: the applications list is already in the
   * cache from the Jobs screen, and it is a short list by definition.
   */
  const { applications } = useMyApplications();
  const conversationId =
    applications.find((a) => a.postSlug === slug)?.conversationId ?? null;

  if (job.isLoading) return <Screen title="Job"><CenteredSpinner /></Screen>;

  if (job.isError || !job.data) {
    return (
      <Screen title="Job">
        <EmptyState
          icon={BriefcaseBusiness}
          title="Job not found"
          // Filled and closed posts still open, saying so; what does not open
          // is one that has ended or been taken down.
          description="This post has ended or been taken down."
          action={<Button onClick={() => router.push('/jobs')}>Browse jobs</Button>}
        />
      </Screen>
    );
  }

  const post = job.data;
  const budget = budgetLabel(post.budgetMin, post.budgetMax);
  const isOpen = post.status === 'open';
  const openRoles = openRolesOf(post);
  const when = post.eventDate ? jobDay(post.eventDate) : null;
  const weekday = post.eventDate ? jobWeekday(post.eventDate) : null;
  const distance = jobDistance(post);

  const share = () => copyJobLink(post.slug);

  const flag = (reason: ReportReason) => {
    report.mutate(
      { postId: post.id, reason },
      {
        onSuccess: () => {
          setReported(true);
          toast.success('Thanks', { description: 'We will take a look at it.' });
        },
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  return (
    <Screen title={post.title}>
      {/* Where the post sits, in the shell's bar. On a phone-sized window
          there is room for its title alone, and an arrow back. */}
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-2">
            {/* The desktop title bar already has back and forward. */}
            {!IS_DESKTOP && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-ml-2 shrink-0 sm:hidden"
                aria-label="Back"
                onClick={() => {
                  if (window.history.length > 1) router.back();
                  else router.push('/jobs');
                }}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            <Link
              href="/jobs"
              className="hidden shrink-0 font-medium text-muted-foreground hover:text-foreground sm:inline"
            >
              Jobs
            </Link>
            <ChevronRight className="hidden size-3.5 shrink-0 text-muted-foreground/70 sm:block" aria-hidden />
            <span className="truncate">{post.title}</span>
          </span>
        }
      />

      <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-6 sm:px-6">
        <div className="flex flex-wrap items-start gap-8">
          {/* Capped, so the post does not stretch across the page when there is
              no card beside it: a post that has ended, for somebody who never
              applied. */}
          <div className="flex min-w-0 max-w-[832px] flex-[2_1_480px] flex-col gap-6">
            {!isOpen && (
              <div className="rounded-[14px] border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
                {post.status === 'filled'
                  ? 'This job has been filled.'
                  : post.status === 'expired'
                    ? 'This job has ended.'
                    : 'This post is closed.'}{' '}
                <Link href="/jobs" className="font-semibold underline">
                  See what else is open
                </Link>
              </div>
            )}

            <div className="flex flex-wrap items-start gap-3">
              <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
                <h1 className="text-2xl font-bold leading-[30px] tracking-[-0.025em]">{post.title}</h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <Avatar className="size-6">
                    <AvatarImage src={post.postedBy.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-[9px] font-bold">
                      {post.postedBy.displayName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {/* Their profile, natively, not the marketing page. */}
                  {post.postedBy.handle ? (
                    <Link href={`/u/${post.postedBy.handle}`} className="font-semibold hover:underline">
                      {post.postedBy.displayName}
                    </Link>
                  ) : (
                    <span className="font-semibold">{post.postedBy.displayName}</span>
                  )}
                  <span className="text-muted-foreground">
                    · Posted {postedAgo(post.createdAt)} ·{' '}
                    {post.applicantCount === 0 ? 'No applications yet' : `${post.applicantCount} applied`}
                  </span>
                </div>
              </div>
              <Button
                variant="secondary"
                className="h-9 rounded-[10px] pl-2.5 pr-3.5 font-semibold"
                onClick={share}
              >
                <Share />
                Share
              </Button>
              {/* The post and the person behind it are reported apart: what is
                  wrong with one post is not always wrong with its poster. */}
              {!post.isMine && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="size-9 rounded-[10px]"
                      aria-label="More for this post"
                    >
                      <Ellipsis className="size-[18px]" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-52">
                    <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Flag className="size-3.5" />
                      {reported ? 'Post reported' : 'Report this post'}
                    </DropdownMenuLabel>
                    {REPORT_REASONS.map((r) => (
                      <DropdownMenuItem
                        key={r.value}
                        disabled={reported || report.isPending}
                        onSelect={() => flag(r.value)}
                      >
                        {r.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <PersonSafetyItems
                      safety={safety}
                      subject={{ name: post.postedBy.displayName, target: { jobPostId: post.id } }}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* When, what it pays, where: the three things a decision needs,
                in the order they are weighed. */}
            <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
              <div className="flex items-center gap-4 p-4">
                {when && <DateTile size="lg" top={when.month} day={when.day} />}
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      'text-[22px] font-bold leading-7 tracking-[-0.02em] tabular-nums',
                      !budget && 'text-muted-foreground',
                    )}
                  >
                    <span className="sr-only">Budget: </span>
                    {budget ?? 'Open to offers'}
                  </span>
                  <span className="text-sm text-secondary-foreground">
                    <span className="sr-only">Date: </span>
                    {weekday ?? 'Flexible date'}
                  </span>
                </div>
              </div>
              <div className={cn(ROW, 'border-t border-border/40 py-2')}>
                <MapPin aria-hidden className="size-[18px] shrink-0 text-secondary-foreground" />
                <span className="min-w-0 flex-1 text-sm font-semibold">
                  <span className="sr-only">Where: </span>
                  {post.location ?? 'Place not specified'}
                </span>
                {distance && <span className="shrink-0 text-[13px] text-muted-foreground">{distance}</span>}
              </div>
            </div>

            {/*
              Each role with what it pays, rather than a row of bare chips
              above one range for the whole post. A photographer reading
              "₱2,000 – ₱15,000" on a post that also wants a videographer
              learns nothing about what *they* would be paid.
            */}
            {post.rolesWanted.length > 0 && (
              <section>
                <SectionTitle>Who they need</SectionTitle>
                <div className={cn(CARD, 'flex flex-col overflow-hidden')}>
                  {post.rolesWanted.map((role, i) => {
                    const rate = roleBudgetLabel(post.roleBudgets, role);
                    // Three things a post with several roles has to answer
                    // before anyone can decide anything: what each pays,
                    // which are gone, and which of them you have already
                    // taken a shot at.
                    const mine = applicationFor(post, role);
                    const filled = isRoleFilled(post, role);
                    return (
                      <div key={role} className={cn(ROW, i > 0 && 'border-t border-border/40')}>
                        <span
                          className={cn(
                            'min-w-0 flex-1 truncate text-sm font-semibold',
                            filled && 'text-muted-foreground line-through',
                          )}
                        >
                          {role}
                        </span>
                        {mine && <ApplicationBadge status={mine.status} />}
                        <span
                          className={cn(
                            'shrink-0 text-sm tabular-nums',
                            filled || !rate ? 'font-medium text-muted-foreground' : 'font-semibold',
                          )}
                        >
                          {filled ? 'Filled' : (rate ?? 'Rate not stated')}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {/* Said once, under the rows, because "every one of these is
                    gone" is not a thing anybody should have to work out by
                    reading five rows. */}
                {openRoles.length === 0 && (
                  <p className="mx-1 mt-2 text-[13px] leading-[18px] text-muted-foreground">
                    All roles on this job are now closed.
                  </p>
                )}
              </section>
            )}

            <section>
              <SectionTitle>About the job</SectionTitle>
              <p className="max-w-[64ch] whitespace-pre-line text-[15px] leading-6 text-secondary-foreground">
                {post.description}
              </p>
            </section>

            {/* One group for the poster and everyone hired (board 137). */}
            <CrewChatCard post={post} />
          </div>

          <ApplyCard post={post} conversationId={conversationId} />
        </div>
      </div>
      {safety.dialogs}
    </Screen>
  );
}
