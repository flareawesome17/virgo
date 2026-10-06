import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * The Jobs screen: the board, your posts, your applications and your
 * bookings, as tabs. It lived at /jobs/mine, with Bookings a page of its own;
 * the old addresses redirect here (proxy.ts).
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'Jobs' };

export default function Page() {
  return <PageClient />;
}
