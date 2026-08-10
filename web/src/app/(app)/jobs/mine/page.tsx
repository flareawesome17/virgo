'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Eye,
  Loader2,
  MessageCircle,
  Plus,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  APPLICATION_STATE,
  ApplicationBadge,
} from '@/components/jobs/application-state';
import { BookingCard } from '@/components/jobs/booking-card';
import { useBookings } from '@/hooks/useBookings';
import type { Booking } from '@/api';

/** The booking for one application, or undefined if there is none yet. */
const bookingFor = (bookings: Booking[], applicationId: string) =>
  bookings.find((b) => b.applicationId === applicationId);
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { budgetLabel, distanceLabel, type JobPost } from '@/api';
import {
  useApplicants,
  useDeleteJob,
  useJobs,
  useMarkJobsSeen,
  useMyApplications,
  useMyJobs,
  useRespondToApplication,
  usePendingApplicants,
  useSetJobStatus,
  useUnseenJobs,
} from '@/hooks/useJobs';
import { useRoles } from '@/hooks/useRoles';

const STATUS_LABEL: Record<JobPost['status'], string> = {
  open: 'Open',
  filled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
};

/** One post, with its applicants folded away until asked for. */
function JobRow({ job }: { job: JobPost }) {
  const [open, setOpen] = useState(false);
  const setStatus = useSetJobStatus();
  const remove = useDeleteJob();
  const pending = usePendingApplicants();
  const budget = budgetLabel(job.budgetMin, job.budgetMax);

  /**
   * Ending a post ends other people's applications.
   *
   * So the confirmation names how many, fetched at the moment of asking
   * rather than carried on every row. "Are you sure" does not tell somebody
   * they are about to decline four people.
   */
  const end = async (status: 'filled' | 'closed') => {
    let waiting = 0;
    try {
      waiting = (await pending.mutateAsync(job.id)).count;
    } catch {
      // If the count cannot be fetched, still ask — just without the number.
    }

    const verb = status === 'filled' ? 'Mark this filled' : 'Close this post';
    const consequence = waiting
      ? `

${waiting} ${waiting === 1 ? 'person is' : 'people are'} still waiting to hear back. They will be told the role is taken.`
      : '';
    if (!confirm(`${verb}?${consequence}`)) return;

    setStatus.mutate(
      { id: job.id, status },
      {
        onSuccess: () =>
          toast.success(
            status === 'filled' ? 'Marked as filled' : 'Post closed',
            waiting
              ? { description: `${waiting} pending ${waiting === 1 ? 'applicant was' : 'applicants were'} told.` }
              : undefined,
          ),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  };

  /**
   * Deleting is worse than ending, and used to ask less.
   *
   * Filling a post declines the people waiting; deleting it erases them —
   * every application at any status, and every booking made from one, by
   * cascade. That was a single click on an unlabelled bin sitting next to
   * "Mark filled", with no confirmation at all, and it took an accepted
   * applicant and the agreement with them out of the database.
   *
   * So it names what goes, and says the part that matters: the other person
   * loses their copy too. A post with nothing on it still asks — but briefly,
   * because there is nothing to weigh.
   */
  const destroy = async () => {
    let cost = { applications: 0, bookings: 0 };
    try {
      cost = await pending.mutateAsync(job.id);
    } catch {
      // If the counts cannot be fetched, still ask — just without them.
    }

    const losses = [
      cost.applications &&
        `${cost.applications} application${cost.applications === 1 ? '' : 's'}`,
      cost.bookings &&
        `${cost.bookings} booking${cost.bookings === 1 ? '' : 's'}`,
    ].filter(Boolean) as string[];

    const consequence = losses.length
      ? `

This also deletes ${losses.join(' and ')}, for good. The people involved lose their copy as well.`
      : `

This cannot be undone.`;

    if (!confirm(`Delete “${job.title}”?${consequence}`)) return;

    remove.mutate(job.id, {
      onSuccess: () => toast.success('Post deleted'),
      onError: (e: Error) => toast.error(e.message),
    });
  };

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{job.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[job.location, budget, `${job.applicantCount} applied`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <Badge variant={job.status === 'open' ? 'default' : 'secondary'}>
            {STATUS_LABEL[job.status]}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen((v) => !v)}
            disabled={job.applicantCount === 0}
          >
            <ChevronDown
              className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            {job.applicantCount === 0
              ? 'No applicants yet'
              : `${job.applicantCount} applicant${job.applicantCount === 1 ? '' : 's'}`}
            {/* The count alone cannot say whether any of them need you: nine
                applicants you have already answered look identical to nine
                you have not. */}
            {job.newApplicantCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
                {job.newApplicantCount} new
              </span>
            )}
          </Button>

          <Link
            href={`/jobs/${job.slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
          >
            <Eye className="size-3.5" />
            View post
          </Link>

          {job.status === 'open' ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={setStatus.isPending}
                onClick={() => end('filled')}
              >
                Mark filled
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                disabled={setStatus.isPending}
                onClick={() => end('closed')}
              >
                Close
              </Button>
            </>
          ) : (
            /* Reopening was never offered, so a misclicked "Mark filled" was
               irreversible from the UI even though the API allows it. */
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              disabled={setStatus.isPending || job.status === 'expired'}
              onClick={() =>
                setStatus.mutate(
                  { id: job.id, status: 'open' },
                  {
                    onSuccess: () => toast.success('Reopened'),
                    onError: (e: Error) => toast.error(e.message),
                  },
                )
              }
            >
              Reopen
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            aria-label="Delete this post"
            className="text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            onClick={destroy}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>

        {open && <Applicants postId={job.id} />}
      </CardContent>
    </Card>
  );
}

function Applicants({ postId }: { postId: string }) {
  const router = useRouter();
  // Same query key in both places, so this is one request, not two.
  const { bookings } = useBookings();
  const { applications, isLoading, loadFailed, refetch } = useApplicants(postId);
  const respond = useRespondToApplication();
  const [acting, setActing] = useState<string | null>(null);

  if (isLoading) return <ListSkeleton rows={2} />;
  if (loadFailed) {
    return <ErrorState message="Could not load the applicants." onRetry={() => refetch()} />;
  }

  const answer = (
    id: string,
    status: 'shortlisted' | 'accepted' | 'declined',
  ) => {
    setActing(id);
    respond.mutate(
      { id, status },
      {
        onSuccess: (result) => {
          if (status === 'accepted') {
            toast.success(`Connected with ${result.personName}`, {
              description: 'Open the chat to talk about the job.',
              action: result.conversationId
                ? {
                    label: 'Open chat',
                    onClick: () => router.push(`/chat/${result.conversationId}`),
                  }
                : undefined,
            });
          } else {
            toast.success(status === 'shortlisted' ? 'Shortlisted' : 'Declined');
          }
        },
        onError: (e: Error) => toast.error(e.message),
        onSettled: () => setActing(null),
      },
    );
  };

  return (
    <div className="space-y-2 border-t pt-3">
      {applications.map((app) => (
        <div key={app.id} className="rounded-lg border p-3">
          <div className="flex items-start gap-2.5">
            <Avatar className="size-8">
              <AvatarImage src={app.personAvatarUrl ?? undefined} alt="" />
              <AvatarFallback className="text-[11px]">
                {app.personName.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {app.personHandle ? (
                  <Link href={`/u/${app.personHandle}`} className="hover:underline">
                    {app.personName}
                  </Link>
                ) : (
                  app.personName
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {app.personRoles.join(', ') || 'No roles listed'}
              </p>
            </div>
            {/* What they applied for, which on a post wanting three roles is
                the first thing you need and used to be nowhere. */}
            {app.role && (
              <Badge variant="outline" className="shrink-0">
                {app.role}
              </Badge>
            )}
            {app.status !== 'new' && (
              <Badge variant={app.status === 'accepted' ? 'default' : 'secondary'}>
                {app.status}
              </Badge>
            )}
          </div>

          {/*
            Applications no longer carry a message. Older ones do, and those
            are still worth reading — so it renders when present and the
            portfolio link stands in its place when it is not. The work is
            better evidence than the paragraph was.
          */}
          {app.message ? (
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {app.message}
            </p>
          ) : app.personHandle ? (
            <Link
              href={`/u/${app.personHandle}`}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Eye className="size-3.5" />
              See their work
            </Link>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              They have not published a profile yet.
            </p>
          )}

          {app.status !== 'accepted' && app.status !== 'declined' && (
            <div className="mt-2.5 flex items-center gap-1.5">
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() => answer(app.id, 'accepted')}
              >
                {acting === app.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Accept
              </Button>
              {app.status !== 'shortlisted' && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={respond.isPending}
                  onClick={() => answer(app.id, 'shortlisted')}
                >
                  <Star className="size-4" />
                  Shortlist
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={respond.isPending}
                onClick={() => answer(app.id, 'declined')}
              >
                <X className="size-4" />
                Decline
              </Button>
            </div>
          )}

          {app.status === 'accepted' && (
            <div className="mt-2.5 space-y-2.5">
              {/* The agreement. Without it "accepted" is a status and nothing
                  else — no role, no date, no rate either side can point at. */}
              {bookingFor(bookings, app.id) && (
                <BookingCard booking={bookingFor(bookings, app.id)!} />
              )}
              {app.conversationId && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/chat/${app.conversationId}`)}
                >
                  <MessageCircle className="size-4" />
                  Open chat
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The open board, inside the app shell.
 *
 * Not a link out to virgo.ph/jobs: that is the same list, but it renders in
 * the marketing layout, so clicking "browse" from the app dropped you out of
 * the sidebar and into what looks like a different product. The public page
 * exists for strangers and for search; signed-in people get it here.
 *
 * Cards link to the apply screen rather than the public post, because that is
 * the app's own full view of a job — title, budget, date, the whole brief, and
 * the form — and it does not leave the shell either.
 */
function BrowseJobs() {
  const [role, setRole] = useState<string | null>(null);
  const { roles: allRoles } = useRoles();
  const { jobs, total, isLoading, loadFailed, refetch } = useJobs({ roles: role ? [role] : [] });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setRole(null)}>
          <Badge variant={role ? 'outline' : 'default'} className="cursor-pointer px-3 py-1.5">
            All roles
          </Badge>
        </button>
        {allRoles.map((r) => (
          <button key={r} type="button" onClick={() => setRole(role === r ? null : r)}>
            <Badge
              variant={role === r ? 'default' : 'outline'}
              className="cursor-pointer px-3 py-1.5"
            >
              {r}
            </Badge>
          </button>
        ))}
      </div>

      {isLoading && jobs.length === 0 ? (
        <ListSkeleton rows={3} />
      ) : loadFailed && jobs.length === 0 ? (
        // An error is not an empty board. Saying "no open jobs" here would be
        // a confident claim about the world made from a failed request.
        <ErrorState message="Could not load the job board." onRetry={() => refetch()} />
      ) : jobs.length === 0 ? (
        <Card>
          <EmptyState
            icon={BriefcaseBusiness}
            title={role ? `Nothing open for a ${role.toLowerCase()}` : 'No open jobs right now'}
            description="Posts expire when the job does, so this list is always current. Check back, or post the job you need doing."
            action={
              <Button asChild>
                <Link href="/jobs/new">Post a job</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {total} open {total === 1 ? 'job' : 'jobs'}
          </p>
          <div className="grid gap-3">
            {jobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.slug}`}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="space-y-2.5">
                    <div className="flex items-start gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={job.postedBy.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[11px]">
                          {job.postedBy.displayName.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[15px] font-bold leading-snug">
                          {job.title}
                          {job.isMine && (
                            <Badge variant="outline" className="shrink-0 text-[10px]">
                              Your post
                            </Badge>
                          )}
                        </p>
                        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <span>
                            {job.postedBy.displayName}
                            {job.applicantCount > 0
                              ? ` · ${job.applicantCount} applied`
                              : ''}
                          </span>
                          {/* What makes a job feel takeable. Only when we
                              actually know — no filler when we do not. */}
                          {distanceLabel(job.distanceKm, job.location) && (
                            <span className="text-primary">
                              {distanceLabel(job.distanceKm, job.location)}
                            </span>
                          )}
                          {/* So a job you already applied to is obvious from
                              the list, not two taps away. */}
                          {job.myApplication && (
                            <ApplicationBadge status={job.myApplication.status} />
                          )}
                        </p>
                      </div>
                    </div>

                    <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {job.rolesWanted.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[11px]">
                          {r}
                        </Badge>
                      ))}
                      {job.location && (
                        <span className="text-xs text-muted-foreground">{job.location}</span>
                      )}
                      {budgetLabel(job.budgetMin, job.budgetMax) && (
                        <span className="text-xs font-semibold">
                          {budgetLabel(job.budgetMin, job.budgetMax)}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** What the caller has applied to. */
function MyApplications({ onBrowse }: { onBrowse: () => void }) {
  const { bookings } = useBookings();
  const router = useRouter();
  const { applications, isLoading, loadFailed, refetch } = useMyApplications();

  if (isLoading && applications.length === 0) return <ListSkeleton rows={2} />;

  if (loadFailed && applications.length === 0) {
    return <ErrorState message="Could not load your applications." onRetry={() => refetch()} />;
  }

  if (applications.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BriefcaseBusiness}
          title="You have not applied to anything yet"
          description="The board is public — browse what people are hiring for and apply in a couple of lines."
          action={
            <Button onClick={onBrowse}>Browse jobs</Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {applications.map((app) => (
        <Card key={app.id}>
          <CardContent className="space-y-2 pt-5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/jobs/${app.postSlug}`}
                  className="text-[15px] font-bold leading-snug hover:underline"
                >
                  {app.postTitle}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {/* Which role, since applying to a post that wanted three
                      of them was otherwise unrecorded on your own side. */}
                  {[
                    app.role,
                    `Applied ${new Date(app.createdAt).toLocaleDateString()}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Badge variant={app.status === 'accepted' ? 'default' : 'secondary'}>
                {app.status === 'new' ? 'Waiting' : app.status}
              </Badge>
            </div>

            {app.message && (
              <p className="whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
                {app.message}
              </p>
            )}

            {app.status === 'accepted' && (
              <div className="space-y-2.5">
                {bookingFor(bookings, app.id) && (
                  <BookingCard booking={bookingFor(bookings, app.id)!} />
                )}
                {app.conversationId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => router.push(`/chat/${app.conversationId}`)}
                  >
                    <MessageCircle className="size-4" />
                    Open chat
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * `useSearchParams` needs a Suspense boundary in the app router, or the whole
 * route opts into dynamic rendering.
 */
export default function MyJobsPage() {
  return (
    <Suspense fallback={null}>
      <MyJobs />
    </Suspense>
  );
}

const TABS = ['browse', 'posted', 'applications'] as const;

function MyJobs() {
  const { jobs, isLoading, loadFailed, refetch } = useMyJobs();
  const router = useRouter();
  const params = useSearchParams();

  /*
   * The tab lives in the URL.
   *
   * It was local state, which meant nothing could link to it: a "new
   * application" notification could only reach /jobs/mine, which opens on
   * Browse, so the poster landed on a list of other people's jobs. Same for
   * the applicant after being answered.
   */
  const requested = params.get('tab');
  const tab = TABS.includes(requested as (typeof TABS)[number])
    ? (requested as (typeof TABS)[number])
    : 'browse';
  const setTab = (next: string) =>
    // replace, not push: flipping tabs should not fill the back button with
    // the same screen four times.
    router.replace(next === 'browse' ? '/jobs/mine' : `/jobs/mine?tab=${next}`);

  /*
   * Looking at the board is what "seen" means.
   *
   * The phone has always done this; web never did, so the nav badge counted
   * up and stayed there — you could read every post on the board and still be
   * told there were nine you had not seen, which teaches people to ignore the
   * badge entirely.
   *
   * Tied to the browse tab rather than the page, because ?tab=posted is a real
   * way to arrive here and it does not show anybody the board. `mutate` is
   * stable, and the hook zeroes the cached count on success, so this settles
   * after one request and fires again only if new posts actually land while
   * the board is open — which is the correct moment to clear it again.
   */
  const { count: unseen } = useUnseenJobs();
  const { mutate: markJobsSeen } = useMarkJobsSeen();
  useEffect(() => {
    if (tab === 'browse' && unseen > 0) markJobsSeen();
  }, [tab, unseen, markJobsSeen]);

  return (
    <AppShell>
      <PageHeader
        title="Jobs"
        description="Find work, and manage what you have posted"
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus className="size-4" />
              Post a job
            </Link>
          </Button>
        }
      />

      {/*
        Browse first, deliberately.

        This screen is what the Jobs nav item opens, and it used to land on
        "Posted" — which for anyone who has never posted is an empty card and
        nothing to do. The board always has something in it, so it is the
        honest default and it matches where the phone's Jobs entry goes.
      */}
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="posted">Posted ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applied">My applications</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="mt-4">
          <BrowseJobs />
        </TabsContent>

        <TabsContent value="posted" className="mt-4">
          {isLoading && jobs.length === 0 ? (
            <ListSkeleton rows={2} />
          ) : loadFailed && jobs.length === 0 ? (
            <ErrorState message="Could not load your posts." onRetry={() => refetch()} />
          ) : jobs.length === 0 ? (
            <Card>
              <EmptyState
                icon={BriefcaseBusiness}
                title="You have not posted a job yet"
                description="Say what you need doing, when, and roughly what you are paying. It goes on the public board and the people who do that work can find it."
                action={
                  <Button asChild>
                    <Link href="/jobs/new">Post a job</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => (
                <JobRow key={job.id} job={job} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applied" className="mt-4">
          <MyApplications onBrowse={() => setTab('browse')} />
        </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
