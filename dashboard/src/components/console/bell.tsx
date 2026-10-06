'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Popover } from 'radix-ui';
import { Bell, Inbox, MessageCircleReply, UserRoundCheck } from 'lucide-react';
import type { StaffNotification } from '@/api/console';
import { useMarkNotificationsRead, useStaffNotifications } from '@/hooks/useConsole';
import { when } from './primitives';
import { cn } from '@/lib/utils';

const ICON = {
  'ticket.new': Inbox,
  'ticket.assigned': UserRoundCheck,
  'ticket.reply': MessageCircleReply,
} as const;

/**
 * The console's bell: a ticket came in, one was handed to you, or a customer
 * wrote back. Opening one marks it read and goes to the ticket.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useStaffNotifications();
  const mark = useMarkNotificationsRead();
  const unread = data?.unread ?? 0;

  function go(n: StaffNotification) {
    if (!n.read_at) mark.mutate([n.id]);
    setOpen(false);
    if (n.ticket_id) router.push(`/support/${n.ticket_id}`);
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
          className="relative grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bell className="size-4" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex h-10 items-center justify-between border-b px-3">
            <p className="caption">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => mark.mutate(undefined)}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && (
              <li className="px-3 py-8 text-center text-sm text-muted-foreground">Nothing yet.</li>
            )}
            {data?.items.map((n) => {
              const Icon = ICON[n.kind] ?? Inbox;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => go(n)}
                    className={cn(
                      'flex w-full items-start gap-2.5 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/60',
                      !n.read_at && 'bg-primary/5',
                    )}
                  >
                    <Icon className={cn('mt-0.5 size-4 shrink-0', n.read_at ? 'text-muted-foreground' : 'text-primary')} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm', !n.read_at && 'font-medium')}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(n.created_at)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
