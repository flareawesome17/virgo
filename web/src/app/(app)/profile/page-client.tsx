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
  Lock,
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
import { RolePicker } from '@/components/role-picker';
import { PublicProfileCard } from '@/components/public-profile-card';
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

  const EMPTY = {
    displayName: '',
    title: '',
    phone: '',
    website: '',
    location: '',
    bio: '',
    studioName: '',
    socialHandle: '',
    addressLine1: '',
    addressLine2: '',
    addressCity: '',
    addressProvince: '',
    addressPostal: '',
    addressCountry: '',
  };
  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState<string[]>([]);
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
      studioName: profile.studioName ?? '',
      socialHandle: profile.socialHandle ?? '',
      addressLine1: profile.addressLine1 ?? '',
      addressLine2: profile.addressLine2 ?? '',
      addressCity: profile.addressCity ?? '',
      addressProvince: profile.addressProvince ?? '',
      addressPostal: profile.addressPostal ?? '',
      addressCountry: profile.addressCountry ?? '',
    });
    setRoles(profile.roles ?? []);
    setSeeded(true);
  }, [profile, seeded]);

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const dirty =
    seeded &&
    ((Object.keys(EMPTY) as (keyof typeof EMPTY)[]).some(
      (k) => form[k] !== (profile?.[k] ?? ''),
    ) ||
      roles.join(',') !== (profile?.roles ?? []).join(','));

  /*
   * The address is all-or-nothing.
   *
   * Untouched, it is left out of the save entirely — that is what lets the
   * accounts made before it was collected edit the rest of their profile
   * without being made to invent one. Touched, it has to be complete: half an
   * address is worse than none, because it looks filled in.
   */
  const address = {
    addressLine1: form.addressLine1.trim(),
    addressCity: form.addressCity.trim(),
    addressProvince: form.addressProvince.trim(),
    addressCountry: form.addressCountry.trim().toUpperCase(),
  };
  const addressStarted =
    Object.values(address).some(Boolean) ||
    !!form.addressLine2.trim() ||
    !!form.addressPostal.trim();
  const addressMissing = !addressStarted
    ? []
    : [
        !address.addressLine1 && 'a street address',
        !address.addressCity && 'a city or municipality',
        !address.addressProvince && 'a province or region',
        address.addressCountry.length !== 2 && 'a two-letter country code',
      ].filter(Boolean as unknown as (v: unknown) => v is string);

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
        studioName: form.studioName.trim() || null,
        socialHandle: form.socialHandle.trim() || null,
        // Omitted when empty: the API requires at least one, and an empty
        // array would fail the whole save rather than just leaving roles be.
        ...(roles.length > 0 ? { roles } : {}),
        ...(addressStarted
          ? {
              ...address,
              addressLine2: form.addressLine2.trim() || null,
              addressPostal: form.addressPostal.trim() || null,
            }
          : {}),
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
                {/* Both collected at sign-up and both optional there, so they
                    are optional here too — plenty of people freelance under
                    the name on their passport. */}
                <div className="grid gap-2">
                  <Label htmlFor="studioName">Studio name</Label>
                  <Input
                    id="studioName"
                    value={form.studioName}
                    onChange={(e) => set('studioName')(e.target.value)}
                    placeholder="Northlight Studio"
                    maxLength={120}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="socialHandle">Social</Label>
                  <Input
                    id="socialHandle"
                    value={form.socialHandle}
                    onChange={(e) => set('socialHandle')(e.target.value)}
                    placeholder="@yourstudio"
                    maxLength={200}
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

                <div className="grid gap-2 sm:col-span-2">
                  <Label>
                    What you do
                    <span className="ml-1 font-normal text-destructive">·  required</span>
                  </Label>
                  <p className="-mt-1 text-xs text-muted-foreground">
                    This is what people search for in Nearby. Somebody looking to
                    hire a photographer finds you by this and nothing else, so an
                    account with none is invisible to them.
                  </p>
                  <RolePicker selected={roles} onChange={setRoles} />
                  {roles.length === 0 && (
                    <p className="text-xs font-medium text-destructive">
                      Choose at least one.
                    </p>
                  )}
                </div>

                {/* Everything above this line is how you appear to other
                    people. Everything below it is not, and the separator is
                    doing real work — this page is titled "how you appear to
                    collaborators and clients", and a postal address sitting
                    unmarked underneath that reads like a promise to publish
                    it. */}
                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                  <div className="mt-4 flex items-center gap-2">
                    <Lock className="size-3.5 text-muted-foreground" />
                    <Label className="text-sm">Address</Label>
                    <Badge variant="secondary" className="text-[10px]">Private</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Only you can see this. It is never shown on your profile,
                    on a job post, or to anyone you work with.
                  </p>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="addressLine1">Street address</Label>
                      <Input
                        id="addressLine1"
                        value={form.addressLine1}
                        onChange={(e) => set('addressLine1')(e.target.value)}
                        placeholder="123 Rizal Street, Barangay San Roque"
                        autoComplete="address-line1"
                        maxLength={200}
                      />
                    </div>
                    <div className="grid gap-2 sm:col-span-2">
                      <Label htmlFor="addressLine2">
                        Apartment, unit, floor
                        <span className="ml-1 font-normal text-muted-foreground">
                          · optional
                        </span>
                      </Label>
                      <Input
                        id="addressLine2"
                        value={form.addressLine2}
                        onChange={(e) => set('addressLine2')(e.target.value)}
                        autoComplete="address-line2"
                        maxLength={200}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="addressCity">City or municipality</Label>
                      <Input
                        id="addressCity"
                        value={form.addressCity}
                        onChange={(e) => set('addressCity')(e.target.value)}
                        placeholder="Cebu City"
                        autoComplete="address-level2"
                        maxLength={120}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="addressProvince">Province or region</Label>
                      <Input
                        id="addressProvince"
                        value={form.addressProvince}
                        onChange={(e) => set('addressProvince')(e.target.value)}
                        placeholder="Cebu"
                        autoComplete="address-level1"
                        maxLength={120}
                      />
                    </div>
                    {/* Optional on purpose, as at sign-up: plenty of
                        Philippine addresses have no ZIP. */}
                    <div className="grid gap-2">
                      <Label htmlFor="addressPostal">
                        Postal code
                        <span className="ml-1 font-normal text-muted-foreground">
                          · optional
                        </span>
                      </Label>
                      <Input
                        id="addressPostal"
                        value={form.addressPostal}
                        onChange={(e) => set('addressPostal')(e.target.value)}
                        autoComplete="postal-code"
                        maxLength={20}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="addressCountry">Country</Label>
                      <Input
                        id="addressCountry"
                        value={form.addressCountry}
                        onChange={(e) =>
                          set('addressCountry')(e.target.value.toUpperCase())
                        }
                        placeholder="PH"
                        autoComplete="country"
                        maxLength={2}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-3">
                <Button
                  onClick={save}
                  // Roles are required, so saving with none would be rejected
                  // by the API anyway — better to say so before the round trip.
                  disabled={
                    !dirty ||
                    roles.length === 0 ||
                    addressMissing.length > 0 ||
                    updateProfile.isPending
                  }
                >
                  {updateProfile.isPending && <Loader2 className="size-4 animate-spin" />}
                  Save changes
                </Button>
                {addressMissing.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    The address still needs {addressMissing.join(', ')}.
                  </p>
                ) : dirty ? (
                  <p className="text-xs text-muted-foreground">Unsaved changes</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <PublicProfileCard />
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
