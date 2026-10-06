'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, Screen } from '@/components/app-shell';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EnquiriesTab } from '@/components/enquiries';
import { NearbyTab } from '@/components/people/nearby-tab';
import { PeopleTab, usePageVisible } from '@/components/people/people-tab';
import { useFriendPresence, useMarkPeopleSeen, usePeopleUnseen } from '@/hooks/useFriends';
import { useHireEnquiries } from '@/hooks/useHire';

type PeopleView = 'people' | 'enquiries' | 'nearby';

/** Every spelling a link might use. `connections` is the phone's word for the first. */
const VIEWS: Record<string, PeopleView> = {
  people: 'people',
  connections: 'people',
  enquiries: 'enquiries',
  nearby: 'nearby',
};

const DESCRIPTIONS: Record<PeopleView, string> = {
  people: '',
  enquiries: 'Work people have asked you about, and what you have asked others',
  nearby: 'Freelancers and collaborators around you',
};

function People() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = params.get('tab') ?? '';
  // hasOwn, so ?tab=constructor is not handed a function off the prototype.
  const view: PeopleView = Object.hasOwn(VIEWS, requested) ? VIEWS[requested] : 'people';
  // replace, not push: switching tabs should not fill Back with this page.
  const setView = (next: string) =>
    router.replace(next === 'people' ? '/people' : `/people?tab=${next}`);

  const connections = useFriendPresence();
  const hire = useHireEnquiries();
  const connectionCount = connections.friends.length;
  const waiting = hire.pending.length;

  /*
   * Opening People is seeing what is waiting there, whichever tab it opens
   * on: the requests and enquiries stay listed until they are answered, but
   * they stop lighting the nav's badge. On arriving, and again if one lands
   * while you are looking at the page.
   */
  const unseen = usePeopleUnseen();
  const markSeen = useMarkPeopleSeen();
  const visible = usePageVisible();
  const waitingUnseen = unseen.count;
  const wasLooking = useRef(false);
  useEffect(() => {
    const arrived = visible && !wasLooking.current;
    wasLooking.current = visible;
    // Not again on an API without the marker: its count only falls by
    // answering, and marking again on every refetch would never stop.
    if (arrived || (visible && waitingUnseen > 0 && unseen.supported)) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, waitingUnseen]);

  return (
    <Screen title="People">
      <PageHeader
        title="People"
        description={
          view === 'people'
            ? `${connectionCount} connection${connectionCount === 1 ? '' : 's'}`
            : DESCRIPTIONS[view]
        }
      />

      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="people">People</TabsTrigger>
            <TabsTrigger value="enquiries">
              Enquiries{waiting > 0 ? ` (${waiting})` : ''}
            </TabsTrigger>
            <TabsTrigger value="nearby">Nearby</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* One tab mounted at a time: Nearby asks for a location and runs
            its own searches, which nobody on the People tab asked for. */}
        <div className="mt-5">
          {view === 'people' && <PeopleTab />}
          {view === 'enquiries' && <EnquiriesTab />}
          {view === 'nearby' && <NearbyTab />}
        </div>
      </div>
    </Screen>
  );
}

/**
 * Suspense is required, not decorative: useSearchParams opts the tree into
 * client rendering, and Next fails the build without a boundary around it.
 */
export default function PeoplePage() {
  return (
    <Suspense fallback={null}>
      <People />
    </Suspense>
  );
}
