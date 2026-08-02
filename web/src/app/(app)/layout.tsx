'use client';

import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/auth-guard';

/**
 * Everything behind the sign-in wall.
 *
 * The guard lives on the group layout rather than on each page so a new route
 * cannot be added unprotected by omission.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
