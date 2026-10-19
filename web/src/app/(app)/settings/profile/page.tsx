import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * Editing your profile, under Settings as on the phone. It was /profile, a
 * page of its own; that address redirects here (proxy.ts). Your profile as
 * others see it is /u/<handle>.
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'Profile' };

export default function Page() {
  return <PageClient />;
}
