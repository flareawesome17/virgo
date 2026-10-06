import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * People: your connections, the hire enquiries you have sent and received,
 * and who is nearby, as tabs. They were three pages (/network, its
 * ?tab=enquiries branch, and /nearby); the old addresses redirect here
 * (proxy.ts).
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'People' };

export default function Page() {
  return <PageClient />;
}
