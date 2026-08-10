'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, BriefcaseBusiness, CalendarDays, Loader2, MapPin, Send } from 'lucide-react';
import { toast } from 'sonner';
import { track } from '@/lib/analytics';
import { AppShell } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { applicationFor, budgetLabel, roleBudgetLabel, rolesLeftFor } from '@/api';
import { ApplicationBadge } from '@/components/jobs/application-state';
import { cn } from '@/lib/utils';
import { useApplyToJob, useJob } from '@/hooks/useJobs';

/** "Sat 19 Dec". */
function jobDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Applying to a job.
 *
 * On the app host because it needs a session — the public post page links
 * here, and the AuthGuard bounces a signed-out visitor through sign-in and
 * back to this exact URL.
 */
export default function ApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const job = useJob(slug);
  const apply = useApplyToJob();
  const [role, setRole] = useState<string | null>(null);

  if (job.isLoading) return <AppShell><CenteredSpinner /></AppShell>;

  if (job.isError || !job.data) {
    return (
      <AppShell>
        <EmptyState
          icon={BriefcaseBusiness}
          title="Job not found"
          description="This post has been filled, closed, or taken down."
          action={<Button onClick={() => router.push('/jobs/mine')}>My jobs</Button>}
        />
      </AppShell>
    );
  }

  const post = job.data;

  // Reachable by typing the URL even though nothing links here for your own
  // post. Say so before the form rather than after the submit.
  if (post.isMine) {
    return (
      <AppShell>
        <EmptyState
          icon={BriefcaseBusiness}
          title="This is your own post"
          description="You cannot apply to a job you posted. Applications you receive arrive under My jobs."
          action={<Button onClick={() => router.push('/jobs/mine')}>My jobs</Button>}
        />
      </AppShell>
    );
  }

  const left = rolesLeftFor(post);

  // Nothing left to apply for. Reachable by typing the URL, or by coming back
  // to a page that was open when the last role went — say so rather than
  // offering a form whose only outcome is a 409.
  if (left.length === 0) {
    return (
      <AppShell>
        <EmptyState
          icon={BriefcaseBusiness}
          title="You have applied for every role on this job"
          description="There is nothing left to apply for here. You will hear from them on each one separately."
          action={
            <Button onClick={() => router.push(`/jobs/${slug}`)}>
              Back to the post
            </Button>
          }
        />
      </AppShell>
    );
  }

  const budget = budgetLabel(post.budgetMin, post.budgetMax);
  // One role left is not a choice, so it is not offered as one — the server
  // fills it in. More than one and it has to be answered before applying.
  const choosing = left.length > 1;
  const ready = !choosing || !!role;

  const submit = () => {
    apply.mutate(
      // With one role left the picker is not shown, so send that one.
      { slug, role: choosing ? role : (left[0] ?? null) },
      {
        onSuccess: () => {
          track('job_applied', { rolesOnPost: post.rolesWanted.length, chose: choosing });
          toast.success('Application sent', {
            description: `${post.postedBy.displayName} will see it and can reply in chat.`,
          });
          router.push('/jobs/mine?tab=applications');
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Card>
          <CardContent className="space-y-6 pt-6">
            <div>
              <h1 className="text-lg font-bold leading-snug">{post.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Posted by {post.postedBy.displayName}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {post.eventDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  {jobDate(post.eventDate)}
                </span>
              )}
              {post.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {post.location}
                </span>
              )}
              {budget && (
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground/70">
                  <Banknote className="size-3.5" />
                  {budget}
                </span>
              )}
            </div>

            <p className="whitespace-pre-line rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
              {post.description}
            </p>

            {/*
              Which role, and what it pays.

              A post wanting three roles used to produce one undifferentiated
              pile of applicants — the poster could not tell who had applied
              for what, and the booking made on acceptance had to guess by
              intersecting the post's roles with the applicant's own, which
              gives no answer at all for somebody who does two of the three.

              The rate sits on the option because it is the thing being chosen
              between: applying as an HMUA on a post that pays a videographer
              three times more is a decision, not a formality.
            */}
            <div className="space-y-2">
              <Label>{choosing ? 'Which role are you applying for?' : 'The role'}</Label>
              <div className="space-y-2">
                {post.rolesWanted.map((r) => {
                  const rate = roleBudgetLabel(post.roleBudgets, r);
                  // Roles you already applied for stay on the list, showing
                  // what happened to them — dropping them would leave you
                  // wondering whether the post changed or you misremembered.
                  const mine = applicationFor(post, r);
                  const selectable = !mine && choosing;
                  const selected = !mine && (choosing ? role === r : true);
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={!selectable}
                      onClick={() => setRole(r)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                        selected && 'border-primary bg-primary/5',
                        selectable && !selected && 'hover:bg-accent/60',
                        mine && 'opacity-60',
                        !selectable && 'cursor-default',
                      )}
                    >
                      <span className="text-sm font-medium">{r}</span>
                      <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                        {mine && <ApplicationBadge status={mine.status} />}
                        {rate ?? 'Rate not stated'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {choosing && !role && (
                <p className="text-xs text-muted-foreground">
                  Pick the one you are applying for. You can come back and
                  apply for another of these roles separately.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-4">
              {/*
                No "why you" box any more. It asked for a paragraph addressed
                to somebody who cannot reply until they have already accepted
                you — and the work says more than the paragraph did.
              */}
              <p className="text-xs text-muted-foreground">
                They see your profile, your roles and your portfolio.
              </p>
              <Button onClick={submit} disabled={!ready || apply.isPending}>
                {apply.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Apply
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
