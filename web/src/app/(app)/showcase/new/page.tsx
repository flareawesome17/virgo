import type { Metadata } from 'next';
import PageClient from './page-client';

/*
 * Posting a showcase, or with ?edit=<id> changing one. The web could do
 * neither: the feed sent people to their phone to post.
 *
 * A server component so the tab title can be a real metadata export, and
 * says which of the two it is.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const { edit } = await searchParams;
  return { title: edit ? 'Edit showcase' : 'New showcase' };
}

export default function Page() {
  return <PageClient />;
}
