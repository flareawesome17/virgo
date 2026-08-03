import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, MapPin } from 'lucide-react';
import { LandingFooter } from '@/components/landing/closing';
import { ProfileGallery } from '@/components/profile-gallery';
import { API_BASE_URL, type PublicProfile } from '@/api';
import { APP_URL, SIGN_UP_URL } from '@/components/landing/links';

/**
 * Rendered per request.
 *
 * Not cached, deliberately. Turning the profile off has to take the page down
 * now — a stale copy of somebody's face and city served for another ten minutes
 * after they asked for it to stop is exactly the kind of thing an opt-in
 * promise is supposed to prevent. The endpoint is cheap and rate-limited.
 */
export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/**
 * Serialises structured data for a `<script>` block.
 *
 * `JSON.stringify` does not escape `<`, so a bio containing
 * `</script><script>alert(1)</script>` closes the tag and runs — a stored XSS
 * on a page that is unauthenticated, indexable, and full of text other people
 * wrote. Escaping `<` to its unicode form keeps the JSON identical to a parser
 * while making the sequence impossible to produce.
 */
function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Fetched server-side.
 *
 * `virgo.ph` is not in the API's CORS allow-list, so a browser-side call from
 * this origin would fail preflight — and the token-bearing client has no place
 * on a page served to strangers. The internal hop avoids leaving the host at
 * all; the landing page reads its prices the same way.
 */
async function fetchProfile(handle: string): Promise<PublicProfile | null> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;
  try {
    const res = await fetch(`${base}/profiles/${encodeURIComponent(handle)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as PublicProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await fetchProfile(handle);

  if (!profile) {
    // Nothing to advertise, and nothing a crawler should keep.
    return { title: { absolute: 'Profile not found · Virgo' }, robots: { index: false } };
  }

  const roles = profile.roles.join(', ');
  const where = profile.location ? ` in ${profile.location}` : '';
  const title = `${profile.displayName} — ${roles || 'Creative'}${where} · Virgo`;
  const description =
    profile.bio?.trim() ||
    `${profile.displayName} is a ${roles || 'creative'}${where} on Virgo. See their work and send a hire enquiry.`;

  const url = `${SITE}/@${profile.handle}`;

  // Their work beats their face in a shared link — a photographer's first
  // portfolio image says more in a preview card than a 112px avatar.
  const firstWork = profile.portfolio.find((item) => item.kind === 'image');
  const share = firstWork?.url ?? profile.avatarUrl;

  return {
    // `absolute` escapes the root layout's "%s · Virgo" template.
    title: { absolute: title },
    description,
    // The marketing layout hardcodes canonical to the homepage. Without this
    // override every profile would canonicalise there and none would rank.
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'profile',
      url,
      siteName: 'Virgo',
      title,
      description,
      images: share ? [{ url: share }] : undefined,
    },
    twitter: {
      // A large card when there is work to show it off, a small one when the
      // only image is a round avatar that would be cropped to nothing.
      card: firstWork ? 'summary_large_image' : 'summary',
      title,
      description,
      images: share ? [share] : undefined,
    },
  };
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const profile = await fetchProfile(handle);
  if (!profile) notFound();

  const url = `${SITE}/@${profile.handle}`;

  // Narrowed once here rather than at each use — the discriminated union does
  // not survive an inline .filter() in JSX without a type predicate.
  const images = profile.portfolio.filter(
    (item): item is Extract<typeof item, { kind: 'image' }> =>
      item.kind === 'image',
  );
  const albums = profile.portfolio.filter(
    (item): item is Extract<typeof item, { kind: 'album' }> =>
      item.kind === 'album' && Boolean(item.url),
  );

  /** Their best photograph, or an album cover, for the banner. */
  const cover = images[0]?.url ?? albums.find((a) => a.coverUrl)?.coverUrl ?? null;

  /**
   * Structured data, so a search result can show the person rather than a blue
   * link. `Person` inside `ProfilePage` is the shape Google documents for
   * exactly this.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    dateCreated: `${profile.memberSince}-01-01`,
    mainEntity: {
      '@type': 'Person',
      name: profile.displayName,
      alternateName: `@${profile.handle}`,
      ...(profile.title ? { jobTitle: profile.title } : {}),
      ...(profile.bio ? { description: profile.bio } : {}),
      ...(profile.avatarUrl ? { image: profile.avatarUrl } : {}),
      ...(profile.location ? { homeLocation: { '@type': 'Place', name: profile.location } } : {}),
      ...(profile.website ? { url: profile.website } : {}),
      knowsAbout: profile.roles,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <header className="border-b border-white/8">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-2.5 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={26} height={26} className="size-[26px] object-contain" />
            <span className="text-[15px] font-bold tracking-tight text-white">Virgo</span>
          </Link>
          <a
            href={SIGN_UP_URL}
            className="ml-auto rounded-lg bg-[#c17745] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#cd8250]"
          >
            Join Virgo
          </a>
        </div>
      </header>

      <main>
        {/*
          Cover.

          Their own best photograph, blurred and dimmed hard enough to read over.
          A photographer's profile that opens on a flat gradient wastes the one
          thing they have most of; using their work makes the page theirs before
          a word is read. Falls back to the site's own glow when there is
          nothing to show yet.
        */}
        <div className="relative h-40 overflow-hidden bg-[#c17745]/10 sm:h-56">
          {cover ? (
            <>
              <Image
                src={cover}
                alt=""
                fill
                priority
                sizes="100vw"
                className="scale-110 object-cover blur-[2px]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-background/20" />
            </>
          ) : (
            <div className="grain absolute inset-0">
              <div className="hero-glow" aria-hidden />
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-4xl px-5 sm:px-8">
          {/*
            The avatar overlaps the cover, the arrangement every social profile
            uses. It ties the two bands together and gives the name somewhere to
            start, instead of a row of details floating on a flat background.
          */}
          <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                width={144}
                height={144}
                className="size-24 shrink-0 rounded-full border-4 border-background bg-background object-cover sm:size-32"
              />
            ) : (
              <div className="grid size-24 shrink-0 place-items-center rounded-full border-4 border-background bg-[#c17745]/20 text-2xl font-bold text-[#e0a274] sm:size-32 sm:text-3xl">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
                {profile.displayName}
              </h1>
              <p className="text-[13px] text-white/40">@{profile.handle}</p>
            </div>

            {/* The whole point of the page, so it sits with the name rather
                than only at the bottom. Full-width on a phone, where a thumb
                expects it. */}
            <a
              href={`${APP_URL}/hire/${profile.handle}`}
              className="shrink-0 rounded-xl bg-[#c17745] px-6 py-3 text-center text-[14px] font-bold text-white transition-colors hover:bg-[#cd8250] sm:mb-1"
            >
              Hire {profile.displayName.split(' ')[0]}
            </a>
          </div>

          {profile.title && (
            <p className="mt-4 text-[15px] font-medium text-white/80">
              {profile.title}
            </p>
          )}

          {profile.roles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {profile.roles.map((role) => (
                <span
                  key={role}
                  className="rounded-full border border-[#c17745]/30 bg-[#c17745]/10 px-3 py-1 text-[12px] font-semibold text-[#e0a274]"
                >
                  {role}
                </span>
              ))}
            </div>
          )}

          {profile.bio && (
            <p className="mt-4 max-w-2xl whitespace-pre-line text-[14px] leading-relaxed text-white/60">
              {profile.bio}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/45">
            {profile.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {profile.location}
              </span>
            )}
            {profile.website && (
              <a
                href={
                  /^https?:\/\//i.test(profile.website)
                    ? profile.website
                    : `https://${profile.website}`
                }
                // The link is user-supplied: noopener stops the target reaching
                // back through window.opener, nofollow stops a public profile
                // becoming a way to pass link juice.
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
              >
                <Globe className="size-3.5" />
                {profile.website.replace(/^https?:\/\//i, '')}
              </a>
            )}
          </div>

          {/*
            Counts, in the row every social profile puts them in. It is the
            fastest read on the page: somebody deciding whether to keep
            scrolling wants to know there is something to scroll to.
          */}
          <dl className="mt-6 flex gap-8 border-y border-white/8 py-4">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-white/35">
                Work
              </dt>
              <dd className="text-lg font-bold tabular-nums text-white">
                {images.length}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-white/35">
                Galleries
              </dt>
              <dd className="text-lg font-bold tabular-nums text-white">
                {albums.length}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.12em] text-white/35">
                On Virgo
              </dt>
              <dd className="text-lg font-bold tabular-nums text-white">
                {profile.memberSince}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mx-auto w-full max-w-4xl">
          <ProfileGallery
            images={images}
            albums={albums}
            displayName={profile.displayName}
          />
        </div>

        <div className="mx-auto w-full max-w-4xl px-5 pb-16 pt-10 sm:px-8">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-[15px] font-bold text-white">
              Want to work with {profile.displayName.split(' ')[0]}?
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-white/50">
              Send an enquiry with the date, the brief and your budget. If they
              accept, you are connected and can talk it through in chat.
            </p>
            <a
              href={`${APP_URL}/hire/${profile.handle}`}
              className="mt-4 inline-flex rounded-xl bg-[#c17745] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#cd8250]"
            >
              Send a hire enquiry
            </a>
            <p className="mt-3 text-[12px] text-white/30">
              You will need a Virgo account —{' '}
              <a href={SIGN_UP_URL} className="underline hover:text-white/50">
                it is free to join
              </a>
              .
            </p>
          </div>
        </div>
      </main>

      <LandingFooter />
    </>
  );
}
