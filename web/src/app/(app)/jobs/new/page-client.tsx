'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, CloudOff, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useCreateJob, useJob, useUpdateJob } from '@/hooks/useJobs';
import { ApiError, type JobPost } from '@/api';
import {
  JOB_TITLE_MIN,
  MAX_ROLE_BUDGET_MINOR,
  jobPostBlockers,
  joinBlockers,
} from '@/lib/job-form';
import { DatePickerField } from '@/components/date-picker-field';
import { LocationField } from '@/components/location-field';
import { copyJobLink } from '@/components/jobs/copy-job-link';
import { leaveIfDiscarded, useDiscardGuard } from '@/lib/discard-guard';

/** Local, not UTC — toISOString would rule out today west of Greenwich. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}
import { useRoles } from '@/hooks/useRoles';

/** Pesos in the form, centavos on the wire. */
function toCentavos(value: string): number | undefined {
  const pesos = Number(value.replace(/[^\d.]/g, ''));
  if (!Number.isFinite(pesos) || pesos <= 0) return undefined;
  return Math.round(pesos * 100);
}

/** Centavos back to the pesos the form holds; nothing stated stays blank. */
function toPesos(minor?: number | null): string {
  return minor == null ? '' : String(minor / 100);
}

/** The API answers "not yours" and "not there" alike, so ids cannot be probed. */
const isGone = (error: unknown) =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

/**
 * Posting a job, or with `?edit=<slug>` changing one.
 *
 * A post could not be edited on the web at all: a typo in the title, a wrong
 * date or a budget that needed moving meant deleting it — and deleting takes
 * every application with it. The same form, filled from the post, saves over
 * it, as the phone's does (mobile/app/(app)/jobs/new.tsx).
 */
function NewJob() {
  const params = useSearchParams();
  const edit = params.get('edit') ?? undefined;
  const job = useJob(edit);

  if (!edit) return <JobForm />;

  const post = job.data;
  if (!post) {
    const gone = isGone(job.error);
    const failed = !gone && (job.isError || job.isPaused);
    return (
      <Screen title="Edit job post">
        {gone ? (
          <EmptyState
            icon={BriefcaseBusiness}
            title="This post is no longer available"
            description="It was deleted, or it has ended."
            action={
              <Button asChild>
                <Link href="/jobs?tab=posted">Your posts</Link>
              </Button>
            }
          />
        ) : failed ? (
          <EmptyState
            icon={CloudOff}
            title="Could not load this post"
            description="Check your connection and try again."
            action={<Button onClick={() => void job.refetch()}>Try again</Button>}
          />
        ) : (
          <CenteredSpinner />
        )}
      </Screen>
    );
  }

  // The board serves anybody's post at this address, so the form would open
  // on someone else's and only fail on Save, after the changes were typed.
  if (!post.isMine) {
    return (
      <Screen title="Edit job post">
        <EmptyState
          icon={BriefcaseBusiness}
          title="This is not your post"
          description="Only the person who posted a job can change it."
          action={
            <Button asChild>
              <Link href={`/jobs/${post.slug}`}>View the post</Link>
            </Button>
          }
        />
      </Screen>
    );
  }

  // Keyed, so the form starts from the post without an effect copying it in,
  // and a refetch while typing does not overwrite what has been changed.
  return <JobForm key={post.id} existing={post} />;
}

/**
 * `useSearchParams` needs a Suspense boundary in the app router, or the whole
 * route opts into dynamic rendering.
 */
export default function NewJobPage() {
  return (
    <Suspense fallback={null}>
      <NewJob />
    </Suspense>
  );
}

function JobForm({ existing }: { existing?: JobPost }) {
  const router = useRouter();
  const create = useCreateJob();
  const update = useUpdateJob();
  const isEdit = Boolean(existing);
  const saving = create.isPending || update.isPending;
  const {
    roles: allRoles,
    isLoading: rolesLoading,
    loadFailed: rolesFailed,
    refetch: refetchRoles,
  } = useRoles();

  // Filled once, from the post as it arrived; after that the form is theirs.
  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [rolesWanted, setRolesWanted] = useState<string[]>(existing?.rolesWanted ?? []);
  const [eventDate, setEventDate] = useState(existing?.eventDate ?? '');
  const [location, setLocation] = useState(existing?.location ?? '');
  /*
   * Kept as typed text per role, converted on submit.
   *
   * Keyed by role rather than held as a list, so deselecting a role and
   * picking it again does not lose what was already typed — and a role that
   * stays deselected is simply never read, since only `rolesWanted` is
   * iterated.
   */
  const [roleBudgets, setRoleBudgets] = useState<
    Record<string, { min: string; max: string }>
  >(() =>
    Object.fromEntries(
      Object.entries(existing?.roleBudgets ?? {}).map(([role, range]) => [
        role,
        { min: toPesos(range?.min), max: toPesos(range?.max) },
      ]),
    ),
  );

  // Asks before a half-written post is thrown away: a reload, a closed tab,
  // a link in the sidebar, or Back. An edit starts from the post, so opening
  // one and leaving without a change asks nothing.
  const { dirty, allowLeave } = useDiscardGuard({
    title,
    description,
    rolesWanted,
    eventDate,
    location,
    roleBudgets,
  });

  const setRoleBudget = (role: string, end: 'min' | 'max', value: string) =>
    setRoleBudgets((current) => ({
      ...current,
      [role]: { ...(current[role] ?? { min: '', max: '' }), [end]: value },
    }));

  const pair = (role: string) => ({
    min: toCentavos(roleBudgets[role]?.min ?? ''),
    max: toCentavos(roleBudgets[role]?.max ?? ''),
  });

  const budgetBackwards = rolesWanted.some((role) => {
    const { min, max } = pair(role);
    return min != null && max != null && min > max;
  });
  // Said while typing, as on the phone. It used to be found out on submit,
  // with the whole form filled in.
  const budgetTooHigh = rolesWanted.some((role) => {
    const { min, max } = pair(role);
    return (min ?? 0) > MAX_ROLE_BUDGET_MINOR || (max ?? 0) > MAX_ROLE_BUDGET_MINOR;
  });

  const blockers = jobPostBlockers({
    title,
    description,
    rolesWanted,
    budgetBackwards,
    budgetTooHigh,
  });
  const ready = blockers.length === 0;

  const submit = () => {
    const budgets: Record<string, { min?: number; max?: number }> = {};
    for (const role of rolesWanted) {
      const { min, max } = pair(role);
      if (min == null && max == null) continue;
      budgets[role] = {};
      if (min != null) budgets[role].min = min;
      if (max != null) budgets[role].max = max;
    }

    if (existing) {
      update.mutate(
        {
          id: existing.id,
          title: title.trim(),
          description: description.trim(),
          rolesWanted,
          // Sent whole: a role left without figures is one the poster cleared.
          roleBudgets: budgets,
          // Only when it moved. The server refuses a date that has passed, so
          // resending the one a filled or closed post already had would fail
          // a save that never touched it.
          ...(eventDate !== (existing.eventDate ?? '')
            ? { eventDate: eventDate || null }
            : {}),
          // null, not undefined: that is how the API is told to clear it.
          location: location.trim() || null,
        },
        {
          // Back onto the post, which now reads as saved. replace, so Back
          // does not reopen the form over changes already made.
          onSuccess: (saved) => {
            allowLeave();
            router.replace(`/jobs/${saved.slug}`);
            toast.success('Changes saved');
          },
          onError: (error: Error) =>
            toast.error("Couldn't save it", { description: error.message }),
        },
      );
      return;
    }

    create.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        rolesWanted,
        roleBudgets: budgets,
        eventDate: eventDate || undefined,
        location: location.trim() || undefined,
      },
      {
        // Onto the post itself, which is what people will see — not the top
        // of the board, where your own post is one card among thirty — with
        // the one thing worth doing next. replace, so Back does not reopen
        // the form for a post that is already up.
        onSuccess: (post) => {
          track('job_posted', {
            roles: rolesWanted.length,
            withBudget: Object.keys(budgets).length > 0,
            withDate: !!eventDate,
            withLocation: !!location.trim(),
          });
          allowLeave();
          router.replace(`/jobs/${post.slug}`);
          toast.success('Your job is live', {
            description: 'People who do this work can find it now. Share it to reach more of them.',
            action: { label: 'Copy link', onClick: () => void copyJobLink(post.slug) },
          });
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <Screen title={isEdit ? 'Edit job post' : 'Post a job'}>
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() =>
            leaveIfDiscarded(dirty, () => {
              allowLeave();
              // An edit opened in a new tab has nothing to go back to; the
              // post it came from is the way out.
              if (window.history.length > 1) router.back();
              else router.push(existing ? `/jobs/${existing.slug}` : '/jobs');
            })
          }
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h1 className="text-lg font-bold">
                {isEdit ? 'Edit job post' : 'Post a job'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isEdit ? (
                  'Changes show on the job board as soon as you save. Everyone who has already applied stays on the post.'
                ) : (
                  <>
                    {/* Said "the public board at virgo.ph/jobs" while the board
                        answers 401 without a session — promising the open web
                        something only members can see. */}
                    Everyone on Virgo sees this on the job board, so anyone
                    looking for this kind of work can find it. It is not
                    visible outside the app.
                  </>
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="title">What do you need?</Label>
              <Input
                id="title"
                placeholder="Wedding photographer for a December wedding in Cebu"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
              <p className="text-xs text-muted-foreground">
                {title.trim().length > 0 && title.trim().length < JOB_TITLE_MIN
                  ? `A little longer — ${JOB_TITLE_MIN - title.trim().length} more character${
                      JOB_TITLE_MIN - title.trim().length === 1 ? '' : 's'
                    }. Say the role, the place and roughly when.`
                  : 'This is the line people scan on the board. Say the role, the place and roughly when.'}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Which roles are you hiring for?</Label>
              {/* With no roles to pick, the form asked for one and offered
                  nothing to click. */}
              {rolesLoading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading roles…
                </p>
              )}
              {!rolesLoading && rolesFailed && allRoles.length === 0 && (
                <div className="flex items-center gap-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <span className="flex-1">Couldn&rsquo;t load the roles.</span>
                  <Button size="sm" variant="secondary" onClick={() => void refetchRoles()}>
                    Try again
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {allRoles.map((role) => {
                  const on = rolesWanted.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() =>
                        setRolesWanted((current) =>
                          on
                            ? current.filter((r) => r !== role)
                            : [...current, role],
                        )
                      }
                    >
                      <Badge
                        variant={on ? 'default' : 'outline'}
                        className="cursor-pointer px-3 py-1.5 text-[13px]"
                      >
                        {role}
                      </Badge>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Pick more than one if the event needs a team — it will show up
                in each of their searches.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="eventDate">Date of the job</Label>
                <DatePickerField
                  id="eventDate"
                  value={eventDate}
                  onChange={setEventDate}
                  placeholder="Pick a date (optional)"
                  fromDate={todayIso()}
                />
                <p className="text-xs text-muted-foreground">
                  The post closes itself the day after.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="location">Where</Label>
                <LocationField
                  id="location"
                  value={location}
                  onChange={setLocation}
                />
              </div>
            </div>

            {/*
              A budget per role, not one for the post.

              A wedding wanting a photographer, a videographer and an HMUA pays
              three different rates, and a single "₱2,000 – ₱15,000" across all
              three tells a photographer nothing and an HMUA nothing. It also
              decided what an accepted applicant's booking opened at, so an
              HMUA was booked at the videographer's ceiling.

              Only the roles actually selected get a row, so the section grows
              with the post rather than asking for numbers nobody needs.
            */}
            {rolesWanted.length > 0 && (
              <div className="space-y-2">
                <Label>What each role pays (₱)</Label>
                <div className="space-y-2">
                  {rolesWanted.map((role) => (
                    <div
                      key={role}
                      className="grid items-center gap-2 sm:grid-cols-[10rem_1fr_1fr]"
                    >
                      <span className="truncate text-sm font-medium">{role}</span>
                      <Input
                        inputMode="numeric"
                        placeholder="from 30,000"
                        aria-label={`${role} budget from`}
                        value={roleBudgets[role]?.min ?? ''}
                        onChange={(e) => setRoleBudget(role, 'min', e.target.value)}
                      />
                      <Input
                        inputMode="numeric"
                        placeholder="up to 45,000"
                        aria-label={`${role} budget up to`}
                        value={roleBudgets[role]?.max ?? ''}
                        onChange={(e) => setRoleBudget(role, 'max', e.target.value)}
                      />
                    </div>
                  ))}
                </div>
                {budgetBackwards ? (
                  <p className="text-xs text-destructive">
                    The lower figure needs to be the smaller one.
                  </p>
                ) : budgetTooHigh ? (
                  <p className="text-xs text-destructive">
                    Each role can be up to ₱500,000.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Optional, but a role with a number gets far better
                    applications than one without.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description">The brief</Label>
              <Textarea
                id="description"
                rows={7}
                maxLength={4000}
                placeholder="What the day looks like, how many hours, what you need delivered and by when. The more specific this is, the fewer wrong applications you get."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {description.trim().length < 30
                  ? 'A few sentences at least — people are deciding whether to spend their day on this.'
                  : `${description.length} / 4000`}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                {!ready
                  ? `Still needs ${joinBlockers(blockers)}.`
                  : // An edit with nothing changed has nothing to save, and a
                    // greyed-out Save with no reason looks broken.
                    isEdit && !dirty
                    ? 'Nothing has changed yet.'
                    : 'Posts run for 30 days, or until the job date passes.'}
              </p>
              <Button
                onClick={submit}
                disabled={!ready || saving || (isEdit && !dirty)}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isEdit ? null : (
                  <Send className="size-4" />
                )}
                {isEdit ? 'Save' : 'Post it'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Screen>
  );
}
