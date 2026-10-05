'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, CloudOff, Share2, UserSearch, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Screen } from '@/components/app-shell';
import { ConnectionActions } from '@/components/connection-actions';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { mutualConnectionsLine, profileUrl } from '@/api';
import { usePublicProfile } from '@/hooks/useProfile';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileWorkTaste, type WorkTasteTab } from '@/components/profile/work-taste';
import { PersonSafetyMenu, usePersonSafety } from '@/components/people/person-safety';

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
  const [tab, setTab] = useState<WorkTasteTab>('work');
  // Away once blocked, as on the phone: across a block this profile no
  // longer exists, and staying would only show "not found".
  const safety = usePersonSafety('profile', {
    onBlocked: () => {
      if (window.history.length > 1) router.back();
      else router.replace('/feed');
    },
  });
  // Your own handle opens your own profile, which shows your drafts, your
  // private shelves and your cover, as the phone's does.
  const isSelf = q.profile?.viewer?.isSelf === true;
  useEffect(() => {
    if (isSelf) router.replace('/profile');
  }, [isSelf, router]);

  if (q.isLoading || isSelf) return <Screen title="Profile"><CenteredSpinner /></Screen>;

  const notFound = (
    <Screen title="Profile">
      <EmptyState
        icon={UserSearch}
        title="Profile not found"
        description="This profile is private, or the handle has changed."
        action={<Button onClick={() => router.push('/people?tab=nearby')}>Find collaborators</Button>}
      />
    </Screen>
  );

  // Ahead of any cached copy: a block or an unpublish has to take the page
  // away, not leave the one from before it on screen.
  if (q.notFound) return notFound;

  // A failed load is not a missing profile. Saying "not found" to somebody on
  // a bad connection sends them away from a person who is right there.
  if (q.loadFailed) {
    return (
      <Screen title="Profile">
        <EmptyState
          icon={CloudOff}
          title="Could not load this profile"
          description="Check your connection and try again."
          action={<Button onClick={() => q.refetch()}>Try again</Button>}
        />
      </Screen>
    );
  }

  const person = q.profile;
  if (!person) return notFound;

  const mutual = mutualConnectionsLine(person.mutualConnections);

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
    <Screen title={person.displayName || 'Profile'}>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-4 text-muted-foreground"
          // Opened from a shared /@handle link there is no page to go back
          // to, and back did nothing or left the app. As the post page does.
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push('/feed');
          }}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        <ProfileHeader
          person={person}
          under={
            mutual ? (
              <p className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Users className="size-3.5" />
                {mutual}
              </p>
            ) : undefined
          }
          actions={
            <>
              <Button variant="outline" size="icon" onClick={share} aria-label="Copy link">
                <Share2 className="size-4" />
              </Button>
              {/* Where you stand with them comes first: connecting, or
                  messaging once connected, is what most visits are for. Only
                  when the API said where the viewer stands: guessing would
                  offer Connect to somebody already connected. */}
              {person.viewer && (
                <ConnectionActions
                  person={person}
                  cacheHandle={handle}
                  connection={person.viewer.connection}
                  friendId={person.viewer.friendId}
                  onStale={() => void q.refetch()}
                />
              )}
              {/* Hire only for somebody taking bookings, or when the API sent
                  no viewer block, when it is the only action there is. */}
              {(person.availableForBookings || !person.viewer) && (
                <Button asChild variant={person.viewer ? 'outline' : 'default'}>
                  <Link href={`/hire/${person.handle}`}>
                    <BriefcaseBusiness className="size-4" />
                    Hire {person.displayName.split(' ')[0]}
                  </Link>
                </Button>
              )}
              {/* By handle: a public profile carries no account id. */}
              <PersonSafetyMenu
                safety={safety}
                variant="outline"
                subject={{ name: person.displayName, target: { handle: person.handle } }}
              />
            </>
          }
        />

        <ProfileWorkTaste
          handle={person.handle}
          isSelf={false}
          firstName={person.displayName.split(' ')[0]}
          tab={tab}
          onTab={setTab}
        />
      </div>
      {safety.dialogs}
    </Screen>
  );
}
