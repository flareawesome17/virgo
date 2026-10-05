import { toast } from 'sonner';
import { jobUrl } from '@/api';

const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph';

/**
 * Copies a post's public address and says what was copied.
 *
 * One place for it because two screens offer it — the post's own Share button
 * and the "Your job is live" toast — and they should hand out the same link.
 * When the clipboard refuses (an insecure origin, a denied permission), the
 * address is shown instead so it can still be copied by hand.
 */
export async function copyJobLink(slug: string): Promise<void> {
  const url = jobUrl(slug, SITE);
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied', { description: url });
  } catch {
    toast.info(url);
  }
}
