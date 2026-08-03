'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Banknote, BriefcaseBusiness, CalendarDays, Loader2, MapPin, Send } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { budgetLabel } from '@/api';
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
  const [message, setMessage] = useState('');

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
  const budget = budgetLabel(post.budgetMin, post.budgetMax);
  const tooShort = message.trim().length < 20;

  const submit = () => {
    apply.mutate(
      { slug, message: message.trim() },
      {
        onSuccess: () => {
          toast.success('Application sent', {
            description: `${post.postedBy.displayName} will see it and can reply in chat.`,
          });
          router.push('/jobs/applications');
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

            <div className="flex flex-wrap gap-1.5">
              {post.rolesWanted.map((role) => (
                <Badge key={role} variant="outline" className="text-[12px]">
                  {role}
                </Badge>
              ))}
            </div>

            <p className="whitespace-pre-line rounded-lg bg-muted/40 p-4 text-sm leading-relaxed">
              {post.description}
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="message">Why you</Label>
              <Textarea
                id="message"
                rows={6}
                maxLength={2000}
                placeholder="What you have shot that is like this, whether you are free on the day, and anything they should see. Keep it short — they are reading several of these."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {tooShort
                  ? 'A couple of lines at least — a one-word application does not get read.'
                  : `${message.length} / 2000`}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 border-t pt-4">
              <p className="text-xs text-muted-foreground">
                They see your profile and roles alongside this.
              </p>
              <Button onClick={submit} disabled={tooShort || apply.isPending}>
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
