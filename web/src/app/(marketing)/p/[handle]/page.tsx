import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Globe, MapPin } from 'lucide-react';
import { LandingFooter } from '@/components/landing/closing';
import { API_BASE_URL, type PublicProfile } from '@/api';
import { SIGN_UP_URL } from '@/components/landing/links';

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
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : undefined,
    },
    twitter: {
      card: 'summary',
      title,
      description,
      images: profile.avatarUrl ? [profile.avatarUrl] : undefined,
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

      <main className="grain relative overflow-hidden">
        <div className="hero-glow" aria-hidden />

        <div className="relative mx-auto w-full max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {profile.avatarUrl ? (
              <Image
                src={profile.avatarUrl}
                alt=""
                width={112}
                height={112}
                className="size-24 shrink-0 rounded-full object-cover sm:size-28"
              />
            ) : (
              <div className="grid size-24 shrink-0 place-items-center rounded-full bg-[#c17745]/15 text-2xl font-bold text-[#c17745] sm:size-28">
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
                {profile.displayName}
              </h1>
              <p className="mt-1 text-sm text-white/40">@{profile.handle}</p>
              {profile.title && (
                <p className="mt-2 text-[15px] text-white/70">{profile.title}</p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-white/45">
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
                    // The link is user-supplied: noopener stops the target
                    // reaching back through window.opener, nofollow stops a
                    // public profile becoming a way to pass link juice.
                    target="_blank"
                    rel="noopener noreferrer nofollow ugc"
                    className="inline-flex items-center gap-1.5 transition-colors hover:text-white"
                  >
                    <Globe className="size-3.5" />
                    {profile.website.replace(/^https?:\/\//i, '')}
                  </a>
                )}
                <span>On Virgo since {profile.memberSince}</span>
              </div>
            </div>
          </div>

          {profile.roles.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
                What they do
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile.roles.map((role) => (
                  <span
                    key={role}
                    className="rounded-full border border-[#c17745]/30 bg-[#c17745]/10 px-3.5 py-1.5 text-[13px] font-semibold text-[#e0a274]"
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.bio && (
            <div className="mt-8 max-w-2xl">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
                About
              </h2>
              <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-white/60">
                {profile.bio}
              </p>
            </div>
          )}

          {/* Contact is a Virgo account, not an email address on a public page.
              The enquiry flow lands here next; until then this is an honest
              invitation rather than a dead button. */}
          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
            <p className="text-[15px] font-bold text-white">
              Want to work with {profile.displayName.split(' ')[0]}?
            </p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
              Join Virgo to send them a message about the job — the date, the
              brief, what you need.
            </p>
            <a
              href={`${SIGN_UP_URL}?next=${encodeURIComponent(`/@${profile.handle}`)}`}
              className="mt-4 inline-flex rounded-xl bg-[#c17745] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#cd8250]"
            >
              Get in touch
            </a>
          </div>
        </div>
      </main>

      <LandingFooter />
    </>
  );
}
