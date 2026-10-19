import type { Metadata } from 'next';
import PageClient from './page-client';

/* A server component so the tab title can be a real metadata export. */
export const metadata: Metadata = { title: 'Blocked people' };

export default function Page() {
  return <PageClient />;
}
