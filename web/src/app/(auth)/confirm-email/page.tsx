import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ConfirmEmailChangeView } from '@/components/password-flows';

export const metadata: Metadata = { title: 'Confirm your new email' };

/**
 * Where the link from "Change email" lands. Suspense for the same reason as
 * verify-email: useSearchParams needs a boundary or the build fails.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ConfirmEmailChangeView />
    </Suspense>
  );
}
