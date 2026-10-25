import type { Metadata } from 'next';
import PageClient from './page-client';

/* A server component so the tab title can be a real metadata export; see ../page.tsx. */
export const metadata: Metadata = { title: 'Recently deleted' };

export default function Page() {
  return <PageClient />;
}
