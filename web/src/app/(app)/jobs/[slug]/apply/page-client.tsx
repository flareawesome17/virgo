'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Screen } from '@/components/app-shell';
import { CenteredSpinner } from '@/components/states';

/**
 * Where applying used to be.
 *
 * It happens on the job's own page now, in the card beside the post. This
 * address is kept because links to it are still out there, on the public
 * post page and in bookmarks, and it sends them on. To `#apply`, so that on a
 * narrow window, where that card sits under the post, the page opens at it.
 */
export default function ApplyPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  useEffect(() => {
    // replace, not push, so Back does not land here and be sent on again.
    router.replace(`/jobs/${slug}#apply`);
  }, [router, slug]);

  return <Screen title="Job"><CenteredSpinner /></Screen>;
}
