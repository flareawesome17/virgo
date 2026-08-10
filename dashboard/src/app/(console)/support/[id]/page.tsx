'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import {
  useMe,
  useReplyTicket,
  useTicket,
  useUpdateTicket,
} from '@/hooks/useConsole';
import { DataState, PageHeader, when } from '@/components/console/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const STATUSES = ['open', 'pending', 'resolved', 'closed'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useMe();
  const { data, isLoading, isError, refetch } = useTicket(id);
  const reply = useReplyTicket(id);
  const update = useUpdateTicket(id);

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);

  const ticket = data?.ticket as Record<string, string | null> | undefined;

  function send() {
    if (!body.trim()) return;
    reply.mutate(
      { body, internal },
      { onSuccess: () => setBody('') },
    );
  }

  return (
    <>
      <Link
        href="/support"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Support
      </Link>

      <DataState
        isLoading={isLoading}
        isError={isError}
        isEmpty={false}
        onRetry={() => void refetch()}
      >
        {data && ticket && (
          <>
            <PageHeader
              title={String(ticket.subject)}
              description={`${ticket.user_email} · opened ${when(ticket.created_at)}`}
              action={
                can('support.manage') ? (
                  <div className="flex gap-2">
                    <Select
                      value={String(ticket.status)}
                      onValueChange={(v) => update.mutate({ status: v })}
                    >
                      <SelectTrigger className="w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s} className="capitalize">
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={String(ticket.priority)}
                      onValueChange={(v) => update.mutate({ priority: v })}
                    >
                      <SelectTrigger className="w-32 capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => (
                          <SelectItem key={p} value={p} className="capitalize">
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {String(ticket.status)}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {String(ticket.priority)}
                    </Badge>
                  </div>
                )
              }
            />

            <div className="space-y-3">
              {data.messages.map((m) => (
                <Card
                  key={m.id}
                  className={cn(
                    m.internal && 'border-amber-500/40 bg-amber-500/[0.06]',
                    m.author_type === 'admin' && !m.internal && 'bg-muted/40',
                  )}
                >
                  <CardContent className="p-4">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">{m.author_name}</span>
                      <span className="text-muted-foreground">
                        {m.author_type === 'admin' ? 'Support' : 'Customer'}
                      </span>
                      {m.internal && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-500">
                          <Lock className="size-3" />
                          Internal note
                        </span>
                      )}
                      <span className="ml-auto text-muted-foreground">
                        {when(m.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {m.body}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {can('support.reply') && (
              <Card className="mt-5">
                <CardContent className="p-4">
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={4}
                    placeholder={
                      internal
                        ? 'A note for colleagues. The customer will not see this.'
                        : 'Your reply to the customer…'
                    }
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {/* A checkbox, not a toggle in a menu: the difference
                        between a reply and a private note has to be visible
                        at the moment of sending. */}
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={internal}
                        onChange={(e) => setInternal(e.target.checked)}
                        className="size-4 accent-amber-600"
                      />
                      Internal note — not sent to the customer
                    </label>
                    <Button
                      onClick={send}
                      disabled={reply.isPending || !body.trim()}
                      variant={internal ? 'secondary' : 'default'}
                    >
                      {internal ? 'Save note' : 'Send reply'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </DataState>
    </>
  );
}
