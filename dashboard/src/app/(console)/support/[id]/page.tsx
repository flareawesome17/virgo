'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, ChevronDown, Lock, MessageSquareText, Pin } from 'lucide-react';
import { SUPPORT_CATEGORIES, type Macro } from '@/api/console';
import {
  useAgents,
  useMacros,
  useMe,
  usePresence,
  useReplyTicket,
  useTakeTicket,
  useTicket,
  useUpdateTicket,
  useUser,
} from '@/hooks/useConsole';
import { PresenceBar } from '@/components/console/presence';
import { DataState, Field, Panel, bytes, day, when } from '@/components/console/primitives';
import { useRecordTab } from '@/components/console/record-tabs';
import { PRIORITY_VARIANT, dueLabel, fillMacro } from '@/components/console/support';
import {
  AttachButton,
  MessageFiles,
  PendingFiles,
  Stars,
  useStaffUploads,
} from '@/components/console/support-files';
import { TagChip } from '@/components/console/tags';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

interface TicketRow {
  id: string;
  subject: string;
  status: 'open' | 'pending' | 'resolved' | 'closed';
  priority: string;
  category: string | null;
  user_id: string | null;
  user_email: string;
  user_name: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
  first_replied_at: string | null;
  resolved_at: string | null;
  due_at: string | null;
  overdue: boolean;
  rating: number | null;
  rating_comment: string | null;
  rated_at: string | null;
}

/**
 * One ticket: the thread and the reply box on the left; what the ticket is and
 * who the customer is on the right, so nobody answers without context.
 */
export default function TicketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useTicket(id);
  const ticket = data?.ticket as unknown as TicketRow | undefined;
  const [body, setBody] = useState('');

  useRecordTab({ href: `/support/${id}`, kind: 'ticket', title: ticket?.subject });
  // Typing a reply says so, so a colleague opening the same ticket sees it
  // before writing a second answer.
  const others = usePresence('ticket', id, body.trim() ? 'replying' : 'viewing');

  return (
    <>
      <Link
        href="/support"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Support
      </Link>

      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {data && ticket && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <header>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">{ticket.subject}</h1>
                  <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? 'secondary'} className="capitalize">
                    {ticket.priority}
                  </Badge>
                  {ticket.overdue && <Badge variant="destructive">Late</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {ticket.user_name || ticket.user_email} · opened {when(ticket.created_at)}
                </p>
              </header>

              <PresenceBar others={others} />

              <ol className="space-y-3">
                {data.messages.map((m) => (
                  <li
                    key={m.id}
                    className={cn(
                      'rounded-lg border bg-card p-4',
                      m.internal && 'border-warning/40 bg-warning/5',
                      m.author_type === 'admin' && !m.internal && 'bg-muted/40',
                    )}
                  >
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold">{m.author_name}</span>
                      <span className="text-muted-foreground">
                        {m.author_type === 'admin' ? 'Support' : 'Customer'}
                      </span>
                      {m.internal && (
                        <span className="inline-flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 font-medium text-warning">
                          <Lock className="size-3" />
                          Internal note
                        </span>
                      )}
                      <span className="ml-auto text-muted-foreground" title={new Date(m.created_at).toLocaleString()}>
                        {when(m.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">{m.body}</p>
                    <MessageFiles files={m.attachments} />
                  </li>
                ))}
              </ol>

              <Composer ticket={ticket} body={body} setBody={setBody} />
            </div>

            <aside className="space-y-4">
              <Properties ticket={ticket} />
              {ticket.user_id && <CustomerPanel userId={ticket.user_id} ticketId={ticket.id} />}
            </aside>
          </div>
        )}
      </DataState>
    </>
  );
}

/**
 * The reply box. A canned reply fills it (with the customer's name, yours and
 * the subject) for editing before it goes; "and mark it" decides what sending
 * does to the ticket, defaulting to what the reply suggests.
 */
function Composer({
  ticket,
  body,
  setBody,
}: {
  ticket: TicketRow;
  body: string;
  setBody: (v: string) => void;
}) {
  const { me, can } = useMe();
  const reply = useReplyTicket(ticket.id);
  const { data: macros } = useMacros();
  const [internal, setInternal] = useState(false);
  const [macro, setMacro] = useState<Macro | null>(null);
  // What happens after sending. Unset, it follows the ticket: a live one
  // waits for the customer, a finished one stays as it is ('auto' leaves the
  // status alone), so a quick follow-up does not reopen it.
  const [chosen, setThen] = useState<string | null>(null);
  const done = ticket.status === 'resolved' || ticket.status === 'closed';
  const then = chosen ?? (done ? 'auto' : 'pending');
  const uploads = useStaffUploads();
  const blocked = reply.isPending || !body.trim() || uploads.busy || uploads.failed;

  if (!can('support.reply')) return null;

  function insert(m: Macro) {
    const filled = fillMacro(m.body, {
      name: (ticket.user_name || ticket.user_email.split('@')[0]).split(' ')[0],
      agent: me?.name.split(' ')[0] ?? '',
      subject: ticket.subject,
    });
    setBody(body.trim() ? `${body.trimEnd()}\n\n${filled}` : filled);
    setMacro(m);
    if (m.set_status) setThen(m.set_status);
  }

  function send() {
    if (blocked) return;
    reply.mutate(
      {
        body,
        internal,
        setStatus: internal || then === 'auto' ? undefined : then,
        macroId: macro?.id,
        attachments: uploads.ids,
      },
      {
        onSuccess: () => {
          setBody('');
          setMacro(null);
          setThen(null);
          uploads.clear();
        },
      },
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-3', internal && 'border-warning/40')}>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send();
        }}
        rows={5}
        placeholder={
          internal
            ? 'A note for colleagues. The customer will not see this.'
            : 'Your reply. It reaches them in the app, by push and by email.'
        }
      />
      <PendingFiles uploads={uploads} />
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={!macros?.length}>
              <MessageSquareText className="size-3.5" />
              Canned reply
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
            <DropdownMenuLabel className="caption">Insert, then edit</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {macros?.map((m) => (
              <DropdownMenuItem key={m.id} onSelect={() => insert(m)} className="flex-col items-start gap-0">
                <span className="font-medium">{m.title}</span>
                <span className="line-clamp-1 text-xs text-muted-foreground">{m.body}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <AttachButton uploads={uploads} disabled={reply.isPending} />

        {/* A checkbox, not a toggle in a menu: the difference between a reply
            and a private note has to be visible at the moment of sending. */}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="size-4 accent-amber-600"
          />
          Internal note
        </label>

        <div className="ml-auto flex items-center gap-2">
          {!internal && (
            <Select value={then} onValueChange={setThen}>
              <SelectTrigger size="sm" className="w-40 text-xs" aria-label="After sending">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {done && <SelectItem value="auto">and leave it {ticket.status}</SelectItem>}
                <SelectItem value="pending">and wait for them</SelectItem>
                <SelectItem value="resolved">and mark resolved</SelectItem>
                <SelectItem value="closed">and close it</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            onClick={send}
            disabled={blocked}
            variant={internal ? 'secondary' : 'default'}
            title="Ctrl/⌘ Enter"
          >
            {uploads.busy ? 'Uploading…' : internal ? 'Save note' : 'Send reply'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Status, priority, category and who has it — editable by whoever triages. */
function Properties({ ticket }: { ticket: TicketRow }) {
  const { me, can } = useMe();
  const update = useUpdateTicket(ticket.id);
  const take = useTakeTicket(ticket.id);
  const manage = can('support.manage');
  const { data: agents } = useAgents(manage);
  const due = dueLabel(ticket);

  const pick = (
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onChange: (v: string) => void,
  ) => (
    <Select value={value} onValueChange={onChange} disabled={!manage}>
      <SelectTrigger size="sm" className="w-40 capitalize" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="capitalize">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Panel title="Ticket" bodyClassName="space-y-2.5 py-3">
      <Row label="Status">
        {manage ? (
          pick('Status', ticket.status, STATUSES.map((s) => ({ value: s, label: s })), (v) => update.mutate({ status: v }))
        ) : (
          <span className="text-sm capitalize">{ticket.status}</span>
        )}
      </Row>
      <Row label="Priority">
        {manage ? (
          pick('Priority', ticket.priority, PRIORITIES.map((p) => ({ value: p, label: p })), (v) => update.mutate({ priority: v }))
        ) : (
          <span className="text-sm capitalize">{ticket.priority}</span>
        )}
      </Row>
      <Row label="Category">
        {manage ? (
          pick(
            'Category',
            ticket.category ?? 'none',
            [{ value: 'none', label: 'None' }, ...SUPPORT_CATEGORIES.map((c) => ({ value: c, label: c }))],
            (v) => update.mutate({ category: v === 'none' ? null : v }),
          )
        ) : (
          <span className="text-sm capitalize">{ticket.category ?? '—'}</span>
        )}
      </Row>
      <Row label="With">
        {manage ? (
          <Select
            value={ticket.assigned_to ?? 'nobody'}
            onValueChange={(v) => update.mutate({ assignedTo: v === 'nobody' ? null : v })}
          >
            <SelectTrigger size="sm" className="w-40" aria-label="With">
              {/* The load helps choose; once chosen, the name is enough. */}
              <SelectValue>
                {!ticket.assigned_to
                  ? 'Nobody yet'
                  : ticket.assigned_to === me?.id
                    ? 'Me'
                    : ticket.assigned_name}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nobody">Nobody yet</SelectItem>
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.id === me?.id ? 'Me' : a.name}
                  <span className="text-xs text-muted-foreground">{a.open} open</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : ticket.assigned_name ? (
          <span className="text-sm">{ticket.assigned_name}</span>
        ) : can('support.reply') ? (
          <Button size="xs" variant="outline" disabled={take.isPending} onClick={() => take.mutate(undefined)}>
            Take it
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">Nobody yet</span>
        )}
      </Row>
      <div className="border-t pt-2">
        <Field
          label="First reply"
          value={
            ticket.first_replied_at ? (
              <span title={new Date(ticket.first_replied_at).toLocaleString()}>
                {when(ticket.first_replied_at)}
              </span>
            ) : due ? (
              <span className={due.late ? 'font-semibold text-destructive' : ''}>{due.text}</span>
            ) : (
              '—'
            )
          }
        />
        <Field label="Opened" value={day(ticket.created_at)} />
        {ticket.resolved_at && <Field label="Resolved" value={day(ticket.resolved_at)} />}
      </div>
      {ticket.rating && (
        <div className="space-y-1 border-t pt-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Customer rated</span>
            <span className="flex items-center gap-1.5" title={ticket.rated_at ? new Date(ticket.rated_at).toLocaleString() : undefined}>
              <Stars value={ticket.rating} />
              <span className="text-sm tabular-nums">{ticket.rating}/5</span>
            </span>
          </div>
          {ticket.rating_comment && (
            <p className="whitespace-pre-wrap wrap-anywhere text-sm text-muted-foreground">“{ticket.rating_comment}”</p>
          )}
        </div>
      )}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Who is asking: enough of Customer 360 to answer well, and the way to the rest. */
function CustomerPanel({ userId, ticketId }: { userId: string; ticketId: string }) {
  const { can } = useMe();
  const { data, isLoading } = useUser(can('users.read') ? userId : '');
  if (!can('users.read')) return null;
  if (isLoading || !data) {
    return (
      <Panel title="Customer">
        <p className="text-xs text-muted-foreground">Loading…</p>
      </Panel>
    );
  }
  const u = data.user;
  const name = u.display_name?.trim() || u.email;
  const others = data.tickets.filter((t) => t.id !== ticketId);

  return (
    <Panel
      title="Customer"
      action={
        <Link href={`/virgo-users/${userId}`} className="text-xs text-primary hover:underline">
          Open
        </Link>
      }
      bodyClassName="space-y-3 py-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      </div>
      {!!data.tags?.length && (
        <div className="flex flex-wrap gap-1">
          {data.tags.map((t) => (
            <TagChip key={t.id} tag={t} />
          ))}
        </div>
      )}
      <div>
        <Field label="Plan" value={<span className="capitalize">{u.plan}</span>} />
        <Field
          label="Storage"
          value={`${bytes(data.storage.bytes)}${data.storage.limitBytes ? ` of ${bytes(data.storage.limitBytes)}` : ''}`}
        />
        <Field label="Joined" value={day(u.created_at)} />
        <Field label="Last seen" value={when(u.last_seen_at)} />
        <Field label="Email confirmed" value={u.email_verified_at ? 'Yes' : 'No'} />
      </div>
      {!!data.pinnedNotes?.length && (
        <div className="space-y-1.5 border-t pt-2.5">
          {data.pinnedNotes.map((n) => (
            <p key={n.id} className="flex gap-1.5 text-xs">
              <Pin className="mt-0.5 size-3 shrink-0 text-warning" />
              <span className="line-clamp-3">{n.body}</span>
            </p>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="border-t pt-2.5">
          <p className="caption mb-1">Their other tickets</p>
          <ul className="space-y-0.5">
            {others.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={`/support/${t.id}`} className="flex items-center gap-2 rounded px-1 py-1 text-xs hover:bg-muted">
                  <span className="min-w-0 flex-1 truncate">{t.subject}</span>
                  <span className={cn('capitalize', t.status === 'open' ? 'text-warning' : 'text-muted-foreground')}>
                    {t.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
