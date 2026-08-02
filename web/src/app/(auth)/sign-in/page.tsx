import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Suspense is required, not decorative: useSearchParams (for the `next`
 * redirect) opts the tree into client rendering, and Next fails the build
 * without a boundary around it.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-in" />
    </Suspense>
  );
}
