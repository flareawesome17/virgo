import Image from 'next/image';
import Link from 'next/link';
import { Banknote, CalendarDays, MapPin, Users } from 'lucide-react';
import { budgetLabel, type JobPost } from '@/api';

/** "Sat 19 Dec" — a job date is a day, and this year's year is noise. */
export function jobDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(thisYear ? {} : { year: 'numeric' }),
  });
}

/** "3 days ago" — how fresh a post is, which is most of how promising it is. */
export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
}

/**
 * One job on the board.
 *
 * A server component with no interactivity, so the whole board renders in the
 * HTML a crawler receives — which is the entire point of putting it on the
 * public origin.
 */
export function JobCard({ job }: { job: JobPost }) {
  const budget = budgetLabel(job.budgetMin, job.budgetMax);

  return (
    <Link
      href={`/jobs/${job.slug}`}
      className="group block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-[#c17745]/40 hover:bg-white/[0.05]"
    >
      <div className="flex items-start gap-3">
        {job.postedBy.avatarUrl ? (
          <Image
            src={job.postedBy.avatarUrl}
            alt=""
            width={36}
            height={36}
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="grid size-9 shrink-0 place-items-center rounded-full bg-[#c17745]/15 text-[12px] font-bold text-[#e0a274]">
            {job.postedBy.displayName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold leading-snug text-white transition-colors group-hover:text-[#e0a274]">
            {job.title}
          </h3>
          <p className="mt-0.5 text-[12px] text-white/40">
            {job.postedBy.displayName} · posted {postedAgo(job.createdAt)}
          </p>
        </div>
      </div>

      {/* Clamped rather than truncated at a character count: three lines look
          the same whatever the words are, and the detail page has the rest. */}
      <p className="mt-3 line-clamp-3 whitespace-pre-line text-[13px] leading-relaxed text-white/55">
        {job.description}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {job.rolesWanted.map((role) => (
          <span
            key={role}
            className="rounded-full border border-[#c17745]/30 bg-[#c17745]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#e0a274]"
          >
            {role}
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/45">
        {job.eventDate && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3.5" />
            {jobDate(job.eventDate)}
          </span>
        )}
        {job.location && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-3.5" />
            {job.location}
          </span>
        )}
        {budget && (
          <span className="inline-flex items-center gap-1.5 font-semibold text-white/60">
            <Banknote className="size-3.5" />
            {budget}
          </span>
        )}
        {job.applicantCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {job.applicantCount} applied
          </span>
        )}
      </div>
    </Link>
  );
}
