'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, Loader2, LocateFixed, MapPin, Search, X } from 'lucide-react';
import { headlineApplication, isRoleFilled, type JobPost } from '@/api';
import { useAuth } from '@/hooks/useAuth';
import { useJobs } from '@/hooks/useJobs';
import { useRoles } from '@/hooks/useRoles';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CARD, FilterChip } from '@/components/kit';
import { BestJobCard, JobCard } from './job-card';
import { isFreshJob } from './job-format';

/** The places most jobs are, to pick with a click. */
const PLACES = ['Manila', 'Cebu', 'Davao'];

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((value) => b.includes(value));

/** "a photographer", "an editor". */
const aRole = (role: string) => `${/^[aeiou]/i.test(role) ? 'an' : 'a'} ${role.toLowerCase()}`;

/**
 * The post that fits you best of those loaded: one of your roles still open
 * on it, not yours, not applied for, and the nearest of those. Null when none
 * says how far it is, because "closest" is then a guess. The phone's pick.
 */
function bestFor(jobs: JobPost[], myRoles: string[]): JobPost | null {
  let best: JobPost | null = null;
  for (const job of jobs) {
    if (job.isMine || headlineApplication(job) || job.distanceKm == null) continue;
    if (
      myRoles.length > 0 &&
      !job.rolesWanted.some((role) => !isRoleFilled(job, role) && myRoles.includes(role))
    ) {
      continue;
    }
    if (!best || job.distanceKm < (best.distanceKm as number)) best = job;
  }
  return best;
}

/**
 * The open board, inside the app shell.
 *
 * Not a link out to virgo.ph/jobs: that is the same list, but it renders in
 * the marketing layout, so clicking "browse" from the app dropped you out of
 * the sidebar and into what looks like a different product. The public page
 * exists for strangers and for search; signed-in people get it here.
 *
 * One row of filters, as on the phone: where, as a chip that opens the place
 * field, then "For you" and the roles. It was a search field and a second row
 * of badges, which put two bands of controls above the first job.
 */
export function BrowseJobs() {
  const [roles, setRoles] = useState<string[]>([]);
  /*
   * A place to look in: the API filters by location, and without it somebody
   * in Davao read every post in Manila to find the two near them.
   */
  const [place, setPlace] = useState('');
  const [searchedPlace, setSearchedPlace] = useState('');
  const [choosingPlace, setChoosingPlace] = useState(false);
  const { roles: allRoles } = useRoles();
  const { profile } = useAuth();
  // Only roles the board knows: a profile can carry one that has since gone.
  const myRoles = (profile?.roles ?? []).filter(
    (role) => allRoles.length === 0 || allRoles.includes(role),
  );
  // "Cebu City, Cebu" is an address; the board is searched by town.
  const myTown = profile?.location?.split(',')[0]?.trim() || null;

  // One request per settled word, not per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchedPlace(place.trim()), 350);
    return () => clearTimeout(timer);
  }, [place]);

  const {
    jobs,
    total,
    isLoading,
    loadFailed,
    refetch,
    isRefiltering,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useJobs({
    roles,
    location: searchedPlace || undefined,
  });

  const typed = place.trim();
  const filtered = Boolean(typed || roles.length);
  const forYou = myRoles.length > 0 && sameSet(roles, myRoles);
  const isPlace = (name: string) => typed.toLowerCase() === name.toLowerCase();
  /** A shortcut or Enter: a settled word already, so it does not wait out the pause. */
  const settlePlace = (next: string) => {
    setPlace(next);
    setSearchedPlace(next.trim());
    setChoosingPlace(false);
  };
  const clearPlace = () => {
    setPlace('');
    setSearchedPlace('');
  };
  const clearFilters = () => {
    clearPlace();
    setRoles([]);
  };
  const toggleRole = (role: string) =>
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );

  const best = bestFor(jobs, myRoles);
  const rest = best ? jobs.filter((job) => job.id !== best.id) : jobs;
  const fresh = jobs.filter((job) => isFreshJob(job)).length;

  return (
    <div className="flex flex-col gap-6">
      <div role="group" aria-label="Filter jobs" className="flex flex-wrap items-center gap-2">
        {/* Where: a chip like the rest, dark once a place is set. */}
        <Popover open={choosingPlace} onOpenChange={setChoosingPlace}>
          <PopoverTrigger asChild>
            <FilterChip
              on={Boolean(typed)}
              icon={<MapPin aria-hidden />}
              // In the chip, not over the list: the previous results stay on
              // screen while the next ones load, so this is the only thing
              // that should change.
              caret={!isRefiltering}
              // It opens something; what is chosen is in its name.
              aria-pressed={undefined}
              aria-label={typed ? `Jobs in ${typed}. Change where` : 'Jobs anywhere. Choose where'}
            >
              <span className="max-w-40 truncate">{typed || 'Anywhere'}</span>
              {isRefiltering && <Loader2 aria-hidden className="animate-spin" />}
            </FilterChip>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] gap-3 rounded-2xl p-3">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') settlePlace(place);
                }}
                placeholder="Anywhere — try Cebu, Manila, Davao"
                aria-label="Search by place"
                className="h-10 rounded-xl pr-16 pl-9"
              />
              <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                {isRefiltering && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
                )}
                {/* There was no way to empty it but to backspace it out. */}
                {place && (
                  <button
                    type="button"
                    onClick={clearPlace}
                    aria-label="Clear the place"
                    className="grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {/* Your own town, from your profile, as on the phone. */}
              {myTown && (
                <FilterChip
                  on={isPlace(myTown)}
                  icon={<LocateFixed aria-hidden />}
                  onClick={() => settlePlace(myTown)}
                >
                  Near me
                </FilterChip>
              )}
              <FilterChip on={!typed} onClick={() => settlePlace('')}>
                Anywhere
              </FilterChip>
              {PLACES.filter((p) => p.toLowerCase() !== myTown?.toLowerCase()).map((p) => (
                <FilterChip key={p} on={isPlace(p)} onClick={() => settlePlace(p)}>
                  {p}
                </FilterChip>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {myRoles.length > 0 && (
          <FilterChip
            on={forYou}
            aria-label={`For you: ${myRoles.join(', ')}`}
            onClick={() => setRoles(forYou ? [] : myRoles)}
          >
            For you
          </FilterChip>
        )}
        {allRoles.length > 0 && <span aria-hidden className="mx-1 h-5 w-px bg-border" />}
        {allRoles.map((role) => (
          // Under "For you" the roles are its own, so they are not also lit.
          <FilterChip
            key={role}
            on={!forYou && roles.includes(role)}
            onClick={() => (forYou ? setRoles([role]) : toggleRole(role))}
          >
            {role}
          </FilterChip>
        ))}
      </div>

      {isLoading && jobs.length === 0 ? (
        <ListSkeleton rows={3} />
      ) : loadFailed && jobs.length === 0 ? (
        // An error is not an empty board. Saying "no open jobs" here would be
        // a confident claim about the world made from a failed request.
        <ErrorState message="Could not load the job board." onRetry={() => refetch()} />
      ) : jobs.length === 0 ? (
        <div className={CARD}>
          <EmptyState
            icon={BriefcaseBusiness}
            title={
              searchedPlace
                ? `Nothing in “${searchedPlace}”`
                : roles.length === 1
                  ? `Nothing open for ${aRole(roles[0])}`
                  : roles.length > 1
                    ? 'Nothing open for those roles'
                    : 'No open jobs right now'
            }
            description={
              filtered
                ? 'Try a wider search, or post the job you need doing.'
                : 'Posts expire when the job does, so this list is always current. Check back, or post the job you need doing.'
            }
            action={
              // A filtered board that comes back empty is usually the filter,
              // and the way out of it should be on the card, not up the page.
              filtered ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={clearFilters}>Clear filters</Button>
                  <Button asChild variant="secondary">
                    <Link href="/jobs/new">Post a job instead</Link>
                  </Button>
                </div>
              ) : (
                <Button asChild>
                  <Link href="/jobs/new">Post a job</Link>
                </Button>
              )
            }
          />
        </div>
      ) : (
        <>
          {best && (
            <BestJobCard
              job={best}
              reason={myRoles.length > 0 ? 'Closest to you, and one of your roles' : 'Closest to you'}
            />
          )}
          <div className="-mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 className="text-base font-bold leading-6">
              {total} open {total === 1 ? 'job' : 'jobs'}
            </h2>
            {fresh > 0 && (
              <span className="text-[13px] text-muted-foreground">{fresh} new since yesterday</span>
            )}
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-[13px] font-semibold text-primary hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
          {/* The card on top is one of these, so it is not drawn twice. */}
          {rest.length > 0 && (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(360px,100%),1fr))] gap-4">
              {rest.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
          {/* The board comes a page at a time, and the header counted every
              post while only the first thirty could be reached — the
              farthest away, since it is nearest first. Not while a new
              filter is loading: the old one's next page is not this one's. */}
          {hasNextPage && !isRefiltering && (
            <Button
              variant="secondary"
              className="w-full"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                `Show more (${jobs.length} of ${total})`
              )}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
