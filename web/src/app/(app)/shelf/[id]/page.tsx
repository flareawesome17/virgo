import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * One shelf of kept work. Keep put things on shelves nobody could open on the
 * web; this is where they are read, and where your own are looked after.
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'Shelf' };

export default function Page() {
  return <PageClient />;
}
