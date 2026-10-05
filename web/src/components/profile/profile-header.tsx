'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { Building2, CalendarCheck, Globe, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { profileBanner, profileStatsLine, type PortfolioItem, type ProfileStats } from '@/api';

/** What the header draws, from a public profile or your own page alike. */
export interface ProfileHeaderPerson {
  displayName: string;
  handle: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  portfolio: PortfolioItem[];
  title: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  studioName?: string | null;
  roles: string[];
  memberSince: number;
  availableForBookings?: boolean;
  stats?: ProfileStats | null;
}

/**
 * The top of a profile: cover, picture, name, what they do, and the buttons.
 *
 * One component for somebody else's profile and your own, so the page you see
 * of yourself is the page they see, with your own buttons in place of theirs.
 */
export function ProfileHeader({
  person,
  actions,
  under,
  coverControl,
}: {
  person: ProfileHeaderPerson;
  /** The buttons beside the name. */
  actions?: ReactNode;
  /** A line under the stats, such as mutual connections. */
  under?: ReactNode;
  /** Drawn over the cover, for changing your own. */
  coverControl?: ReactNode;
}) {
  const banner = profileBanner(person);

  return (
    <Card className="overflow-hidden py-0">
      {banner && !banner.blurred ? (
        // The cover, at the 2:1 it was cropped to. No max height: capping it
        // would crop the framing they chose all over again. Unoptimised
        // because the CDN host is inferred to be the one next.config allows.
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
          {coverControl && <div className="absolute right-3 top-3">{coverControl}</div>}
        </div>
      ) : (
        // Without a cover, their own work as the banner, blurred: a
        // photographer's profile that opens on a flat panel wastes the one
        // thing they have most of.
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
          {coverControl && <div className="absolute right-3 top-3">{coverControl}</div>}
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
            <h1 className="truncate text-2xl font-extrabold tracking-tight">{person.displayName}</h1>
            {person.handle && <p className="text-sm text-muted-foreground">@{person.handle}</p>}
            {person.stats && (
              <p className="mt-1 text-sm font-semibold">{profileStatsLine(person.stats)}</p>
            )}
            {under}
          </div>

          {actions && <div className="flex shrink-0 flex-wrap gap-2 sm:mb-1">{actions}</div>}
        </div>

        {person.title && <p className="mt-4 text-[15px] font-medium">{person.title}</p>}

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
              href={/^https?:\/\//i.test(person.website) ? person.website : `https://${person.website}`}
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
  );
}
