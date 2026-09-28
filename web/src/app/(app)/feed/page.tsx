import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * A server component so the tab title can be a real metadata export, the same
 * split every other page here uses: the title resolves on the server, and the
 * interactive half stays in page-client.tsx.
 */
export const metadata: Metadata = { title: 'Feed' };

export default function Page() {
  return <PageClient />;
}
