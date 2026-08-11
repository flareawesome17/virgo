import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SignUpWizard } from '@/components/sign-up-wizard';

export const metadata: Metadata = { title: 'Create account' };

/**
 * `useSearchParams` inside the wizard reads the `next` the auth guard set, so
 * the boundary is required — without it this route opts into dynamic
 * rendering.
 */
export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpWizard />
    </Suspense>
  );
}
