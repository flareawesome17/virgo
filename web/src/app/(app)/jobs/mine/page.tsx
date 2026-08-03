'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ExternalLink,
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
import { budgetLabel, jobUrl, type JobPost } from '@/api';
import {
  useApplicants,
  useDeleteJob,
  useMyApplications,
  useMyJobs,
  useRespondToApplication,
  useSetJobStatus,
} from '@/hooks/useJobs';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

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
              <a
                href={jobUrl(job.slug, SITE)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                View public post
              </a>
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
                  <a
                    href={`${SITE}/@${app.personHandle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {app.personName}
                  </a>
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

/** What the caller has applied to. */
function MyApplications() {
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
            <Button asChild>
              <a href={`${SITE}/jobs`} target="_blank" rel="noopener noreferrer">
                Browse jobs
              </a>
            </Button>
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
                <a
                  href={jobUrl(app.postSlug, SITE)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[15px] font-bold leading-snug hover:underline"
                >
                  {app.postTitle}
                </a>
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

  return (
    <AppShell>
      <PageHeader
        title="Jobs"
        description="What you have posted, and what you have applied to"
        actions={
          <Button asChild>
            <Link href="/jobs/new">
              <Plus className="size-4" />
              Post a job
            </Link>
          </Button>
        }
      />

      <Tabs defaultValue="posted" className="mt-6">
        <TabsList>
          <TabsTrigger value="posted">Posted ({jobs.length})</TabsTrigger>
          <TabsTrigger value="applied">My applications</TabsTrigger>
        </TabsList>

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
          <MyApplications />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
