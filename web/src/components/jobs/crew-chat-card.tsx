'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, MessageCircle, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useStartCrewChat } from '@/hooks/useChatCrew';
import { groupProblem } from '@/components/chat/chat-errors';
import { MIN_CREW, type JobPost } from '@/api';

const NUMBER_WORDS = ['no one', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** "three", as a person would say it; a figure past ten. */
/** "both", "all three": small numbers as words, as a person says them. */
function countWord(n: number): string {
  return n === 2 ? 'both' : `all ${NUMBER_WORDS[n] ?? String(n)}`;
}

/**
 * A job's crew chat (board 137).
 *
 * The poster, with two or more hired and no crew chat yet: "Talk to all
 * three at once", and Start crew chat, which makes the group (or opens the
 * one it has) and goes to it. Once there is one, the poster and everyone
 * hired get Open crew chat; `crewChatId` is only set for people in it.
 */
export function CrewChatCard({ post }: { post: JobPost }) {
  const router = useRouter();
  const start = useStartCrewChat();
  const hired = post.hiredCount ?? 0;

  if (post.crewChatId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-background text-primary">
            <Users className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Crew chat</p>
            <p className="text-xs text-muted-foreground">
              {post.isMine ? 'You and everyone you hired, in one group.' : 'Everyone hired on this job, in one group.'}
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link href={`/chat/${post.crewChatId}`}>
            <MessageCircle className="size-4" />
            Open crew chat
          </Link>
        </Button>
      </div>
    );
  }

  if (!post.isMine || hired < MIN_CREW) return null;

  const begin = () =>
    start.mutate(post.id, {
      onSuccess: ({ id }) => router.push(`/chat/${id}`),
      onError: (err) => toast.error('Could not start the crew chat', { description: groupProblem(err) }),
    });

  return (
    <div className="rounded-2xl bg-primary/10 p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary">
          <Users className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold">Talk to {countWord(hired)} at once</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A group with you and everyone you hired. The job card goes first, and anyone you hire
            later joins it.
          </p>
        </div>
      </div>
      <Button className="mt-3 w-full" onClick={begin} disabled={start.isPending}>
        {start.isPending && <Loader2 className="size-4 animate-spin" />}
        Start crew chat
      </Button>
    </div>
  );
}
