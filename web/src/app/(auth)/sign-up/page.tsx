import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Create account' };

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm mode="sign-up" />
    </Suspense>
  );
}
