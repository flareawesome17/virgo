'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  CalendarDays,
  Camera,
  FolderOpen,
  HardDrive,
  Images,
  Loader2,
  Lock,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader, Screen } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateProfileFlags } from '@/hooks/useProfile';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAlbums } from '@/hooks/useAlbums';
import { useScheduleEvents } from '@/hooks/useScheduleEvents';
import { useCollaborators } from '@/hooks/useCollaborators';
import { useUsage } from '@/hooks/useUsage';
import { useOnline } from '@/hooks/useOnline';
import { RolePicker } from '@/components/role-picker';
import { LocationField } from '@/components/location-field';
import { PublicProfileCard } from '@/components/public-profile-card';
import { formatBytes, storageApi, titleFromRoles, type AuthUser } from '@/api';
import { cn } from '@/lib/utils';
import { useDiscardGuard } from '@/lib/discard-guard';
import { AVATAR_MAX_EDGE, resizeImage } from '@/lib/image';

const EMPTY = {
  displayName: '',
  title: '',
  phone: '',
  website: '',
  bio: '',
  studioName: '',
  socialHandle: '',
  addressLine1: '',
  addressCity: '',
  addressProvince: '',
  addressPostal: '',
  addressCountry: '',
};

/** The API's limit on the street line. */
const STREET_MAX = 200;

/**
 * The form as a saved profile fills it.
 *
 * Nothing asks for a second address line any more, so one the account
 * already has is folded into the street address — visible and editable,
 * rather than kept in the row where nobody can see it. Only when the two
 * would not fit on one line do they stay apart, and `keptLine2` says so.
 *
 * Also the baseline the form is compared with, so a folded address does not
 * read as an unsaved change.
 */
function formFrom(profile: AuthUser): { form: typeof EMPTY; keptLine2: boolean } {
  const folded = [profile.addressLine1, profile.addressLine2]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
  const fits = folded.length <= STREET_MAX;
  return {
    form: {
      displayName: profile.displayName ?? '',
      title: profile.title ?? '',
      phone: profile.phone ?? '',
      website: profile.website ?? '',
      bio: profile.bio ?? '',
      studioName: profile.studioName ?? '',
      socialHandle: profile.socialHandle ?? '',
      addressLine1: fits ? folded : profile.addressLine1 ?? '',
      addressCity: profile.addressCity ?? '',
      addressProvince: profile.addressProvince ?? '',
      addressPostal: profile.addressPostal ?? '',
      addressCountry: profile.addressCountry ?? '',
    },
    keptLine2: !fits,
  };
}

/**
 * Profile — who you are and what you have.
 *
 * The app's preferences live in Settings; this page carries identity, the
 * numbers, and the account exits. Same split as the mobile app, so the two do
 * not disagree about where anything lives.
 */
export default function ProfilePage() {
  const { user, profile, updateProfile } = useAuth();
  const online = useOnline();

  // Counts only, so one row each: the totals are the server's, and the
  // lengths of lists capped at 100 stopped at 100.
  const { total: workspaceTotal } = useWorkspaces({ limit: 1 });
  const { total: albumTotal } = useAlbums({ limit: 1 });
  const { total: eventTotal } = useScheduleEvents({ limit: 1 });
  const { total: collaboratorTotal } = useCollaborators({ limit: 1 });
  const { storageUsedBytes, usage } = useUsage();

  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  /**
   * Uploads a picture and saves the URL it came back with.
   *
   * `storageApi.uploadFile` directly rather than the useUpload hook: that hook
   * models an album batch — many files, per-file progress, and it discards the
   * result. An avatar is one file whose whole point is the URL at the end.
   *
   * The avatars bucket is the public one, so what comes back is a durable
   * address rather than a signed URL that expires in an hour. That matters
   * because this value is *stored* — on the user row, and denormalised onto
   * friends and collaborators — so a URL that stopped resolving would leave
   * broken images scattered across other people's screens.
   */
  const changeAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('That is not an image', {
        description: 'Pick a JPEG, PNG or WebP.',
      });
      return;
    }
    // 8 MB. The server enforces the real quota; this is here so somebody who
    // picks a 40 MB raw export is told immediately rather than after a long
    // upload that fails at the end.
    if (file.size > 8 * 1024 * 1024) {
      toast.error('That image is too large', {
        description: 'Profile pictures are limited to 8 MB.',
      });
      return;
    }

    setUploadingAvatar(true);
    try {
      // Scaled here so a 12 MP phone photo does not cross the connection at
      // full size. The server resizes avatars on confirm regardless, so this
      // is bandwidth, not correctness — and it returns the original file
      // unchanged if the browser cannot do it.
      const scaled = await resizeImage(file, AVATAR_MAX_EDGE);
      const uploaded = await storageApi.uploadFile(scaled, { scope: 'avatars' });
      if (!uploaded.publicUrl) {
        // Only happens when CDN_BASE_URL is unset, which makes the avatars
        // bucket unreachable by a durable URL. Worth saying plainly — the
        // upload did work, there is simply nowhere to point at it from.
        toast.error('Uploaded, but it cannot be served', {
          description: 'No public URL is configured for the avatars bucket.',
        });
        return;
      }
      await updateProfile.mutateAsync({ avatarUrl: uploaded.publicUrl });
      toast.success('Profile picture updated');
    } catch (err) {
      toast.error('Could not update your picture', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const [form, setForm] = useState(EMPTY);
  const [roles, setRoles] = useState<string[]>([]);
  const [seeded, setSeeded] = useState(false);

  /*
   * Whether the Title field is still tracking the roles.
   *
   * True until somebody types their own, and re-decided when the profile
   * loads — see the seeding below.
   */
  const [titleFollowsRoles, setTitleFollowsRoles] = useState(true);

  // Seeded once the profile lands, not on every render: re-seeding would wipe
  // whatever the user was midway through typing on a background refetch.
  // During render rather than in an effect, so a profile that has already
  // arrived is never painted as a row of empty fields first.
  if (!seeded && profile) {
    setSeeded(true);
    setForm(formFrom(profile).form);
    setRoles(profile.roles ?? []);

    /*
     * Does the saved title look like one the roles produced?
     *
     * If it does — or there is none — the field keeps tracking the roles, so
     * adding Videographer later updates it. If it is anything else, somebody
     * wrote it deliberately and it is theirs to keep: changing a role must not
     * silently rewrite "Wedding & lifestyle photographer".
     */
    const saved = (profile.title ?? '').trim();
    setTitleFollowsRoles(
      saved === '' || saved === titleFromRoles(profile.roles ?? []),
    );
  }

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** The title the chosen roles imply — "Photographer & Videographer". */
  const derivedTitle = titleFromRoles(roles);

  /*
   * The title follows the roles until somebody writes their own.
   *
   * Leaving it blank is the common case, and a profile with no title reads as
   * unfinished when the person has already said exactly what they do one field
   * below. So picking Photographer and Videographer fills in "Photographer &
   * Videographer", and changing the roles updates it.
   *
   * It stops following the moment the text is anything other than a title the
   * roles would have produced — including empty, which is somebody deliberately
   * clearing it. Overwriting a hand-written title because a role was added
   * would be worse than leaving it blank in the first place.
   *
   * Derived here rather than written into the form by an effect, so the field
   * never shows a title the roles have already moved on from. `values` is the
   * form as it reads on screen, and what is compared and saved.
   */
  const values = titleFollowsRoles ? { ...form, title: derivedTitle } : form;

  const savedForm = profile ? formFrom(profile) : null;
  const dirty =
    seeded &&
    ((Object.keys(EMPTY) as (keyof typeof EMPTY)[]).some(
      (k) => values[k] !== (savedForm?.form[k] ?? ''),
    ) ||
      roles.join(',') !== (profile?.roles ?? []).join(','));

  // Asks before a reload, a closed tab or a link elsewhere throws away what
  // was typed. Measured from the form as seeded, and again from each save.
  const guard = useDiscardGuard({ values, roles }, seeded);

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
  // A saved address counts as started even once every field is emptied.
  // Empty, it was left out of the save as though untouched, so the old one
  // stayed on the account while the page said "Profile saved".
  const hadAddress = Boolean(profile?.addressLine1);
  const addressStarted =
    hadAddress || Object.values(address).some(Boolean) || !!form.addressPostal.trim();
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
        title: values.title.trim() || null,
        phone: form.phone.trim() || null,
        website: form.website.trim() || null,
        // No location: the API sets it from the address — "Cebu City, Cebu".
        bio: form.bio.trim() || null,
        studioName: form.studioName.trim() || null,
        socialHandle: form.socialHandle.trim() || null,
        // Omitted when empty: the API requires at least one, and an empty
        // array would fail the whole save rather than just leaving roles be.
        ...(roles.length > 0 ? { roles } : {}),
        ...(addressStarted
          ? {
              ...address,
              addressPostal: form.addressPostal.trim() || null,
              // Folded into the street above, so emptied here.
              ...(savedForm?.keptLine2 ? {} : { addressLine2: null }),
            }
          : {}),
      },
      {
        onSuccess: () => {
          guard.markSaved();
          toast.success('Profile saved');
        },
        onError: (err: Error) => toast.error('Could not save', { description: err.message }),
      },
    );
  };

  /*
   * Where the saved address put them in Nearby, said under the city — but
   * only while the city and province on screen are the saved ones, or it
   * would describe an address that is not there any more. Nothing from an
   * API too old to say.
   */
  const addressSaved =
    !!profile?.addressCity &&
    form.addressCity.trim() === profile.addressCity.trim() &&
    form.addressProvince.trim() === (profile.addressProvince ?? '').trim();
  const nearbyHint: { text: string; warn: boolean } | null = !addressSaved
    ? null
    : profile?.addressPlace
      ? { text: `Shown in Nearby as ${profile.addressPlace}.`, warn: false }
      : profile?.addressPlace === null
        ? { text: "We couldn't place this city — check the spelling.", warn: true }
        : null;

  const stats = [
    { label: 'Workspaces', value: workspaceTotal, icon: FolderOpen, href: '/workspaces' },
    { label: 'Albums', value: albumTotal, icon: Images, href: '/albums' },
    { label: 'Collaborators', value: collaboratorTotal, icon: Users, href: '/people' },
    { label: 'Events', value: eventTotal, icon: CalendarDays, href: '/schedule' },
  ];

  const initials = (profile?.displayName || user?.email || '?').slice(0, 2).toUpperCase();

  /*
   * Shown moved while the save is out, then whatever the session holds: on a
   * failure that is the value the server actually has, so nothing needs
   * putting back by hand.
   */
  const flags = useUpdateProfileFlags();
  const pending = flags.isPending ? flags.variables : undefined;
  const availableForBookings =
    pending?.availableForBookings ?? profile?.availableForBookings ?? false;
  const showStudio = pending?.showStudio ?? profile?.showStudio ?? false;
  const savedStudio = profile?.studioName?.trim() || null;
  const saveFlag = (input: { availableForBookings?: boolean; showStudio?: boolean }) => {
    if (flags.isPending) return;
    flags.mutate(input, {
      onError: (err: Error) =>
        toast.error("Couldn't save that setting", { description: err.message }),
    });
  };

  return (
    <Screen title="Profile">
      <PageHeader
        title="Profile"
        description="How you appear to collaborators and clients"
      />

      {/* Inside the settings layout, which places it; the side column waits
          for xl now that the settings list sits beside it. */}
      <div className="grid w-full gap-6 xl:grid-cols-[1fr_16rem]">
        <div className="min-w-0">
          <Card>
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                {/*
                  A label wrapping a hidden file input, not a button.
                  A button cannot open the file picker without scripting a
                  click on a separate input, and a label does it natively —
                  which also gives keyboard and screen-reader behaviour for
                  free.
                */}
                <label
                  className="group relative cursor-pointer rounded-full"
                  aria-label="Change profile picture"
                >
                  <Avatar className="size-16">
                    {profile?.avatarUrl && (
                      <AvatarImage src={profile.avatarUrl} alt="" />
                    )}
                    <AvatarFallback className="bg-primary/15 text-lg font-bold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <span
                    className={cn(
                      'absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white transition-opacity',
                      uploadingAvatar
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
                    )}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <Camera className="size-5" />
                    )}
                  </span>

                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploadingAvatar}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      // Cleared so picking the same file twice still fires a
                      // change event — otherwise a retry after a failure does
                      // nothing at all.
                      e.target.value = '';
                      if (file) void changeAvatar(file);
                    }}
                  />
                </label>
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold">
                    {profile?.displayName || 'Add your name'}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="gap-1.5">
                      <HardDrive className="size-3" />
                      {/* A dash until the reading arrives, not a "0 B". */}
                      {usage ? formatBytes(storageUsedBytes) : '—'}
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
                    value={values.title}
                    onChange={(e) => {
                      // Typing takes ownership of the field; it stops tracking
                      // the roles from here on.
                      setTitleFollowsRoles(false);
                      setForm((f) => ({ ...f, title: e.target.value }));
                    }}
                    placeholder={derivedTitle || 'Wedding photographer'}
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

                {/* Each switch saves the moment it moves, never with the form:
                    an older API refuses a key it does not know with a 400, and
                    inside Save that would lose every other field with it. The
                    web had neither, so someone who only used it could never
                    show a Hire button. */}
                <div className="grid gap-2 sm:col-span-2">
                  <Label>On your profile</Label>
                  <FlagRow
                    id="availableForBookings"
                    title="Available for bookings"
                    detail="Shows a badge and a Hire button on your public profile."
                    checked={availableForBookings}
                    onChange={(next) => saveFlag({ availableForBookings: next })}
                  />
                  {/* Off can always be reached, even with the name cleared: a
                      switch stuck on would publish whatever name is typed next. */}
                  <FlagRow
                    id="showStudio"
                    title="Show studio on profile"
                    detail={
                      savedStudio
                        ? `Shows "${savedStudio}" on your public profile.`
                        : showStudio
                          ? 'Add a studio name above to show it.'
                          : 'Add a studio name above and save, then turn this on.'
                    }
                    checked={showStudio}
                    disabled={!savedStudio && !showStudio}
                    onChange={(next) => saveFlag({ showStudio: next })}
                  />
                </div>

                {/* Everything above this line is how you appear to other
                    people. Below it is the address, and the separator is
                    doing real work — this page is titled "how you appear to
                    collaborators and clients", so it has to say exactly what
                    leaves the address: never the street; the city and
                    province, as your location and your place in Nearby. */}
                <div className="sm:col-span-2">
                  <Separator className="my-2" />
                  <div className="mt-4 flex items-center gap-2">
                    <Lock className="size-3.5 text-muted-foreground" />
                    <Label className="text-sm">Address</Label>
                    <Badge variant="secondary" className="text-[10px]">Street kept private</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your street is never shown to anyone. Your city and
                    province show as your location, and place you in Nearby —
                    you can hide from Nearby in Settings.
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
                    {/* Suggestions so the city is spelt the way Nearby knows
                        it, but still free text: a municipality the list lacks
                        is placed by its province instead. */}
                    <div className="grid content-start gap-2">
                      <Label htmlFor="addressCity">City or municipality</Label>
                      <LocationField
                        id="addressCity"
                        value={form.addressCity}
                        onChange={set('addressCity')}
                        placeholder="Cebu City"
                      />
                      {nearbyHint && (
                        <p
                          className={cn(
                            'text-xs',
                            nearbyHint.warn ? 'text-warning' : 'text-muted-foreground',
                          )}
                        >
                          {nearbyHint.text}
                        </p>
                      )}
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

        </aside>
      </div>
    </Screen>
  );
}

/** One profile switch: what it does, and the switch itself. */
function FlagRow({
  id,
  title,
  detail,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  title: string;
  detail: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm font-semibold">
          {title}
        </Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      </div>
      <Switch
        id={id}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}
