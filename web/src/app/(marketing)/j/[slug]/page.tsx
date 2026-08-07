import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Banknote, CalendarDays, MapPin, Users } from 'lucide-react';
import { LandingFooter } from '@/components/landing/closing';
import { jobDate, postedAgo } from '@/components/job-card';
import { APP_URL, SIGN_UP_URL } from '@/components/landing/links';
import { API_BASE_URL, budgetLabel, type JobPost } from '@/api';

/** Closing or filling a post has to take it down now, not in ten minutes. */
export const dynamic = 'force-dynamic';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://virgo.ph';

function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

async function fetchJob(slug: string): Promise<JobPost | null> {
  const base = process.env.API_INTERNAL_URL || API_BASE_URL;
  try {
    const res = await fetch(`${base}/jobs/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as JobPost;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const job = await fetchJob(slug);

  if (!job) {
    return { title: { absolute: 'Job not found · Virgo' }, robots: { index: false } };
  }

  /*
   * People write the place into the title — "…wedding in Cebu" — and appending
   * the location gave "…wedding in Cebu in Cebu City".
   *
   * Matching on the whole location does not catch it: the title says "Cebu"
   * and the location is "Cebu City", so a substring test passes and the
   * duplicate survives. Comparing the *first word* is what actually works, and
   * it handles "Panglao, Bohol" against a title mentioning Panglao too.
   */
  const cityWord = job.location?.split(/[\s,]+/)[0]?.toLowerCase();
  const where =
    job.location && cityWord && !job.title.toLowerCase().includes(cityWord)
      ? ` in ${job.location}`
      : '';
  const title = `${job.title}${where} · Virgo`;
  const description =
    job.description.slice(0, 180).trim() +
    (job.description.length > 180 ? '…' : '');

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `${SITE}/jobs/${job.slug}` },
    // A job that is filled or closed should stop competing in search — the
    // page still resolves for anyone holding the link, it just stops being
    // advertised as an opportunity.
    robots:
      job.status === 'open'
        ? { index: true, follow: true }
        : { index: false, follow: true },
    openGraph: {
      type: 'article',
      url: `${SITE}/jobs/${job.slug}`,
      siteName: 'Virgo',
      title,
      description,
    },
  };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const job = await fetchJob(slug);
  if (!job) notFound();

  const budget = budgetLabel(job.budgetMin, job.budgetMax);
  const isOpen = job.status === 'open';

  /**
   * `JobPosting`, which is what makes this eligible for Google's jobs
   * treatment rather than an ordinary blue link.
   *
   * `validThrough` is the post's own expiry — the same value that takes it off
   * the board — so a search result cannot outlive the listing.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: job.title,
    description: job.description,
    datePosted: job.createdAt,
    validThrough: job.expiresAt,
    employmentType: 'CONTRACTOR',
    hiringOrganization: {
      '@type': 'Organization',
      name: job.postedBy.displayName,
      ...(job.postedBy.handle
        ? { sameAs: `${SITE}/@${job.postedBy.handle}` }
        : {}),
    },
    ...(job.location
      ? {
          jobLocation: {
            '@type': 'Place',
            address: {
              '@type': 'PostalAddress',
              addressLocality: job.location,
              addressCountry: 'PH',
            },
          },
        }
      : {}),
    ...(job.budgetMin != null || job.budgetMax != null
      ? {
          baseSalary: {
            '@type': 'MonetaryAmount',
            currency: 'PHP',
            value: {
              '@type': 'QuantitativeValue',
              // Centavos on the wire, pesos in the markup — the schema wants a
              // human currency amount, not our storage unit.
              ...(job.budgetMin != null ? { minValue: job.budgetMin / 100 } : {}),
              ...(job.budgetMax != null ? { maxValue: job.budgetMax / 100 } : {}),
              unitText: 'DAY',
            },
          },
        }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
      />

      <header className="border-b border-white/8">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-2.5 px-5 sm:px-8">
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

        <div className="relative mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
          <Link
            href="/jobs"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/45 transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            All jobs
          </Link>

          {/* A closed post still resolves, so it has to say why rather than
              leaving somebody to write an application nobody can accept. */}
          {!isOpen && (
            <div className="mt-5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-[13px] text-amber-200/90">
              {job.status === 'filled'
                ? 'This job has been filled.'
                : job.status === 'expired'
                  ? 'This post has expired.'
                  : 'This post is closed.'}{' '}
              <Link href="/jobs" className="font-semibold underline">
                See what else is open
              </Link>
            </div>
          )}

          <h1 className="mt-5 text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
            {job.title}
          </h1>

          <div className="mt-4 flex items-center gap-3">
            {job.postedBy.avatarUrl ? (
              <Image
                src={job.postedBy.avatarUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <div className="grid size-10 place-items-center rounded-full bg-[#c17745]/15 text-[13px] font-bold text-[#e0a274]">
                {job.postedBy.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">
                {job.postedBy.handle ? (
                  <Link
                    href={`/@${job.postedBy.handle}`}
                    className="transition-colors hover:text-[#e0a274]"
                  >
                    {job.postedBy.displayName}
                  </Link>
                ) : (
                  job.postedBy.displayName
                )}
              </p>
              <p className="text-[12px] text-white/40">
                Posted {postedAgo(job.createdAt)}
                {job.applicantCount > 0 ? ` · ${job.applicantCount} applied` : ''}
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-3">
            <Detail icon={CalendarDays} label="Date">
              {job.eventDate ? jobDate(job.eventDate) : 'Flexible'}
            </Detail>
            <Detail icon={MapPin} label="Where">
              {job.location ?? 'Not specified'}
            </Detail>
            <Detail icon={Banknote} label="Budget">
              {budget ?? 'Open to offers'}
            </Detail>
          </div>

          <div className="mt-6 flex flex-wrap gap-1.5">
            {job.rolesWanted.map((role) => (
              <span
                key={role}
                className="rounded-full border border-[#c17745]/30 bg-[#c17745]/10 px-3 py-1 text-[12px] font-semibold text-[#e0a274]"
              >
                {role}
              </span>
            ))}
          </div>

          <div className="mt-7">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#c17745]">
              The job
            </h2>
            <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-white/70">
              {job.description}
            </p>
          </div>

          {isOpen && (
            <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <p className="text-[15px] font-bold text-white">
                Think you are right for this?
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-white/50">
                Say why in a couple of lines. If they accept, you are connected
                and can talk it through in chat.
              </p>
              <a
                href={`${APP_URL}/jobs/${job.slug}/apply`}
                className="mt-4 inline-flex rounded-xl bg-[#c17745] px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-[#cd8250]"
              >
                Apply for this job
              </a>
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-white/30">
                <Users className="size-3.5" />
                You will need a Virgo account —{' '}
                <a href={SIGN_UP_URL} className="underline hover:text-white/50">
                  it is free to join
                </a>
              </p>
            </div>
          )}
        </div>
      </main>

      <LandingFooter />
    </>
  );
}

function Detail({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-white/35">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="mt-1 text-[14px] font-semibold text-white">{children}</p>
    </div>
  );
}
