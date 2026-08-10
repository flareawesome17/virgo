'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Banknote,
  BriefcaseBusiness,
  CalendarDays,
  Flag,
  MapPin,
  Send,
  Share2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { budgetLabel, jobUrl, roleBudgetLabel, type ReportReason } from '@/api';
import { useJob, useMyApplications, useReportJob } from '@/hooks/useJobs';
import { ApplicationState } from '@/components/jobs/application-state';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/** "Sat 19 Dec". */
function jobDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'scam', label: 'Looks like a scam' },
  { value: 'offensive', label: 'Offensive' },
  { value: 'not-a-job', label: 'Not a real job' },
];

/**
 * A job post, inside the app.
 *
 * Owns `/jobs/<slug>` on this host; the public copy of the same post lives at
 * the same path on virgo.ph, which the proxy sends to `/j/<slug>`. So one
 * address is both the link you share with a stranger and the screen a
 * signed-in reader gets natively — rather than the app throwing its own users
 * onto a marketing page in a new tab.
 */
export default function JobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const router = useRouter();
  const job = useJob(slug);
  const report = useReportJob();
  const [reported, setReported] = useState(false);
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

  if (job.isLoading) return <AppShell><CenteredSpinner /></AppShell>;

  if (job.isError || !job.data) {
    return (
      <AppShell>
        <EmptyState
          icon={BriefcaseBusiness}
          title="Job not found"
          description="This post has been filled, closed, or taken down."
          action={<Button onClick={() => router.push('/jobs/mine')}>Browse jobs</Button>}
        />
      </AppShell>
    );
  }

  const post = job.data;
  const budget = budgetLabel(post.budgetMin, post.budgetMax);
  const isOpen = post.status === 'open';

  const share = async () => {
    const url = jobUrl(post.slug, SITE);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { description: url });
    } catch {
      toast.info(url);
    }
  };

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
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {!isOpen && (
          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-600 dark:text-amber-200/90">
            {post.status === 'filled'
              ? 'This job has been filled.'
              : post.status === 'expired'
                ? 'This post has expired.'
                : 'This post is closed.'}{' '}
            <Link href="/jobs/mine" className="font-semibold underline">
              See what else is open
            </Link>
          </div>
        )}

        <Card>
          <CardContent className="space-y-6">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-extrabold leading-tight tracking-tight">
                  {post.title}
                </h1>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="icon" onClick={share} aria-label="Copy link">
                  <Share2 className="size-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Report this post"
                      disabled={reported || report.isPending}
                    >
                      <Flag className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {REPORT_REASONS.map((r) => (
                      <DropdownMenuItem key={r.value} onClick={() => flag(r.value)}>
                        {r.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={post.postedBy.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-xs">
                  {post.postedBy.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {/* Their profile, natively, not the marketing page. */}
                  {post.postedBy.handle ? (
                    <Link
                      href={`/u/${post.postedBy.handle}`}
                      className="hover:underline"
                    >
                      {post.postedBy.displayName}
                    </Link>
                  ) : (
                    post.postedBy.displayName
                  )}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="size-3" />
                  {post.applicantCount === 0
                    ? 'No applications yet'
                    : `${post.applicantCount} applied`}
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-3">
              <Detail icon={CalendarDays} label="Date">
                {post.eventDate ? jobDate(post.eventDate) : 'Flexible'}
              </Detail>
              <Detail icon={MapPin} label="Where">
                {post.location ?? 'Not specified'}
              </Detail>
              <Detail icon={Banknote} label="Budget">
                {budget ?? 'Open to offers'}
              </Detail>
            </div>

            {/*
              Each role with what it pays, rather than a row of bare chips
              above one range for the whole post. A photographer reading
              "₱2,000 – ₱15,000" on a post that also wants a videographer
              learns nothing about what *they* would be paid.
            */}
            <div className="space-y-1.5">
              {post.rolesWanted.map((role) => {
                const rate = roleBudgetLabel(post.roleBudgets, role);
                return (
                  <div
                    key={role}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                  >
                    <span className="text-sm font-medium">{role}</span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {rate ?? 'Rate not stated'}
                    </span>
                  </div>
                );
              })}
            </div>

            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                The job
              </h2>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">
                {post.description}
              </p>
            </div>

            {/* Your own post offers management, not an application — the API
                refuses a self-apply, so offering it would only let somebody
                write out a whole application to be told no. */}
            {post.isMine ? (
              <div className="flex items-center justify-between gap-4 border-t pt-5">
                <p className="text-xs text-muted-foreground">
                  This is your post. Applications arrive under My jobs.
                </p>
                <Button asChild variant="outline">
                  <Link href="/jobs/mine">
                    <Users className="size-4" />
                    Manage post
                  </Link>
                </Button>
              </div>
            ) : post.myApplication ? (
              /* You have applied. The API refuses a second one, so offering
                 Apply again would take somebody through the whole form to be
                 told 409 — which is exactly what used to happen. */
              <ApplicationState post={post} conversationId={conversationId} />
            ) : isOpen ? (
              <div className="flex items-center justify-between gap-4 border-t pt-5">
                <p className="text-xs text-muted-foreground">
                  They see your profile and roles alongside your application.
                </p>
                <Button asChild>
                  <Link href={`/jobs/${post.slug}/apply`}>
                    <Send className="size-4" />
                    Apply
                  </Link>
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold">{children}</p>
    </div>
  );
}
