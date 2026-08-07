'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { budgetLabel, type JobPost } from '@/api';
import {
  useApplicants,
  useDeleteJob,
  useJobs,
  useMyApplications,
  useMyJobs,
  useRespondToApplication,
  useSetJobStatus,
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
  const budget = budgetLabel(job.budgetMin, job.budgetMax);

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
          </Button>

          {job.status === 'open' && (
            <>
              <Link
                href={`/jobs/${job.slug}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <Eye className="size-3.5" />
                View post
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate(
                    { id: job.id, status: 'filled' },
                    {
                      onSuccess: () => toast.success('Marked as filled'),
                      onError: (e: Error) => toast.error(e.message),
                    },
                  )
                }
              >
                Mark filled
              </Button>
            </>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(job.id, {
                onSuccess: () => toast.success('Post deleted'),
                onError: (e: Error) => toast.error(e.message),
              })
            }
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
  const { applications, isLoading } = useApplicants(postId);
  const respond = useRespondToApplication();
  const [acting, setActing] = useState<string | null>(null);

  if (isLoading) return <ListSkeleton rows={2} />;

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
            {app.status !== 'new' && (
              <Badge variant={app.status === 'accepted' ? 'default' : 'secondary'}>
                {app.status}
              </Badge>
            )}
          </div>

          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {app.message}
          </p>

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

          {app.status === 'accepted' && app.conversationId && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2.5"
              onClick={() => router.push(`/chat/${app.conversationId}`)}
            >
              <MessageCircle className="size-4" />
              Open chat
            </Button>
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
  const { jobs, total, isLoading } = useJobs({ roles: role ? [role] : [] });

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
                        <p className="text-[15px] font-bold leading-snug">{job.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.postedBy.displayName}
                          {job.applicantCount > 0
                            ? ` · ${job.applicantCount} applied`
                            : ''}
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
  const router = useRouter();
  const { applications, isLoading } = useMyApplications();

  if (isLoading && applications.length === 0) return <ListSkeleton rows={2} />;

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
                  Applied {new Date(app.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant={app.status === 'accepted' ? 'default' : 'secondary'}>
                {app.status === 'new' ? 'Waiting' : app.status}
              </Badge>
            </div>

            <p className="whitespace-pre-line rounded-lg bg-muted/40 p-3 text-sm leading-relaxed">
              {app.message}
            </p>

            {app.status === 'accepted' && app.conversationId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push(`/chat/${app.conversationId}`)}
              >
                <MessageCircle className="size-4" />
                Open chat
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function MyJobsPage() {
  const { jobs, isLoading } = useMyJobs();
  const [tab, setTab] = useState('browse');

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
