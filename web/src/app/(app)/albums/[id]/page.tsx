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
export const metadata: Metadata = { title: "Album" };


/**
 * One placeholder route, so the desktop build has a shell to serve.
 *
 * `output: export` refuses a dynamic segment it cannot enumerate, and these
 * ids belong to the person using the app — there is no list to give it. The
 * page does not read this value: everything below the title is a client
 * component that takes the id from the URL with `useParams`, so the shell
 * generated here works for any id the app navigates to.
 *
 * The hosted build ignores this entirely — it renders per request.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <PageClient />;
}
