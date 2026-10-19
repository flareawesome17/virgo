'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Eye,
  Loader2,
  MessageCircle,
  Pencil,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { ApplicationBadge } from '@/components/jobs/application-state';
import { BookingsList } from '@/components/jobs/bookings-list';
import { BookingCard } from '@/components/jobs/booking-card';
import { useBookings } from '@/hooks/useBookings';
import type { Booking, JobApplication } from '@/api';

/** The booking for one application, or undefined if there is none yet. */
const bookingFor = (bookings: Booking[], applicationId: string) =>
  bookings.find((b) => b.applicationId === applicationId);
import { PageHeader, Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  budgetLabel,
  distanceLabel,
  headlineApplication,
  isRoleFilled,
  roleBudgetLabel,
  type JobPost,
} from '@/api';
import { cn } from '@/lib/utils';
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
  useWithdrawApplication,
} from '@/hooks/useJobs';
import { useRoles } from '@/hooks/useRoles';
import { PersonSafetyMenu, usePersonSafety } from '@/components/people/person-safety';

const STATUS_LABEL: Record<JobPost['status'], string> = {
  open: 'Open',
  filled: 'Filled',
  closed: 'Closed',
  // The phone's word, so the two clients do not call one post two things. A
  // post ends on its own once the job date passes; nothing lapsed.
  expired: 'Ended',
};

/** How long a Decline waits, with Undo, before it is sent and they are told. */
const DECLINE_UNDO_MS = 5000;

/**
 * One post, with its applicants folded away until asked for.
 *
 * `focused` is the post in the address (`?post=`), which is where "Manage
 * post" and a new application land. That used to open the Posted tab with
 * every row shut, leaving the poster to find the right one and unfold it.
 */
function JobRow({ job, focused }: { job: JobPost; focused: boolean }) {
  const [open, setOpen] = useState(focused && job.applicantCount > 0);
  const row = useRef<HTMLDivElement>(null);
  // Arriving at a different post while this list is already on screen opens
  // that one too. Adjusted during render rather than from an effect, which
  // would draw the row shut for a frame first.
  const [wasFocused, setWasFocused] = useState(focused);
  if (wasFocused !== focused) {
    setWasFocused(focused);
    if (focused && job.applicantCount > 0) setOpen(true);
  }
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focused]);
  const setStatus = useSetJobStatus();
  const remove = useDeleteJob();
  const pending = usePendingApplicants();
  const budget = budgetLabel(job.budgetMin, job.budgetMax);

  /*
   * Both questions below are asked in the app rather than through confirm():
   * the desktop app's webview is not guaranteed to draw a native one, and one
   * that answers no without asking leaves a button that does nothing. Each
   * keeps what it asked about after it closes, so its text does not empty out
   * while it fades.
   */
  const [ending, setEnding] = useState<{ status: 'filled' | 'closed'; waiting: number } | null>(
    null,
  );
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [losses, setLosses] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
    setEnding({ status, waiting });
    setConfirmingEnd(true);
  };

  const confirmEnd = () => {
    if (!ending) return;
    const { status, waiting } = ending;
    setStatus.mutate(
      { id: job.id, status },
      {
        onSuccess: () => {
          setConfirmingEnd(false);
          toast.success(
            status === 'filled' ? 'Marked as filled' : 'Post closed',
            waiting
              ? { description: `${waiting} pending ${waiting === 1 ? 'applicant was' : 'applicants were'} told.` }
              : undefined,
          );
        },
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

    setLosses(
      [
        cost.applications &&
          `${cost.applications} application${cost.applications === 1 ? '' : 's'}`,
        cost.bookings &&
          `${cost.bookings} booking${cost.bookings === 1 ? '' : 's'}`,
      ].filter(Boolean) as string[],
    );
    setConfirmingDelete(true);
  };

  const confirmDelete = () =>
    remove.mutate(job.id, {
      onSuccess: () => {
        setConfirmingDelete(false);
        toast.success('Post deleted');
      },
      onError: (e: Error) => toast.error(e.message),
    });

  return (
    // scroll-mt clears the sticky page header when ?post= scrolls here.
    <Card ref={row} className="scroll-mt-28">
      <CardContent className="space-y-3 pt-5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug">{job.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[job.location, budget, `${job.applicantCount} applied`]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {/*
              Which roles are still going, on the poster's own row.
              Accepting somebody closes their role, and without this the only
              way to know how much of your own post is still live is to open
              the applicants and work it out.
            */}
            {job.rolesWanted.length > 0 && (
              <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {job.rolesWanted.map((role) => {
                  const filled = isRoleFilled(job, role);
                  return (
                    <Badge
                      key={role}
                      variant={filled ? 'secondary' : 'outline'}
                      className={cn('text-[11px] font-normal', filled && 'opacity-60')}
                    >
                      {role} · {filled ? 'filled' : 'open'}
                    </Badge>
                  );
                })}
              </p>
            )}
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

          {/* Editing keeps the applications; deleting to fix a typo did not.
              Only while the post is open, as on the phone. */}
          {job.status === 'open' && (
            <Link
              href={`/jobs/new?edit=${job.slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <Pencil className="size-3.5" />
              Edit post
            </Link>
          )}

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

        {open && <Applicants job={job} />}
      </CardContent>

      <AlertDialog open={confirmingEnd} onOpenChange={setConfirmingEnd}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ending?.status === 'closed' ? 'Close this post?' : 'Mark this filled?'}
            </AlertDialogTitle>
            {/* Nothing to add when nobody is waiting, or the count could not
                be fetched: the question is the whole of it. */}
            {!!ending?.waiting && (
              <AlertDialogDescription>
                {ending.waiting} {ending.waiting === 1 ? 'person is' : 'people are'} still waiting
                to hear back. They will be told the role is taken.
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setStatus.isPending}>Keep it open</AlertDialogCancel>
            <AlertDialogAction
              disabled={setStatus.isPending}
              onClick={(event) => {
                // Open until it settles, so a failure is reported.
                event.preventDefault();
                confirmEnd();
              }}
            >
              {setStatus.isPending && <Loader2 className="size-4 animate-spin" />}
              {ending?.status === 'closed' ? 'Close post' : 'Mark filled'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{job.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {losses.length
                ? `This also deletes ${losses.join(' and ')}, for good. The people involved lose their copy as well.`
                : 'This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={(event) => {
                // Open until it settles, so a failure is reported.
                event.preventDefault();
                confirmDelete();
              }}
            >
              {remove.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Applicants({ job }: { job: JobPost }) {
  const router = useRouter();
  // Same query key in both places, so this is one request, not two.
  const { bookings } = useBookings();
  const { applications, isLoading, loadFailed, refetch } = useApplicants(job.id);
  const respond = useRespondToApplication();
  /*
   * mutateAsync, not per-call callbacks. A decline is sent seconds after the
   * click, and callbacks passed to `mutate` are dropped once this list
   * unmounts — collapse the row while one is in flight and a failure would
   * vanish without a word.
   */
  const { mutateAsync: answerAsync } = respond;
  const [acting, setActing] = useState<string | null>(null);
  // A block declines the application if it was still waiting, and the
  // refreshed list drops it.
  const safety = usePersonSafety('applicants');

  /*
   * Accepting asks first, and says what it is agreeing to. Accept made a
   * booking, a connection and a chat on one click, at a rate the poster may
   * not have looked at since writing the post.
   *
   * The applicant is kept after the dialog closes so its title does not empty
   * out while it fades.
   */
  const [hiring, setHiring] = useState<JobApplication | null>(null);
  const [confirmingHire, setConfirmingHire] = useState(false);

  /*
   * Declines wait, with Undo.
   *
   * A decline tells somebody they were not chosen, and it went on one click
   * — beside Accept — with no way back. Leaving the list (folding the row,
   * switching tabs) sends any still waiting rather than dropping them.
   */
  /** Declines on their way: still inside the Undo window, or already sent. */
  const [declining, setDeclining] = useState<Record<string, 'waiting' | 'sent'>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      // Sent now rather than lost.
      pending.forEach((timer, id) => {
        clearTimeout(timer);
        toast.dismiss(`decline-${id}`);
        answerAsync({ id, status: 'declined' }).catch((e: Error) =>
          toast.error('Could not decline them', { description: e.message }),
        );
      });
      pending.clear();
    };
  }, [answerAsync]);

  if (isLoading) return <ListSkeleton rows={2} />;
  if (loadFailed) {
    return <ErrorState message="Could not load the applicants." onRetry={() => refetch()} />;
  }

  const forget = (id: string) =>
    setDeclining((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });

  const answer = (
    app: JobApplication,
    status: 'shortlisted' | 'accepted' | 'declined',
  ) => {
    setActing(app.id);
    answerAsync({ id: app.id, status })
      .then((result) => {
        track('application_answered', { status });
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
        } else if (status === 'shortlisted') {
          toast.success('Shortlisted');
        }
        // A decline already said so, with its Undo. Its row stays in the
        // "declined" state until the refetch lands rather than flashing the
        // buttons back for a moment.
      })
      .catch((e: Error) => {
        // The server's own sentence. "Someone is already booked as HMUA on
        // this job. Cancel their booking first…" says what to do next.
        toast.error(`Could not answer ${app.personName}`, { description: e.message });
        forget(app.id);
      })
      .finally(() => setActing(null));
  };

  const undo = (id: string) => {
    const timer = timers.current.get(id);
    if (!timer) return; // Already sent.
    clearTimeout(timer);
    timers.current.delete(id);
    toast.dismiss(`decline-${id}`);
    forget(id);
  };

  const decline = (app: JobApplication) => {
    setDeclining((current) => ({ ...current, [app.id]: 'waiting' }));
    timers.current.set(
      app.id,
      setTimeout(() => {
        timers.current.delete(app.id);
        // The toast can outlive this timer — hovering one pauses it — and an
        // Undo that no longer undoes anything should not stay on screen.
        toast.dismiss(`decline-${app.id}`);
        setDeclining((current) => ({ ...current, [app.id]: 'sent' }));
        answer(app, 'declined');
      }, DECLINE_UNDO_MS),
    );
    toast(`Declined ${app.personName}.`, {
      id: `decline-${app.id}`,
      description: 'They will be told in a moment.',
      duration: DECLINE_UNDO_MS,
      action: { label: 'Undo', onClick: () => undo(app.id) },
    });
  };

  // What Accept is agreeing to pay. The booking opens at the role's own
  // figure when the post gave one, and at the post's otherwise.
  const hireRate = hiring
    ? (hiring.role && roleBudgetLabel(job.roleBudgets, hiring.role)) ||
      budgetLabel(job.budgetMin, job.budgetMax)
    : null;

  const live = job.status === 'open';

  return (
    <div className="space-y-2 border-t pt-3">
      {applications.map((app) => {
        const waitingOnYou = app.status !== 'accepted' && app.status !== 'declined';
        // Booking a role twice is refused now; offering it was the bug.
        const roleTaken = !!app.role && isRoleFilled(job, app.role);
        const beingDeclined = declining[app.id];
        return (
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
              {/* By application: the row carries no account id. */}
              <PersonSafetyMenu
                safety={safety}
                className="-mr-1 -mt-1"
                subject={{ name: app.personName, target: { applicationId: app.id } }}
              />
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

            {waitingOnYou && beingDeclined ? (
              <div className="mt-2.5 flex min-h-9 items-center justify-between gap-2 rounded-lg bg-muted py-1 pr-1 pl-3">
                <p className="text-sm">
                  {beingDeclined === 'waiting'
                    ? 'Declined. They will be told in a moment.'
                    : 'Declined.'}
                </p>
                {beingDeclined === 'waiting' && (
                  <Button size="sm" variant="ghost" onClick={() => undo(app.id)}>
                    Undo
                  </Button>
                )}
              </div>
            ) : waitingOnYou ? (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {/* A post that has ended takes nobody on, so it offers only
                    Decline, which answers them. Nor a role somebody already
                    holds: the server refuses a second booking for it. */}
                {live && !roleTaken && (
                  <Button
                    size="sm"
                    disabled={respond.isPending}
                    onClick={() => {
                      setHiring(app);
                      setConfirmingHire(true);
                    }}
                  >
                    {acting === app.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Accept
                  </Button>
                )}
                {live && !roleTaken && app.status !== 'shortlisted' && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={respond.isPending}
                    onClick={() => answer(app, 'shortlisted')}
                  >
                    <Star className="size-4" />
                    Shortlist
                  </Button>
                )}
                {live && roleTaken && (
                  <p className="mr-1 text-xs text-muted-foreground">
                    {app.role} is booked. Cancel that booking to hire someone else.
                  </p>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={respond.isPending}
                  onClick={() => decline(app)}
                >
                  <X className="size-4" />
                  Decline
                </Button>
              </div>
            ) : null}

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
        );
      })}

      <AlertDialog open={confirmingHire} onOpenChange={setConfirmingHire}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hire {hiring?.personName}
              {hiring?.role ? ` as ${hiring.role}` : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {hireRate
                ? `At ${hireRate}, which you can change on the booking.`
                : 'You set the rate on the booking.'}{' '}
              This books them for “{job.title}”, connects you, and opens a chat
              with them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => hiring && answer(hiring, 'accepted')}>
              Hire
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {safety.dialogs}
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
  /*
   * A place to look in, which the phone's board has had and this one did
   * not: the API filters by location, and the only filter here was the role,
   * so somebody in Davao read every post in Manila to find the two near them.
   */
  const [place, setPlace] = useState('');
  const [searchedPlace, setSearchedPlace] = useState('');
  const { roles: allRoles } = useRoles();

  // One request per settled word, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchedPlace(place.trim()), 350);
    return () => clearTimeout(timer);
  }, [place]);

  const {
    jobs,
    total,
    isLoading,
    loadFailed,
    refetch,
    isRefiltering,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useJobs({
    roles: role ? [role] : [],
    location: searchedPlace || undefined,
  });

  const filtered = Boolean(place.trim() || role);
  const clearPlace = () => {
    setPlace('');
    setSearchedPlace('');
  };
  const clearFilters = () => {
    clearPlace();
    setRole(null);
  };

  return (
    <div className="space-y-4">
      <div className="relative sm:max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          placeholder="Anywhere — try Cebu, Manila, Davao"
          aria-label="Search by place"
          className="pr-16 pl-9"
        />
        <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
          {/* In the field, not over the list: the previous results stay on
              screen while the next ones load, so this is the only thing that
              should change. */}
          {isRefiltering && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
          )}
          {/* There was no way to empty it but to backspace it out. */}
          {place && (
            <button
              type="button"
              onClick={clearPlace}
              aria-label="Clear the place"
              className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

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
            title={
              searchedPlace
                ? `Nothing in “${searchedPlace}”`
                : role
                  ? `Nothing open for a ${role.toLowerCase()}`
                  : 'No open jobs right now'
            }
            description={
              filtered
                ? 'Try a wider search, or post the job you need doing.'
                : 'Posts expire when the job does, so this list is always current. Check back, or post the job you need doing.'
            }
            action={
              // A filtered board that comes back empty is usually the filter,
              // and the way out of it should be on the card, not up the page.
              filtered ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={clearFilters}>Clear filters</Button>
                  <Button asChild variant="outline">
                    <Link href="/jobs/new">Post a job instead</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild>
                  <Link href="/jobs/new">Post a job</Link>
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {total} open {total === 1 ? 'job' : 'jobs'}
            </p>
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
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
                          {/* One badge, showing the furthest any of them got:
                              accepted for the HMUA slot is what you want to
                              see even if the videographer one was declined. */}
                          {headlineApplication(job) && (
                            <ApplicationBadge
                              status={headlineApplication(job)!.status}
                            />
                          )}
                        </p>
                      </div>
                    </div>

                    <p className="line-clamp-2 whitespace-pre-line text-sm text-muted-foreground">
                      {job.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      {/* A filled role reads as struck through rather than
                          disappearing: a post that wanted three people and
                          has two left is a different thing from a post that
                          only ever wanted one, and the card should not make
                          those look identical. */}
                      {job.rolesWanted.map((r) => {
                        const filled = isRoleFilled(job, r);
                        return (
                          <Badge
                            key={r}
                            variant="secondary"
                            className={cn(
                              'text-[11px]',
                              filled && 'opacity-50 line-through decoration-1',
                            )}
                          >
                            {r}
                          </Badge>
                        );
                      })}
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
          {/* The board comes a page at a time, and the header counted every
              post while only the first thirty could be reached — the
              farthest away, since it is nearest first. Not while a new
              filter is loading: the old one's next page is not this one's. */}
          {hasNextPage && !isRefiltering && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `Show more (${jobs.length} of ${total})`
              )}
            </Button>
          )}
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
  const withdraw = useWithdrawApplication();
  // Asked in the app, as on the posts above; the application is kept after
  // the dialog closes so its title does not empty out while it fades.
  const [withdrawing, setWithdrawing] = useState<JobApplication | null>(null);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const onWithdraw = (app: JobApplication) => {
    setWithdrawing(app);
    setConfirmingWithdraw(true);
  };

  const confirmWithdraw = () => {
    if (!withdrawing) return;
    withdraw.mutate(withdrawing.id, {
      onSuccess: () => {
        setConfirmingWithdraw(false);
        toast.success('Application withdrawn');
      },
      onError: (e: Error) => toast.error(e.message),
    });
  };

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

            {(app.status === 'new' || app.status === 'shortlisted') && app.postStatus === 'open' && (
              <Button
                size="sm"
                variant="ghost"
                className="-ml-2 text-muted-foreground"
                disabled={withdraw.isPending && withdraw.variables === app.id}
                onClick={() => onWithdraw(app)}
              >
                {withdraw.isPending && withdraw.variables === app.id ? 'Withdrawing…' : 'Withdraw'}
              </Button>
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

      <AlertDialog open={confirmingWithdraw} onOpenChange={setConfirmingWithdraw}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Withdraw your application to “{withdrawing?.postTitle}”?
            </AlertDialogTitle>
            <AlertDialogDescription>You can apply again while it is open.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={withdraw.isPending}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={withdraw.isPending}
              onClick={(event) => {
                // Open until it settles, so a failure is reported.
                event.preventDefault();
                confirmWithdraw();
              }}
            >
              {withdraw.isPending && <Loader2 className="size-4 animate-spin" />}
              Withdraw
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

type JobsTab = 'browse' | 'posted' | 'applied' | 'bookings';

/**
 * Every spelling a link might use for a tab.
 *
 * The phone's keys, so a link built for one client lands on the other: the
 * board, your posts, your applications and your bookings. `applications`
 * is what older links and emails say for the third, so it still works.
 */
const TAB_ALIASES: Record<string, JobsTab> = {
  browse: 'browse',
  posted: 'posted',
  applied: 'applied',
  applications: 'applied',
  bookings: 'bookings',
};

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
  const requested = params.get('tab') ?? '';
  // hasOwn, so ?tab=constructor is not handed a function off the prototype.
  const tab: JobsTab = Object.hasOwn(TAB_ALIASES, requested)
    ? TAB_ALIASES[requested]
    : 'browse';
  /** The post to open with its applicants showing, from "Manage post". */
  const focusPostId = params.get('post');
  const setTab = (next: string) =>
    // replace, not push: flipping tabs should not fill the back button with
    // the same screen four times. Drops ?post= too — it was about arriving.
    router.replace(next === 'browse' ? '/jobs' : `/jobs?tab=${next}`);

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
    <Screen title="Jobs">
      <PageHeader
        title="Jobs"
        description="Find work, manage what you have posted, and what you agreed"
        // Posting is the bar's Create, as on the phone.
      />

      {/*
        Browse first, deliberately.

        This screen is what the Jobs nav item opens, and it used to land on
        "Posted" — which for anyone who has never posted is an empty card and
        nothing to do. The board always has something in it, so it is the
        honest default and it matches where the phone's Jobs entry goes.
      */}
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6">
        <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="posted">Posted ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applied" aria-label="Your applications">Applied</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
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
                <JobRow key={job.id} job={job} focused={job.id === focusPostId} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applied" className="mt-4">
          <MyApplications onBrowse={() => setTab('browse')} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <BookingsList />
        </TabsContent>
        </Tabs>
      </div>
    </Screen>
  );
}
