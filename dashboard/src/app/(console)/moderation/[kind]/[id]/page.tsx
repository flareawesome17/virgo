'use client';
/* eslint-disable @next/next/no-img-element -- signed thumbnails, already the size they are drawn at */

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowLeft, EyeOff, Quote } from 'lucide-react';
import type { CaseAction, CaseKind, CaseReport, ModerationCaseDetail } from '@/api/console';
import {
  useMe,
  useModerationCase,
  usePresence,
  useResolveCase,
  useSetJobHidden,
  useSetShowcaseHidden,
} from '@/hooks/useConsole';
import { PresenceBar } from '@/components/console/presence';
import { DataState, Field, Panel, StatusDot, day, num, when } from '@/components/console/primitives';
import { useRecordTab } from '@/components/console/record-tabs';
import {
  KIND_LABEL,
  RESOLUTION_LABEL,
  SOURCE_LABEL,
  reasonLabel,
} from '@/components/console/moderation';
import { Evidence, RemoveCommentDialog, StarterPicker } from '@/components/console/moderation-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const KINDS: CaseKind[] = ['user', 'job', 'showcase'];

/**
 * One case: what was reported and every report about it on the left; who it
 * is about, their record and the decision on the right.
 */
export default function CasePage() {
  const params = useParams<{ kind: string; id: string }>();
  const kind = (KINDS.includes(params.kind as CaseKind) ? params.kind : 'user') as CaseKind;
  const { data, isLoading, isError, refetch } = useModerationCase(kind, params.id);
  const open = data?.reports.filter((r) => r.status === 'open').length ?? 0;
  const title =
    data && (kind === 'user' ? data.subject.name : (data.target?.title ?? 'Untitled'));

  useRecordTab({ href: `/moderation/${kind}/${params.id}`, kind: 'case', title: title ?? undefined });
  // Two people deciding one case at once would warn somebody twice.
  const others = usePresence('case', `${kind}:${params.id}`);

  return (
    <>
      <Link
        href="/moderation"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Moderation
      </Link>
      <DataState isLoading={isLoading} isError={isError} isEmpty={false} onRetry={() => void refetch()}>
        {data && (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-4">
              <header>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
                  <Badge variant="outline">{KIND_LABEL[kind]}</Badge>
                  {open > 0 ? (
                    <Badge variant="destructive">
                      {open} open report{open === 1 ? '' : 's'}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Decided</Badge>
                  )}
                  {data.target?.hidden_at && (
                    <Badge variant="secondary" className="gap-1">
                      <EyeOff className="size-3" />
                      Hidden
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {kind === 'user' ? data.subject.email : `by ${data.subject.name}`} · first reported{' '}
                  {when(data.reports[data.reports.length - 1]?.created_at)}
                </p>
              </header>

              <PresenceBar others={others} />

              {data.target && <Target kind={kind} target={data.target} />}

              <Panel title={`Reports (${data.reports.length})`} bodyClassName="divide-y p-0">
                {data.reports.map((r) => (
                  <ReportRow key={r.id} report={r} />
                ))}
              </Panel>
            </div>

            <aside className="space-y-4">
              <SubjectPanel data={data} />
              <Decide kind={kind} id={params.id} data={data} open={open} />
              <History data={data} />
            </aside>
          </div>
        )}
      </DataState>
    </>
  );
}

/** The post or job as a moderator needs to see it, with the way to put it back. */
function Target({ kind, target }: { kind: CaseKind; target: NonNullable<ModerationCaseDetail['target']> }) {
  const { can } = useMe();
  const setShowcaseHidden = useSetShowcaseHidden();
  const setJobHidden = useSetJobHidden();
  const [removing, setRemoving] = useState<{ id: string; body: string; author_name: string } | null>(null);
  const toggle = () =>
    (kind === 'job' ? setJobHidden : setShowcaseHidden).mutate({ id: target.id, hidden: !target.hidden_at });

  return (
    <Panel
      title={kind === 'job' ? 'The job post' : 'The post'}
      action={
        can('content.moderate') && target.hidden_at ? (
          <Button size="xs" variant="outline" onClick={toggle}>
            Put it back
          </Button>
        ) : undefined
      }
    >
      {kind === 'showcase' && (target.pieces?.length ?? 0) > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {target.pieces!.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border bg-muted">
              <img src={url} alt="" className="h-28 w-auto max-w-[12rem] object-cover" />
            </a>
          ))}
        </div>
      )}
      {(target.caption || target.description) && (
        <p className="whitespace-pre-wrap wrap-anywhere text-sm">{target.caption ?? target.description}</p>
      )}
      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        {target.status && <Field label="Status" value={<span className="capitalize">{target.status}</span>} />}
        <Field label={kind === 'job' ? 'Posted' : 'Published'} value={day(target.published_at ?? target.created_at)} />
        {target.hidden_at && <Field label="Hidden" value={day(target.hidden_at)} />}
      </div>

      {kind === 'showcase' && (
        <div className="mt-4 border-t pt-3">
          <p className="caption mb-2">Latest comments ({num(target.comment_count ?? 0)})</p>
          {target.comments?.length ? (
            <ul className="space-y-2">
              {target.comments.map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <Link href={`/virgo-users/${c.author_id}`} className="font-medium hover:underline">
                      {c.author_name}
                    </Link>{' '}
                    <span className="whitespace-pre-wrap wrap-anywhere">{c.body}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">{when(c.created_at)}</span>
                  </div>
                  {can('content.moderate') && (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="shrink-0 text-destructive"
                      onClick={() => setRemoving({ id: c.id, body: c.body, author_name: c.author_name })}
                    >
                      Remove
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No comments.</p>
          )}
        </div>
      )}
      <RemoveCommentDialog comment={removing} onClose={() => setRemoving(null)} />
    </Panel>
  );
}

function ReportRow({ report: r }: { report: CaseReport }) {
  const { can } = useMe();
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Badge variant="secondary">{reasonLabel(r.reason)}</Badge>
        {r.reporter_id ? (
          <Link href={`/virgo-users/${r.reporter_id}`} className="font-medium hover:underline">
            {r.reporter_name}
          </Link>
        ) : (
          <span className="text-muted-foreground">a deleted account</span>
        )}
        {r.source && <span className="text-muted-foreground">from {SOURCE_LABEL[r.source] ?? r.source}</span>}
        <span className="text-xs text-muted-foreground" title={new Date(r.created_at).toLocaleString()}>
          {when(r.created_at)}
        </span>
        <span className="ml-auto">
          {r.status === 'open' ? (
            <StatusDot tone="warn">Open</StatusDot>
          ) : (
            <StatusDot tone={r.status === 'dismissed' ? 'muted' : 'ok'}>
              {RESOLUTION_LABEL[r.resolution ?? ''] ?? r.status}
              {r.resolved_by_name ? ` by ${r.resolved_by_name}` : ''}
            </StatusDot>
          )}
        </span>
      </div>
      {r.note && (
        <p className="mt-1.5 flex gap-1.5 text-sm text-muted-foreground">
          <Quote className="mt-0.5 size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap wrap-anywhere">{r.note}</span>
        </p>
      )}
      {r.resolution_note && (
        <p className="mt-1 text-xs text-muted-foreground">Staff note: {r.resolution_note}</p>
      )}
      {r.evidence > 0 && <Evidence reportId={r.id} count={r.evidence} allowed={can('content.evidence')} />}
    </div>
  );
}

/** Who the case is about, and the signals that say how seriously to take it. */
function SubjectPanel({ data }: { data: ModerationCaseDetail }) {
  const s = data.subject;
  const g = data.signals;
  return (
    <Panel
      title={data.kind === 'user' ? 'The person' : 'Who posted it'}
      action={
        s.id ? (
          <Link href={`/virgo-users/${s.id}`} className="text-xs text-primary hover:underline">
            Open account
          </Link>
        ) : undefined
      }
    >
      <p className="font-medium">{s.name}</p>
      {s.email && <p className="text-sm text-muted-foreground">{s.email}</p>}
      {s.suspended_at && (
        <p className="mt-1">
          <StatusDot tone="danger">Suspended {day(s.suspended_at)}</StatusDot>
        </p>
      )}
      {g && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 border-t pt-2">
          <Field label="Strikes" value={<span className={cn(g.strikes > 0 && 'font-semibold text-destructive')}>{num(g.strikes)}</span>} />
          <Field label="Blocked by" value={num(g.blocked_by)} />
          <Field label="Other open cases" value={num(g.other_open_cases)} />
          <Field label="Reports ever" value={num(g.reports_ever)} />
        </div>
      )}
      {s.created_at && (
        <div className="mt-1 grid grid-cols-2 gap-x-4">
          <Field label="Joined" value={day(s.created_at)} />
          <Field label="Last seen" value={when(s.last_seen_at)} />
        </div>
      )}
    </Panel>
  );
}

const ACTION_LABEL: Record<CaseAction, string> = {
  dismiss: 'Dismiss',
  hide: 'Hide it',
  warn: 'Warn',
  suspend: 'Suspend',
};

const ACTION_HINT: Record<CaseAction, string> = {
  dismiss: 'Nothing was wrong. Nobody is told; the reports close.',
  hide: 'Takes it off the app. Write a message to tell them why.',
  warn: 'A message from the safety team in their support inbox, and by email. They can answer it.',
  suspend: 'Signs them out everywhere and keeps them out until it is lifted.',
};

/** The decision: one action, what to tell them, and a note for staff. */
function Decide({
  kind,
  id,
  data,
  open,
}: {
  kind: CaseKind;
  id: string;
  data: ModerationCaseDetail;
  open: number;
}) {
  const { can } = useMe();
  const resolve = useResolveCase(kind, id);
  const [action, setAction] = useState<CaseAction | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [notify, setNotify] = useState(true);
  const [confirming, setConfirming] = useState(false);
  // What the confirmation is about, kept apart from the form: the form resets
  // on success while the dialog is still fading out, and its words must not
  // change under the reader.
  const [asked, setAsked] = useState<{ action: CaseAction; warns: boolean }>({ action: 'hide', warns: false });

  if (!can('content.moderate')) return null;

  const actions: CaseAction[] = [
    'dismiss',
    ...(kind !== 'user' && !data.target?.hidden_at ? (['hide'] as const) : []),
    'warn',
    ...(can('users.disable') && data.subject.id && !data.subject.suspended_at ? (['suspend'] as const) : []),
  ];
  const needsMessage = action === 'warn';
  const takesMessage = action !== null && action !== 'dismiss';
  const ready = action !== null && (!needsMessage || message.trim().length > 0);

  const submit = () =>
    resolve.mutate(
      {
        action: action!,
        message: takesMessage ? message.trim() || undefined : undefined,
        note: note.trim() || undefined,
        ...(action === 'suspend' ? { notify } : {}),
      },
      {
        onSuccess: () => {
          setAction(null);
          setMessage('');
          setNote('');
          setConfirming(false);
        },
      },
    );

  return (
    <Panel title={open > 0 ? `Decide (${open} open)` : 'Decide again'} bodyClassName="space-y-3">
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Decision">
        {actions.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={action === a}
            onClick={() => setAction(a)}
            className={cn(
              'rounded-md border px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-muted',
              action === a && 'border-primary bg-primary/5',
              a === 'suspend' && 'text-destructive',
            )}
          >
            {ACTION_LABEL[a]}
          </button>
        ))}
      </div>
      {action && <p className="text-xs text-muted-foreground">{ACTION_HINT[action]}</p>}

      {takesMessage && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="case-message">{needsMessage ? 'What to tell them' : 'Tell them why (optional)'}</Label>
            <StarterPicker onPick={setMessage} />
          </div>
          <Textarea
            id="case-message"
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
            placeholder="In your own words, to this person about this. They can reply."
          />
        </div>
      )}
      {action === 'suspend' && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="size-4 accent-primary" />
          Email them the suspension notice
        </label>
      )}
      {action && (
        <div className="space-y-1.5">
          <Label htmlFor="case-note">Note for staff (optional)</Label>
          <Textarea id="case-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </div>
      )}

      <Button
        className="w-full"
        variant={action === 'suspend' ? 'destructive' : 'default'}
        disabled={!ready || resolve.isPending}
        onClick={() => {
          if (action === 'suspend' || action === 'hide') {
            setAsked({ action, warns: message.trim().length > 0 });
            setConfirming(true);
          } else submit();
        }}
      >
        {action ? `${ACTION_LABEL[action]}${open > 0 ? ` and close ${open}` : ''}` : 'Choose a decision'}
      </Button>

      <Dialog open={confirming} onOpenChange={(o: boolean) => !resolve.isPending && setConfirming(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {asked.action === 'suspend' ? `Suspend ${data.subject.name}?` : 'Take it off the app?'}
            </DialogTitle>
            <DialogDescription>
              {asked.action === 'suspend'
                ? 'They are signed out everywhere at once and cannot sign in until someone lifts it from their account page.'
                : 'Nobody but its author will see it until someone puts it back.'}
              {asked.warns ? ' They will get your message.' : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={resolve.isPending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              variant={asked.action === 'suspend' ? 'destructive' : 'default'}
              disabled={resolve.isPending}
              onClick={submit}
            >
              {ACTION_LABEL[asked.action]}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

/** What moderation decided about this person before, newest first. */
function History({ data }: { data: ModerationCaseDetail }) {
  if (!data.subject.id) return null;
  return (
    <Panel title="Their record" bodyClassName="p-0">
      {data.history.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">Nothing decided about them before.</p>
      ) : (
        <ol className="divide-y">
          {data.history.map((h) => (
            <li key={h.id} className="px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className={cn('font-medium', h.action !== 'dismiss' && 'text-destructive')}>
                  {RESOLUTION_LABEL[h.action] ?? h.action}
                </span>
                <span className="truncate text-muted-foreground">{h.target_label ?? KIND_LABEL[h.target_type as CaseKind] ?? ''}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{when(h.created_at)}</span>
              </div>
              {h.snapshot?.body && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">“{h.snapshot.body}”</p>
              )}
              {h.message && (
                <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">Told them: {h.message}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {h.admin_name ?? 'Staff'}
                {h.ticket_id && (
                  <>
                    {' · '}
                    <Link href={`/support/${h.ticket_id}`} className="text-primary hover:underline">
                      the conversation
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
