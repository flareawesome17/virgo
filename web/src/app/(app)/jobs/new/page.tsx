import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * A server component so the tab title can be a real metadata export.
 *
 * `metadata` is Server Components only, and this page is interactive, so
 * the two halves are split: the title is resolved on the server and sent
 * in the initial HTML, and everything below it stays a client component in
 * page-client.tsx. Setting document.title from the client instead loses a
 * race against Next re-asserting this value after every navigation.
 *
 * With ?edit=<slug> the same form changes a post that is already up, and the
 * tab says so.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { edit } = await searchParams;
  return { title: edit ? 'Edit job post' : 'Post a job' };
}

export default function Page() {
  return <PageClient />;
}
