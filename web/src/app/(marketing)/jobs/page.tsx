import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { BriefcaseBusiness } from 'lucide-react';
import { LandingFooter } from '@/components/landing/closing';
import { JobCard } from '@/components/job-card';
import { APP_URL, SIGN_UP_URL } from '@/components/landing/links';
import { API_BASE_URL, type JobPost } from '@/api';

/**
 * Rendered per request.
 *
 * A job board is only worth reading if it is current, and a cached copy is by
 * definition not. Posts close, fill and expire; serving a ten-minute-old list
 * means somebody writes an application for a job that is already taken.
 */
export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

/** The roles a poster can hire for. Mirrors USER_ROLES on the server. */
const ROLES = [
  'Photographer',
  'Videographer',
  'Photo Editor',
  'Video Editor',
  'SDE Editor Photo',
  'SDE Editor Video',
  'Coordinator',
  'Host',
  'HMUA',
];

export const metadata: Metadata = {
  title: { absolute: 'Creative jobs in the Philippines · Virgo' },
  description:
    'Photography, video and editing work posted by people hiring right now. Filter by role and city, and apply in a couple of lines.',
  alternates: { canonical: `${SITE}/jobs` },
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    url: `${SITE}/jobs`,
    siteName: 'Virgo',
    title: 'Creative jobs in the Philippines · Virgo',
    description:
      'Photography, video and editing work posted by people hiring right now.',
  },
};

/**
 * Fetched server-side over the container network.
 *
 * `virgo.ph` is not in the API's CORS allow-list, and a board rendered on the
 * client would be invisible to a crawler — which would defeat the reason this
 * lives on the public origin at all.
 */
async function fetchJobs(
  role: string | undefined,
  location: string | undefined,
): Promise<{ data: JobPost[]; total: number }> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;
  const query = new URLSearchParams();
  if (role) query.set('roles', role);
  if (location) query.set('location', location);
  query.set('limit', '40');

  try {
    const res = await fetch(`${base}/jobs?${query}`, { cache: 'no-store' });
    if (!res.ok) return { data: [], total: 0 };
    return (await res.json()) as { data: JobPost[]; total: number };
  } catch {
    return { data: [], total: 0 };
  }
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; location?: string }>;
}) {
  const { role, location } = await searchParams;
  // Only a role we actually recognise reaches the API; anything else is
  // dropped rather than passed through as a filter that matches nothing.
  const activeRole = role && ROLES.includes(role) ? role : undefined;

  const { data: jobs, total } = await fetchJobs(activeRole, location);

  /**
   * Structured data for the board.
   *
   * `ItemList` is what tells a search engine this is a list of postings rather
   * than one page of prose. Each post's own page carries the richer
   * `JobPosting` shape.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Creative jobs on Virgo',
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 20).map((job, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE}/jobs/${job.slug}`,
      name: job.title,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <header className="border-b border-white/8">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center gap-2.5 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={26} height={26} className="size-[26px] object-contain" />
            <span className="text-[15px] font-bold tracking-tight text-white">Virgo</span>
          </Link>
          <a
            href={`${APP_URL}/jobs/new`}
            className="ml-auto rounded-lg bg-[#c17745] px-4 py-2 text-[13px] font-bold text-white transition-colors hover:bg-[#cd8250]"
          >
            Post a job
          </a>
        </div>
      </header>

      <main className="grain relative overflow-hidden">
        <div className="hero-glow" aria-hidden />

        <div className="relative mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Creative work, posted by people hiring now
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-white/55">
            Photographers, videographers, editors, hosts and HMUAs across the
            Philippines. Apply in a couple of lines — if they accept, you are
            connected and talking in chat.
          </p>

          {/* Links, not buttons: each filter is its own URL, so it can be
              shared, bookmarked and indexed. A crawler following "Photographer"
              gets a real page of photography jobs. */}
          <div className="mt-7 flex flex-wrap gap-2">
            <Link
              href="/jobs"
              className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                !activeRole
                  ? 'border-[#c17745] bg-[#c17745] text-white'
                  : 'border-white/12 text-white/55 hover:border-white/25 hover:text-white'
              }`}
            >
              All roles
            </Link>
            {ROLES.map((r) => (
              <Link
                key={r}
                href={`/jobs?role=${encodeURIComponent(r)}`}
                className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                  activeRole === r
                    ? 'border-[#c17745] bg-[#c17745] text-white'
                    : 'border-white/12 text-white/55 hover:border-white/25 hover:text-white'
                }`}
              >
                {r}
              </Link>
            ))}
          </div>

          <p className="mt-6 text-[12px] uppercase tracking-[0.14em] text-white/30">
            {total} open {total === 1 ? 'job' : 'jobs'}
            {activeRole ? ` for a ${activeRole.toLowerCase()}` : ''}
            {location ? ` in ${location}` : ''}
          </p>

          {jobs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/12 py-16 text-center">
              <BriefcaseBusiness className="mx-auto size-7 text-white/15" />
              <p className="mt-3 text-[14px] font-semibold text-white/70">
                {activeRole
                  ? `Nothing open for a ${activeRole.toLowerCase()} right now`
                  : 'No open jobs right now'}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-white/40">
                Posts expire when the job does, so this is always current. Check
                back, or post the job you need doing.
              </p>
              <a
                href={`${APP_URL}/jobs/new`}
                className="mt-5 inline-flex rounded-xl bg-[#c17745] px-5 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#cd8250]"
              >
                Post a job
              </a>
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {jobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}

          <div className="mt-12 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center">
            <p className="text-[15px] font-bold text-white">
              Hiring for something not listed here?
            </p>
            <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-white/50">
              Posting is free. Say what you need, when, and roughly what you are
              paying — the people who do it will come to you.
            </p>
            <a
              href={`${APP_URL}/jobs/new`}
              className="mt-4 inline-flex rounded-xl bg-[#c17745] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#cd8250]"
            >
              Post a job
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
