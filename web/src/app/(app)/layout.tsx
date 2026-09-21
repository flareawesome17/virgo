'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { VisitBeacon } from '@/components/visit-beacon';
import { UploadProvider } from '@/components/upload/upload-provider';

/**
 * Everything behind the sign-in wall.
 *
 * The guard lives on the group layout rather than on each page so a new route
 * cannot be added unprotected by omission.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      {/* Inside the guard, so a signed-out visitor bouncing off a deep link
          does not register as having used the screen they never saw. */}
      <VisitBeacon />
      {/* Above every page, so an upload outlives the page it started on. */}
      <UploadProvider>{children}</UploadProvider>
    </AuthGuard>
  );
}
