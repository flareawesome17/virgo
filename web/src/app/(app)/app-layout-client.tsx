'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { VisitBeacon } from '@/components/visit-beacon';
import { UploadProvider } from '@/components/upload/upload-provider';
import { VideoPlaybackProvider } from '@/components/media/video-playback';
import { VideoSurface } from '@/components/media/video-surface';
import { AppShell } from '@/components/app-shell';
import { CreateProvider } from '@/components/shell/create';

/**
 * Everything behind the sign-in wall.
 *
 * The guard lives on the group layout rather than on each page so a new route
 * cannot be added unprotected by omission. The shell lives here too, for the
 * same reason and one more: a layout is kept across navigations, so the
 * sidebar, the bar and the upload dock stay put while the pages change.
 */
export function AppLayoutClient({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/* Inside the guard, so a signed-out visitor bouncing off a deep link
          does not register as having used the screen they never saw. */}
      <VisitBeacon />
      {/* Above the pages rather than inside any of them: a film keeps
          playing when you navigate away from the album that started it,
          and an upload outlives the page it started on. */}
      <VideoPlaybackProvider>
        <UploadProvider>
          <CreateProvider>
            <AppShell>{children}</AppShell>
          </CreateProvider>
        </UploadProvider>
        <VideoSurface />
      </VideoPlaybackProvider>
    </AuthGuard>
  );
}
