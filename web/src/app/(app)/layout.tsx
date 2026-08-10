'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';
import { VisitBeacon } from '@/components/visit-beacon';

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
      {children}
    </AuthGuard>
  );
}
