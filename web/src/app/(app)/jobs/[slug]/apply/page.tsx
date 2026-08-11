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
 */
export const metadata: Metadata = { title: "Apply" };

export default function Page(props: { params: Promise<{ slug: string }> }) {
  return <PageClient {...props} />;
}
