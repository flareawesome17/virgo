import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * Your profile as other people see it, with your work (drafts and posts you
 * took down included, marked), your taste (private shelves included) and your
 * cover, as the phone's Profile is. Editing what it says is
 * /settings/profile.
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'Your profile' };

export default function Page() {
  return <PageClient />;
}
