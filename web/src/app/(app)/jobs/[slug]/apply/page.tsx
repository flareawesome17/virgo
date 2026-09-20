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


/**
 * One placeholder route, so the desktop build has a shell to serve.
 *
 * Same reason as the parent route: `output: export` refuses a dynamic segment
 * it cannot enumerate, and job slugs are not ours to enumerate. The client
 * component below takes the slug from the URL, so one shell serves them all.
 */
export function generateStaticParams() {
  return [{ slug: 'placeholder' }];
}

export default function Page() {
  return <PageClient />;
}
