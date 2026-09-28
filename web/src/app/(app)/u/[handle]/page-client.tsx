'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CloudOff,
  Globe,
  MapPin,
  Pencil,
  Play,
  Share2,
  UserSearch,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  mutualConnectionsLine,
  profileBanner,
  profileStatsLine,
  profileUrl,
  type ProfileView,
} from '@/api';
import { useProfileTaste, useProfileWork } from '@/hooks/useShowcases';
import { usePublicProfile } from '@/hooks/useProfile';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph';

/**
 * Somebody's profile, inside the app.
 *
 * The same content the public page at virgo.ph/@handle serves, rendered in the
 * app's own chrome. A signed-in person who taps a name should stay where they
 * are — being thrown onto a differently-styled marketing page, in a new tab,
 * reads as leaving the product, and it is the moment they are most likely to
 * be deciding whether to trust somebody with a booking.
 *
 * Reached at `/@handle` on this host: the proxy rewrites to here, so the
 * address a profile is shared under is the same one that renders natively when
 * the reader happens to be signed in. Facebook's arrangement, and for the same
 * reason.
 */
export default function AppProfilePage() {
  const { handle } = useParams<{ handle: string }>();
  const router = useRouter();

  const q = usePublicProfile(handle);

  if (q.isLoading) return <AppShell title="Profile"><CenteredSpinner /></AppShell>;

  const notFound = (
    <AppShell title="Profile">
      <EmptyState
        icon={UserSearch}
        title="Profile not found"
        description="This profile is private, or the handle has changed."
        action={<Button onClick={() => router.push('/nearby')}>Find collaborators</Button>}
      />
    </AppShell>
  );

  // Ahead of any cached copy: a block or an unpublish has to take the page
  // away, not leave the one from before it on screen.
  if (q.notFound) return notFound;

  // A failed load is not a missing profile. Saying "not found" to somebody on
  // a bad connection sends them away from a person who is right there.
  if (q.loadFailed) {
    return (
      <AppShell title="Profile">
        <EmptyState
          icon={CloudOff}
          title="Could not load this profile"
          description="Check your connection and try again."
          action={<Button onClick={() => q.refetch()}>Try again</Button>}
        />
      </AppShell>
    );
  }

  const person = q.profile;
  if (!person) return notFound;

  const banner = profileBanner(person);
  const isSelf = person.viewer?.isSelf === true;
  const mutual = isSelf ? null : mutualConnectionsLine(person.mutualConnections);

  const share = async () => {
    const url = profileUrl(person.handle, SITE);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { description: url });
    } catch {
      // Clipboard needs a secure context and permission; neither is worth an
      // error toast when the address is right there to be read.
      toast.info(url);
    }
  };

  return (
    <AppShell title={person.displayName || 'Profile'}>
      <div className="mx-auto w-full max-w-4xl px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <Card className="overflow-hidden py-0">
          {banner && !banner.blurred ? (
            // Their cover, at the 2:1 it was cropped to on the phone. No max
            // height: capping it would crop the framing they chose all over
            // again. Unoptimised because the CDN host is inferred to be the
            // one next.config allows, not verified.
            <div className="relative aspect-[2/1] w-full bg-primary/10">
              <Image
                src={banner.url}
                alt=""
                fill
                unoptimized
                sizes="(max-width: 900px) 100vw, 900px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-card/70 to-transparent" />
            </div>
          ) : (
            // Without a cover, their own work as the banner, the same as the
            // public page — a photographer's profile that opens on a flat
            // panel wastes the one thing they have most of.
            <div className="relative h-32 bg-primary/10 sm:h-40">
              {banner && (
                <>
                  <Image
                    src={banner.url}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 100vw, 900px"
                    className="scale-105 object-cover blur-[2px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-card/10" />
                </>
              )}
            </div>
          )}

          <CardContent className="pb-6">
            <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end">
              <Avatar className="size-24 border-4 border-card sm:size-28">
                <AvatarImage src={person.avatarUrl ?? undefined} alt="" />
                <AvatarFallback className="text-2xl font-bold">
                  {person.displayName.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="min-w-0 flex-1 sm:pb-1">
                <h1 className="truncate text-2xl font-extrabold tracking-tight">
                  {person.displayName}
                </h1>
                <p className="text-sm text-muted-foreground">@{person.handle}</p>
                {person.stats && (
                  <p className="mt-1 text-sm font-semibold">{profileStatsLine(person.stats)}</p>
                )}
                {mutual && (
                  <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <Users className="size-3.5" />
                    {mutual}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-2 sm:mb-1">
                <Button variant="outline" size="icon" onClick={share} aria-label="Copy link">
                  <Share2 className="size-4" />
                </Button>
                {isSelf ? (
                  <Button asChild variant="outline">
                    <Link href="/profile">
                      <Pencil className="size-4" />
                      Edit profile
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link href={`/hire/${person.handle}`}>
                      <BriefcaseBusiness className="size-4" />
                      Hire {person.displayName.split(' ')[0]}
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            {person.title && (
              <p className="mt-4 text-[15px] font-medium">{person.title}</p>
            )}

            {(person.roles.length > 0 || person.availableForBookings) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {person.availableForBookings && (
                  <Badge variant="secondary" className="text-[12px]">
                    <CalendarCheck className="size-3.5" />
                    Available for bookings
                  </Badge>
                )}
                {person.roles.map((role) => (
                  <Badge key={role} variant="secondary" className="text-[12px]">
                    {role}
                  </Badge>
                ))}
              </div>
            )}

            {person.bio && (
              <p className="mt-4 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {person.bio}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
              {person.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5" />
                  {person.location}
                </span>
              )}
              {person.studioName && (
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {person.studioName}
                </span>
              )}
              {person.website && (
                <a
                  href={
                    /^https?:\/\//i.test(person.website)
                      ? person.website
                      : `https://${person.website}`
                  }
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                >
                  <Globe className="size-3.5" />
                  {person.website.replace(/^https?:\/\//i, '')}
                </a>
              )}
              <span>On Virgo since {person.memberSince}</span>
            </div>
          </CardContent>
        </Card>

        <ProfileWork handle={person.handle} person={person} />
      </div>
    </AppShell>
  );
}

function ProfileWork({ handle, person }: { handle: string; person: ProfileView }) {
  const [tab, setTab] = useState<'work' | 'taste'>('work');

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Button size="sm" variant={tab === 'work' ? 'default' : 'secondary'} onClick={() => setTab('work')}>
          Work
        </Button>
        <Button size="sm" variant={tab === 'taste' ? 'default' : 'secondary'} onClick={() => setTab('taste')}>
          Taste
        </Button>
      </div>
      {tab === 'work' ? (
        <ProfilePosts handle={handle} person={person} />
      ) : (
        <ProfileTaste handle={handle} person={person} />
      )}
    </div>
  );
}

/** What somebody keeps of other people's work. Public shelves only. */
function ProfileTaste({ handle, person }: { handle: string; person: ProfileView }) {
  const { shelves, isLoading, loadFailed, refetch } = useProfileTaste(handle);

  if (isLoading) {
    return (
      <Card className="mt-4">
        <div className="grid place-items-center py-14 text-muted-foreground">Loading…</div>
      </Card>
    );
  }

  if (loadFailed && shelves.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={BriefcaseBusiness}
          title="Could not load these shelves"
          description="Check your connection and try again."
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      </Card>
    );
  }

  if (shelves.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={BriefcaseBusiness}
          title={`${person.displayName.split(' ')[0]} has not kept anything yet`}
          description="What somebody keeps says as much about them as what they make."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {shelves.map((shelf) => (
        <figure key={shelf.id} className="overflow-hidden">
          <span className="relative block aspect-square overflow-hidden rounded-xl bg-muted">
            {shelf.coverUrl && (
              <Image
                src={shelf.coverUrl}
                alt=""
                fill
                sizes="(max-width: 900px) 50vw, 300px"
                className="object-cover"
              />
            )}
          </span>
          <figcaption className="mt-1.5">
            <p className="truncate text-[13px] font-semibold">{shelf.name}</p>
            <p className="text-[11px] text-muted-foreground">{shelf.count} kept</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

function ProfilePosts({ handle, person }: { handle: string; person: ProfileView }) {
  const { showcases, isLoading, loadFailed, refetch } = useProfileWork(handle);

  if (isLoading) {
    return (
      <Card className="mt-4">
        <div className="grid place-items-center py-14 text-muted-foreground">Loading…</div>
      </Card>
    );
  }

  if (loadFailed && showcases.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={BriefcaseBusiness}
          title="Could not load this work"
          description="Check your connection and try again."
          action={<Button onClick={() => void refetch()}>Try again</Button>}
        />
      </Card>
    );
  }

  if (showcases.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={BriefcaseBusiness}
          title={`${person.displayName.split(' ')[0]} has not posted anything yet`}
          description="You can still send an enquiry — tell them what the job is and see what they say."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4">
      {/* The cover of each showcase, in the same tight square grid the app
          uses. `url` on a piece is the 640 px B2 copy — a photograph's
          thumbnail or a film's poster frame — which next/image is allowed to
          load; displaySources is never passed here, because the media host is
          not in its allow-list and these are already the size they need to be.

          A film is marked rather than played: a tile this size is no place to
          watch one, and there is no showcase page on the web to send somebody
          to yet. The badge says there is film here; the app plays it. */}
      <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
        {showcases.map((showcase) => (
          <figure
            key={showcase.id}
            className="group relative aspect-square overflow-hidden bg-muted"
          >
            <Image
              src={showcase.pieces[0].url}
              alt={showcase.title ?? ''}
              fill
              sizes="(max-width: 900px) 33vw, 300px"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {showcase.pieces[0].kind === 'video' && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="grid size-10 place-items-center rounded-full bg-black/50 text-white">
                  <Play size={16} fill="currentColor" />
                </span>
              </span>
            )}
            {showcase.pieces.length > 1 && (
              <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white">
                {showcase.pieces.length}
              </span>
            )}
            {showcase.title && (
              <figcaption className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent p-2.5 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                {showcase.title}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </div>
  );
}
