import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * Everything you have kept, on any shelf: the "All kept" collection that
 * leads the Taste tab on your own profile.
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'All kept' };

export default function Page() {
  return <PageClient />;
}
