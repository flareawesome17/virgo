'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CloudOff,
  Globe,
  Layers,
  MapPin,
  Pencil,
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
  type PortfolioAlbum,
  type PortfolioImage,
  type ProfileView,
} from '@/api';
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

  const images = person.portfolio.filter((i): i is PortfolioImage => i.kind === 'image');
  const albums = person.portfolio.filter(
    (i): i is PortfolioAlbum => i.kind === 'album' && Boolean(i.url),
  );
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

        <ProfileWork images={images} albums={albums} person={person} />
      </div>
    </AppShell>
  );
}

function ProfileWork({
  images,
  albums,
  person,
}: {
  images: PortfolioImage[];
  albums: PortfolioAlbum[];
  person: ProfileView;
}) {
  if (images.length === 0 && albums.length === 0) {
    return (
      <Card className="mt-4">
        <EmptyState
          icon={BriefcaseBusiness}
          title={`${person.displayName.split(' ')[0]} has not added any work yet`}
          description="You can still send an enquiry — tell them what the job is and see what they say."
        />
      </Card>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      {images.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Portfolio
          </h2>
          {/* The same tight square grid the public page uses. Uniform crops are
              what let somebody judge a dozen photographs at a glance.

              `url` is the 640 px B2 copy, which next/image is allowed to load.
              displaySources is never passed here: the media host is not in
              its allow-list, and the images are already the size they need. */}
          <div className="mt-2 grid grid-cols-3 gap-1 overflow-hidden rounded-xl">
            {images.map((item) => (
              <figure
                key={item.id}
                className="group relative aspect-square overflow-hidden bg-muted"
              >
                <Image
                  src={item.url}
                  alt={item.caption ?? ''}
                  fill
                  sizes="(max-width: 900px) 33vw, 300px"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                {item.caption && (
                  <figcaption className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/75 to-transparent p-2.5 text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {item.caption}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}

      {albums.length > 0 && (
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Galleries
          </h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {albums.map((album) => (
              <a
                key={album.id}
                href={album.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative flex aspect-[16/10] items-end overflow-hidden rounded-xl bg-muted"
              >
                {album.coverUrl ? (
                  <Image
                    src={album.coverUrl}
                    alt=""
                    fill
                    sizes="(max-width: 900px) 100vw, 420px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-primary/10">
                    <Layers className="size-7 text-primary/60" />
                  </div>
                )}
                <div className="relative w-full bg-gradient-to-t from-black/85 to-transparent p-4 pt-10">
                  <p className="flex items-center gap-1.5 text-[15px] font-bold text-white">
                    {album.name}
                    <ArrowUpRight className="size-4 shrink-0 text-white/60" />
                  </p>
                  <p className="mt-0.5 text-[12px] text-white/60">
                    {album.itemCount} {album.itemCount === 1 ? 'photo' : 'photos'}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
