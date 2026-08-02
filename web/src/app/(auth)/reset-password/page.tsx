import { Suspense } from 'react';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/components/password-flows';

export const metadata: Metadata = { title: 'Choose a new password' };

/**
 * Suspense is required, not decorative: useSearchParams opts the tree into
 * client rendering and Next fails the build without a boundary around it.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
