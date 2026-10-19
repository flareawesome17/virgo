'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CloudOff, EyeOff, Pencil, Plus, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { Screen } from '@/components/app-shell';
import { CenteredSpinner, EmptyState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { ProfileHeader } from '@/components/profile/profile-header';
import { CoverControl } from '@/components/profile/cover-editor';
import { ProfileWorkTaste, type WorkTasteTab } from '@/components/profile/work-taste';
import { useProfilePage } from '@/hooks/useProfile';
import { profileUrl } from '@/api';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph';

function OwnProfile() {
  const router = useRouter();
  const params = useSearchParams();
  const tab: WorkTasteTab = params.get('tab') === 'taste' ? 'taste' : 'work';
  const { page, isLoading, loadFailed, refetch } = useProfilePage();

  if (!page) {
    return (
      <Screen title="Your profile">
        {isLoading ? (
          <CenteredSpinner />
        ) : (
          <EmptyState
            icon={CloudOff}
            title="Could not load your profile"
            description={loadFailed ? 'Check your connection and try again.' : 'Try again in a moment.'}
            action={<Button onClick={() => void refetch()}>Try again</Button>}
          />
        )}
      </Screen>
    );
  }

  const share = async () => {
    if (!page.handle) return;
    const url = profileUrl(page.handle, SITE);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', { description: url });
    } catch {
      toast.info(url);
    }
  };

  return (
    <Screen title="Your profile">
      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {!page.published && (
          // Said, so nobody shares a link to a page only they can open.
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm">
            <EyeOff className="size-4 shrink-0 text-muted-foreground" />
            <p className="min-w-0 flex-1">
              Only you can see this page. Publish your profile to be found and hired.
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/settings/profile">Publish</Link>
            </Button>
          </div>
        )}

        <ProfileHeader
          person={page}
          coverControl={<CoverControl hasCover={!!page.coverUrl} />}
          actions={
            <>
              {page.published && page.handle && (
                <Button variant="outline" size="icon" onClick={share} aria-label="Copy link">
                  <Share2 className="size-4" />
                </Button>
              )}
              <Button asChild variant="outline">
                <Link href="/settings/profile">
                  <Pencil className="size-4" />
                  Edit profile
                </Link>
              </Button>
              <Button asChild>
                <Link href="/showcase/new">
                  <Plus className="size-4" />
                  Post a showcase
                </Link>
              </Button>
            </>
          }
        />

        <ProfileWorkTaste
          handle={page.handle}
          isSelf
          firstName={page.displayName.split(' ')[0]}
          tab={tab}
          onTab={(next) => router.replace(next === 'work' ? '/profile' : '/profile?tab=taste')}
        />
      </div>
    </Screen>
  );
}

/** Suspense, for useSearchParams: Next fails the build without a boundary. */
export default function OwnProfilePage() {
  return (
    <Suspense fallback={null}>
      <OwnProfile />
    </Suspense>
  );
}
