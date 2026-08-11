'use client';

import Link from 'next/link';
import {
  CalendarDays,
  FolderOpen,
  HardDrive,
  Images,
  MessageCircle,
  Plus,
  UserPlus,
  Users,
} from 'lucide-react';
import { AppShell, PageHeader } from '@/components/app-shell';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useUsage } from '@/hooks/useUsage';
import { formatBytes } from '@/api';
import { isEventUpcoming, labelForDateKey, formatTime } from '@/lib/calendar';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomePage() {
  const { profile, user } = useAuth();
  const {
    workspaces,
    isLoading: loadingWorkspaces,
    loadFailed: workspacesFailed,
    refetch: refetchWorkspaces,
  } = useWorkspaces({ limit: 100 });
  const { albums } = useAlbums({ limit: 100 });
  const {
    events,
    isLoading: loadingEvents,
    loadFailed: eventsFailed,
    refetch: refetchEvents,
  } = useScheduleEvents({ limit: 100 });
  const { collaborators } = useCollaborators({ limit: 100 });
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

  const stats = [
    { label: 'Workspaces', value: workspaces.length, icon: FolderOpen, href: '/workspaces' },
    { label: 'Albums', value: albums.length, icon: Images, href: '/workspaces' },
    { label: 'Collaborators', value: collaborators.length, icon: Users, href: '/network' },
    { label: 'Events', value: events.length, icon: CalendarDays, href: '/schedule' },
  ];

  return (
    <AppShell title="Home">
      <PageHeader
        title={`${greeting()}${name ? `, ${name}` : ''}`}
        description="Everything on your plate today."
        actions={
          <Button asChild>
            <Link href="/workspaces?new=1">
              <Plus className="size-4" />
              New workspace
            </Link>
          </Button>
        }
      />

      <div className="mx-auto w-full max-w-6xl px-6 py-6">
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
                        {stat.value.toLocaleString()}
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
                  description="Shoots, edits and deliveries you add will show up here."
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
                        <Badge variant="secondary" className="shrink-0 capitalize">
                          {event.event_type}
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
            <Card>
              <CardContent className="py-5">
                <div className="flex items-center gap-2">
                  <HardDrive className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Storage</h3>
                </div>
                <p className="mt-3 text-2xl font-bold tabular-nums">
                  {formatBytes(storageUsedBytes)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {storageLimitBytes
                    ? `of ${formatBytes(storageLimitBytes)} on ${usage?.plan ?? 'free'}`
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
                <h3 className="text-sm font-semibold">Quick actions</h3>
                <div className="mt-3 flex flex-col gap-2">
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href="/workspaces?new=1">
                      <FolderOpen className="size-4" />
                      New workspace
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href="/schedule?new=1">
                      <CalendarDays className="size-4" />
                      Schedule an event
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" className="justify-start">
                    <Link href="/network">
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
    </AppShell>
  );
}
