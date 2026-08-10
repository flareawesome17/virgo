'use client';

import { useState } from 'react';
import { LifeBuoy, MessageSquare, Plus } from 'lucide-react';
import {
  useOpenTicket,
  useReplyToTicket,
  useSupportThread,
  useSupportTickets,
} from '@/hooks/useSupport';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  pending: 'Waiting on us',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * Contact support.
 *
 * The API for this existed before anything could reach it — tickets could be
 * answered from the console but never raised. This is the way in.
 *
 * Threaded rather than a fire-and-forget form: a support request people cannot
 * see the state of gets sent three more times, which is worse for them and
 * worse for whoever answers.
 */
export default function SupportPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const { tickets, isLoading, loadFailed, refetch } = useSupportTickets();

  if (openId) {
    return <Thread id={openId} onBack={() => setOpenId(null)} />;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Support</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask us anything. We answer in the app and by email.
          </p>
        </div>
        <Button size="sm" onClick={() => setComposing((v) => !v)}>
          <Plus className="size-4" />
          New request
        </Button>
      </div>

      {composing && (
        <Card className="mb-5">
          <CardContent className="p-4">
            <Compose onDone={() => setComposing(false)} />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : loadFailed ? (
        <div className="rounded-lg border border-dashed py-10 text-center">
          <p className="text-sm font-medium">Could not load your requests</p>
          <p className="mt-1 text-xs text-muted-foreground">
            This is a connection problem, not an empty list.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => void refetch()}
          >
            Try again
          </Button>
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-lg border border-dashed py-12 text-center">
          <LifeBuoy className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">No requests yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            If something is broken or confusing, tell us — during the
            pre-release that is the most useful thing you can do.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenId(t.id)}
              className="flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t.messages ?? 0} message{(t.messages ?? 0) === 1 ? '' : 's'}
                </p>
              </div>
              <Badge
                variant={t.status === 'open' ? 'default' : 'secondary'}
                className="shrink-0"
              >
                {STATUS_LABEL[t.status] ?? t.status}
              </Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Compose({ onDone }: { onDone: () => void }) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const open = useOpenTicket();

  const tooShort = body.trim().length < 10 || subject.trim().length < 3;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        open.mutate({ subject, body }, { onSuccess: onDone });
      }}
      className="space-y-3"
    >
      <div className="space-y-1.5">
        <Label htmlFor="subject">What is this about?</Label>
        <Input
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Uploads failing on my wedding album"
          maxLength={200}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Tell us what happened</Label>
        <Textarea
          id="body"
          rows={5}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What you were doing, what you expected, and what happened instead."
          maxLength={5000}
        />
      </div>
      {open.isError && (
        <p role="alert" className="text-sm text-destructive">
          {open.error instanceof Error ? open.error.message : 'Could not send'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={open.isPending || tooShort}>
          {open.isPending ? 'Sending…' : 'Send request'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Thread({ id, onBack }: { id: string; onBack: () => void }) {
  const { ticket, messages, isLoading, loadFailed } = useSupportThread(id);
  const reply = useReplyToTicket(id);
  const [body, setBody] = useState('');

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-6 sm:px-8">
      <button
        onClick={onBack}
        className="mb-4 text-sm text-muted-foreground hover:text-foreground"
      >
        ← All requests
      </button>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : loadFailed ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Could not load this conversation.
        </p>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-bold tracking-tight">
              {ticket?.subject}
            </h1>
            <Badge variant="secondary">
              {STATUS_LABEL[String(ticket?.status)] ?? ticket?.status}
            </Badge>
          </div>

          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  'rounded-lg border p-4',
                  m.author_type === 'admin' && 'border-primary/30 bg-primary/[0.04]',
                )}
              >
                <div className="mb-1.5 flex items-center gap-2 text-xs">
                  <span className="font-semibold">
                    {m.author_type === 'admin' ? 'Virgo Support' : 'You'}
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {new Date(m.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {m.body}
                </p>
              </div>
            ))}
          </div>

          <Card className="mt-5">
            <CardContent className="p-4">
              <Textarea
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Add to this request…"
                maxLength={5000}
              />
              <Button
                className="mt-3"
                disabled={reply.isPending || !body.trim()}
                onClick={() =>
                  reply.mutate(body, { onSuccess: () => setBody('') })
                }
              >
                <MessageSquare className="size-4" />
                {reply.isPending ? 'Sending…' : 'Send'}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
