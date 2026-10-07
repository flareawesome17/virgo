import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * One shelf of kept work. Keep put things on shelves nobody could open on the
 * web; this is where they are read, and where your own are looked after.
 *
 * A server component so the tab title can be a real metadata export.
 */
export const metadata: Metadata = { title: 'Shelf' };

/**
 * One placeholder route, so the desktop build has a shell to serve.
 *
 * `output: export` refuses a dynamic segment it cannot enumerate, and shelf
 * ids belong to whoever made them — there is no list to give it. The page
 * does not read this value: everything below the title is a client component
 * that takes the id from the URL with `useParams`, so the shell generated here
 * works for any shelf the app navigates to. As the post's page does it.
 *
 * The hosted build ignores this entirely — it renders per request.
 */
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page() {
  return <PageClient />;
}
