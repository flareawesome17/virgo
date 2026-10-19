import type { Metadata } from 'next';
import { LegalClient } from './legal-client';

/*
 * A server component so the tab has a title. The page itself reads the tab
 * from the URL, so it stays a client component beside this one.
 */
export const metadata: Metadata = { title: 'Terms and privacy' };

export default function LegalPage() {
  return <LegalClient />;
}
