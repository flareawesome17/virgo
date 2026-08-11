import type { Metadata } from 'next';
import { Suspense } from 'react';
import { CheckInbox } from '@/components/check-inbox';

export const metadata: Metadata = { title: 'Check your inbox' };

/**
 * Where signing up ends.
 *
 * It used to end on the home screen, because registering returned a session.
 * It no longer does — the address has to be confirmed before there is any way
 * in — so this is the last thing a new account sees until they open the email.
 */
export default function Page() {
  return (
    <Suspense>
      <CheckInbox />
    </Suspense>
  );
}
