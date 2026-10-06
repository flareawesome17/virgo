import type { Ticket } from '@/api/console';

/** Urgency reads faster as colour than as a word in a column. */
export const PRIORITY_VARIANT: Record<string, 'destructive' | 'default' | 'secondary' | 'outline'> = {
  urgent: 'destructive',
  high: 'default',
  normal: 'secondary',
  low: 'outline',
};

export const STATUS_TONE = {
  open: 'warn',
  pending: 'info',
  resolved: 'ok',
  closed: 'muted',
} as const;

/** "in 3h", "2h late" — how a ticket stands against its first-reply target. */
export function dueLabel(
  t: Pick<Ticket, 'due_at' | 'first_replied_at' | 'status'>,
): { text: string; late: boolean } | null {
  if (!t.due_at || t.first_replied_at || (t.status !== 'open' && t.status !== 'pending')) return null;
  const ms = new Date(t.due_at).getTime() - Date.now();
  const hours = Math.abs(ms) / 3_600_000;
  const span =
    hours < 1
      ? `${Math.max(1, Math.round(hours * 60))}m`
      : hours < 48
        ? `${Math.round(hours)}h`
        : `${Math.round(hours / 24)}d`;
  return ms < 0 ? { text: `${span} late`, late: true } : { text: `in ${span}`, late: false };
}

/**
 * Fills a canned reply's placeholders for one ticket. Unknown ones are left as
 * they are, so a typo shows up in the box rather than vanishing.
 */
export function fillMacro(
  body: string,
  values: { name: string; agent: string; subject: string },
): string {
  return body.replace(/\{\{\s*(name|agent|subject)\s*\}\}/g, (_, key: keyof typeof values) => values[key]);
}
