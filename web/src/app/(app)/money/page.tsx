import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * A server component so the tab title can be a real metadata export; the
 * page itself is page-client.tsx. See schedule/page.tsx.
 */
export const metadata: Metadata = { title: 'Money' };

export default function Page() {
  return <PageClient />;
}
