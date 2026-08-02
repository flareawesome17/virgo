'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  CalendarDays,
  CreditCard,
  FolderOpen,
  HardDrive,
  Images,
  Loader2,
  LogOut,
  Settings,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, PageHeader } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useUsage } from '@/hooks/useUsage';
import { useOnline } from '@/hooks/useOnline';
import { formatBytes } from '@/api';

/**
 * Profile — who you are and what you have.
 *
 * The app's preferences live in Settings; this page carries identity, the
 * numbers, and the account exits. Same split as the mobile app, so the two do
 * not disagree about where anything lives.
 */
export default function ProfilePage() {
  const { user, profile, updateProfile, signOut } = useAuth();
  const online = useOnline();

  const { workspaces } = useWorkspaces({ limit: 100 });
  const { albums } = useAlbums({ limit: 100 });
  const { events } = useScheduleEvents({ limit: 100 });
  const { collaborators } = useCollaborators({ limit: 100 });
  const { storageUsedBytes, usage } = useUsage();

  const [form, setForm] = useState({
    displayName: '',
    title: '',
    phone: '',
    website: '',
    location: '',
    bio: '',
  });
  const [seeded, setSeeded] = useState(false);

  // Seeded once the profile lands, not on every render: re-seeding would wipe
  // whatever the user was midway through typing on a background refetch.
  useEffect(() => {
    if (seeded || !profile) return;
    setForm({
      displayName: profile.displayName ?? '',
      title: profile.title ?? '',
      phone: profile.phone ?? '',
      website: profile.website ?? '',
      location: profile.location ?? '',
      bio: profile.bio ?? '',
    });
    setSeeded(true);
  }, [profile, seeded]);

  const dirty =
    seeded &&
    (form.displayName !== (profile?.displayName ?? '') ||
      form.title !== (profile?.title ?? '') ||
      form.phone !== (profile?.phone ?? '') ||
      form.website !== (profile?.website ?? '') ||
      form.location !== (profile?.location ?? '') ||
      form.bio !== (profile?.bio ?? ''));

  const save = () => {
    updateProfile.mutate(
      {
        // Empty means cleared, which the API models as null rather than "".
        displayName: form.displayName.trim() || null,
        title: form.title.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        location: form.location.trim() || null,
        bio: form.bio.trim() || null,
      },
      {
        onSuccess: () => toast.success('Profile saved'),
        onError: (err: Error) => toast.error('Could not save', { description: err.message }),
      },
    );
  };

  const stats = [
    { label: 'Workspaces', value: workspaces.length, icon: FolderOpen, href: '/workspaces' },
    { label: 'Albums', value: albums.length, icon: Images, href: '/workspaces' },
    { label: 'Collaborators', value: collaborators.length, icon: Users, href: '/network' },
    { label: 'Events', value: events.length, icon: CalendarDays, href: '/schedule' },
  ];

  const initials = (profile?.displayName || user?.email || '?').slice(0, 2).toUpperCase();

  return (
    <AppShell title="Profile">
      <PageHeader
        title="Profile"
        description="How you appear to collaborators and clients"
        actions={
          <Button asChild variant="outline">
            <Link href="/settings">
              <Settings className="size-4" />
              Settings
            </Link>
          </Button>
        }
      />

      <div className="mx-auto grid w-full max-w-5xl gap-6 px-6 py-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <Avatar className="size-16">
                  {profile?.avatarUrl && <AvatarImage src={profile.avatarUrl} alt="" />}
                  <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">
                    {profile?.displayName || 'Add your name'}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1.5">
                      <HardDrive className="size-3" />
                      {formatBytes(storageUsedBytes)}
                      {usage?.plan ? ` · ${usage.plan}` : ''}
                    </Badge>
                    <Badge
                      variant="secondary"
                      className={online ? 'gap-1.5 text-success' : 'gap-1.5 text-destructive'}
                    >
                      {online ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
                      {online ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="displayName">Name</Label>
                  <Input
                    id="displayName"
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    placeholder="Your name"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Wedding photographer"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    placeholder="yourstudio.com"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="Manila, Philippines"
                  />
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="A line or two about your work"
                    rows={3}
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Button onClick={save} disabled={!dirty || updateProfile.isPending}>
                  {updateProfile.isPending && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
                {dirty && (
                  <p className="text-xs text-muted-foreground">Unsaved changes</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <Link key={stat.label} href={stat.href}>
                  <Card className="transition-colors hover:border-primary/40">
                    <CardContent className="py-4 text-center">
                      <Icon className="mx-auto size-4 text-primary" />
                      <p className="mt-2 text-lg font-bold tabular-nums">{stat.value}</p>
                      <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>

          <Card>
            <CardContent className="flex flex-col gap-2 py-5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Account
              </p>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/settings/storage">
                  <CreditCard className="size-4" />
                  Storage &amp; plan
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-start">
                <Link href="/settings">
                  <Settings className="size-4" />
                  Settings
                </Link>
              </Button>
              <Button
                variant="outline"
                className="justify-start text-destructive hover:text-destructive"
                disabled={signOut.isPending}
                onClick={() => signOut.mutate()}
              >
                {signOut.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <LogOut className="size-4" />
                )}
                Sign out
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
