import { toast } from 'sonner';
import { showcaseShareUrl, showcaseStatus, type FeedItem } from '@/api';
import { IS_DESKTOP } from '@/lib/desktop';

/** The same origin every other share link on the web app is built on. */
const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN || 'https://virgo.ph';

/**
 * Whether a post has a link to hand out, and what to say when it does not.
 *
 * The public page at /p/<id> answers "not found" for anything that is not
 * public and live, so offering a link to anything else hands out a 404. The
 * owner is still shown the control with the reason, because "where did Share
 * go?" is the question a private post raises; anybody else is simply not
 * offered one.
 */
export type Shareability =
  | { ok: true }
  | { ok: false; reason: string; /** Show the control anyway, explaining. */ offer: boolean };

type Shareable = Pick<
  FeedItem,
  'id' | 'title' | 'visibility' | 'publishedAt' | 'unpublishedAt' | 'hiddenAt'
>;

export function shareability(item: Shareable, mine: boolean): Shareability {
  const status = showcaseStatus(item);
  if (status === 'removed') {
    return { ok: false, offer: mine, reason: "Virgo took this post down, so it can't be shared." };
  }
  if (status !== 'live') return { ok: false, offer: mine, reason: 'Make it public to share it.' };
  if (item.visibility === 'connections') {
    return {
      ok: false,
      offer: mine,
      reason: 'Only your connections can see it. Make it public to share it.',
    };
  }
  return { ok: true };
}

/** The address a post is shared at. */
export function showcaseLink(id: string): string {
  return showcaseShareUrl(id, SITE);
}

/**
 * Hands a post's link over: the system share sheet where there is one, the
 * clipboard where there is not.
 *
 * Phones and Safari have a share sheet, which reaches the apps people actually
 * send things through. The desktop app's webview may expose `navigator.share`
 * without it doing anything useful, so the app always copies. A dismissed
 * sheet is not a failure and says nothing; any other refusal falls back to
 * copying, so a click on Share never ends with nothing happening.
 */
export async function shareShowcase(item: {
  id: string;
  title: string | null;
  makerName: string;
}): Promise<void> {
  const url = showcaseLink(item.id);
  const title = item.title ?? `${item.makerName} on Virgo`;
  const data: ShareData = { title, text: `${title} — ${item.makerName}`, url };

  if (!IS_DESKTOP && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    const allowed = typeof navigator.canShare !== 'function' || navigator.canShare(data);
    if (allowed) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Anything else (no user gesture left, a policy refusal): copy instead.
      }
    }
  }
  await copyLink(url);
}

async function copyLink(url: string): Promise<void> {
  if (await writeClipboard(url)) {
    toast.success('Link copied', { description: url });
    return;
  }
  // Nothing would copy (an insecure origin, a refused permission): the address
  // is shown instead, so it can still be copied by hand.
  toast.info(url);
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The async clipboard needs a secure context and, in some webviews, a
    // permission that is not granted. The old selection-and-copy still works
    // in both of those places.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  } catch {
    return false;
  }
}
