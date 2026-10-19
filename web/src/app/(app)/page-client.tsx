'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CalendarDays,
  FolderOpen,
  HardDrive,
  Images,
  MessageCircle,
  UserPlus,
  Users,
} from 'lucide-react';
import { Screen } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useScheduleEventRange, useScheduleEvents } from '@/hooks/useScheduleEvents';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useUsage } from '@/hooks/useUsage';
import { formatBytes } from '@/api';
import { MoneyCard } from '@/components/money/money-card';
import {
  dateToKey,
  eventTypeLabel,
  formatTime,
  isEventUpcoming,
  labelForDateKey,
  todayKey,
} from '@/lib/calendar';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { profile, user } = useAuth();
  const {
    total: workspaceTotal,
    data: workspacesData,
    isLoading: loadingWorkspaces,
    loadFailed: workspacesFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces({ limit: 100 });
  const { albums, total: albumTotal, data: albumsData } = useAlbums({ limit: 100 });
  /*
   * The next 60 days, not the account's 100 oldest events. Upcoming was cut
   * from that list, so an account with a past behind it was told "Nothing
   * scheduled" with a week of shoots ahead. The count is the server's total.
   */
  const [soonWindow] = useState(() => {
    const end = new Date();
    end.setDate(end.getDate() + 60);
    return { from: todayKey(), to: dateToKey(end) };
  });
  const {
    events,
    isLoading: loadingEvents,
    loadFailed: eventsFailed,
    refetch: refetchEvents,
  } = useScheduleEventRange(soonWindow.from, soonWindow.to);
  const { total: eventTotal, data: eventsData } = useScheduleEvents({ limit: 1 });
  const {
    total: collaboratorTotal,
    data: collaboratorsData,
  } = useCollaborators({ limit: 100 });
  const { storageUsedBytes, storageLimitBytes, storageFraction, usage } = useUsage();

  const name = profile?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';

  const now = new Date();
  const upcoming = events
    .filter((e) => isEventUpcoming(e.event_date, e.event_time, now))
    .sort((a, b) =>
      `${a.event_date}${a.event_time ?? ''}`.localeCompare(
        `${b.event_date}${b.event_time ?? ''}`,
      ),
    )
    .slice(0, 5);

  const recentAlbums = albums.slice(0, 6);

  // Null until each list has arrived, and drawn as a dash: a 0 read as "you
  // have none" for the second or two before the real number came in.
  // The server's totals, not the length of a list capped at 100.
  const stats = [
    { label: 'Workspaces', value: workspacesData ? workspaceTotal : null, icon: FolderOpen, href: '/workspaces' },
    { label: 'Albums', value: albumsData ? albumTotal : null, icon: Images, href: '/albums' },
    { label: 'Collaborators', value: collaboratorsData ? collaboratorTotal : null, icon: Users, href: '/people' },
    { label: 'Events', value: eventsData ? eventTotal : null, icon: CalendarDays, href: '/schedule' },
  ];

  return (
    <Screen title="Dashboard">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
        {/* The greeting is the page's own; the bar carries its name. The
            "New workspace" button that sat here is the bar's Create now. */}
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight">
            {`${greeting()}${name ? `, ${name}` : ''}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Everything on your plate today.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link key={stat.label} href={stat.href}>
                <Card className="transition-colors hover:border-primary/40">
                  <CardContent className="flex items-center gap-3 py-4">
                    <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xl font-bold leading-none tabular-nums">
                        {stat.value === null ? '—' : stat.value.toLocaleString()}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Upcoming */}
          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Upcoming
              </h2>
              <Button asChild variant="ghost" size="sm">
                <Link href="/schedule">View schedule</Link>
              </Button>
            </div>

            {loadingEvents && events.length === 0 ? (
              <ListSkeleton rows={3} />
            ) : eventsFailed && events.length === 0 ? (
              <Card>
                <ErrorState message="Could not load your schedule." onRetry={() => refetchEvents()} />
              </Card>
            ) : upcoming.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title="Nothing scheduled"
                  description="Events, edits and deliveries you add will show up here."
                  action={
                    <Button asChild size="sm">
                      <Link href="/schedule?new=1">Add an event</Link>
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map((event) => (
                  <Link key={event.id} href={`/schedule?date=${event.event_date}`}>
                    <Card className="transition-colors hover:border-primary/40">
                      <CardContent className="flex items-center gap-4 py-3.5">
                        <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-center">
                          <CalendarDays className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{event.title}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {labelForDateKey(event.event_date)}
                            {event.event_time ? ` · ${formatTime(event.event_time)}` : ''}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {eventTypeLabel(event)}
                        </Badge>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {/* Recent albums */}
            <div className="mb-3 mt-8 flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Recent albums
              </h2>
            </div>

            {loadingWorkspaces && albums.length === 0 ? (
              <ListSkeleton rows={2} />
            ) : workspacesFailed && albums.length === 0 ? (
              <Card>
                <ErrorState message="Could not load your albums." onRetry={() => refetchWorkspaces()} />
              </Card>
            ) : recentAlbums.length === 0 ? (
              <Card>
                <EmptyState
                  icon={Images}
                  title="No albums yet"
                  description="Create a workspace, then add an album to start uploading."
                  action={
                    <Button asChild size="sm">
                      <Link href="/workspaces">Go to workspaces</Link>
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentAlbums.map((album) => (
                  <Link key={album.id} href={`/albums/${album.id}`}>
                    <Card className="overflow-hidden py-0 transition-colors hover:border-primary/40">
                      <div className="aspect-[4/3] bg-muted">
                        {album.cover_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={album.cover_url}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="grid size-full place-items-center">
                            <Images className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold">{album.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {album.item_count ?? 0} item
                          {(album.item_count ?? 0) === 1 ? '' : 's'}
                        </p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Side rail */}
          <aside className="flex flex-col gap-6">
            <MoneyCard />

            <Card>
              <CardContent className="py-5">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Storage</h3>
                </div>
                {/* A dash until the reading arrives. "0 B used" is a real
                    answer, and it was being given before there was one. */}
                <p className="mt-3 text-2xl font-bold tabular-nums">
                  {usage ? formatBytes(storageUsedBytes) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {storageLimitBytes
                    ? // Not "on free" once a reward has raised the ceiling above
                      // what the plan gives — see the storage screen.
                      `of ${formatBytes(storageLimitBytes)}${
                        usage?.bonus?.storageBytes
                          ? ' with rewards'
                          : ` on ${usage?.plan ?? 'free'}`
                      }`
                    : 'used'}
                </p>
                {storageLimitBytes ? (
                  <Progress value={storageFraction * 100} className="mt-3 h-1.5" />
                ) : null}
                <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                  <Link href="/settings/storage">Manage storage</Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="py-5">
                {/* Making things is the bar's Create, as on the phone, which
                    dropped its own quick-create row; these two are ways to
                    other people, which Create does not do. */}
                <h3 className="text-sm font-semibold">Quick actions</h3>
                <div className="mt-3 flex flex-col gap-2">
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href="/people">
                      <UserPlus className="size-4" />
                      Find collaborators
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href="/chat">
                      <MessageCircle className="size-4" />
                      Open chat
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </aside>
        </div>
      </div>
    </Screen>
  );
}
