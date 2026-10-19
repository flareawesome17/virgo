import type { Metadata } from 'next';
import PageClient from './page-client';

/* A server component so the tab title can be a real metadata export. */
export const metadata: Metadata = { title: 'Account & security' };

/**
 * `?change=password` or `?change=email` opens that form straight away: where
 * the phone's /settings/password and /settings/email addresses land.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { change } = await searchParams;
  return <PageClient change={change === 'password' || change === 'email' ? change : null} />;
}
