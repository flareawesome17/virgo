import { Platform, Share } from 'react-native';
import { showcaseShareUrl, showcaseStatus, type Showcase } from '@/src/api';
import { SITE } from '@/src/lib/profile-media';

/**
 * Whether a post has a link anybody can open: public, posted, and not taken
 * down by its author or by Virgo. The page behind the link answers "not found"
 * for anything else, so offering to share one would hand somebody a dead link.
 */
export function isShareable(
  showcase: Pick<Showcase, 'visibility' | 'publishedAt' | 'unpublishedAt' | 'hiddenAt'>,
): boolean {
  return showcase.visibility === 'public' && showcaseStatus(showcase) === 'live';
}

/**
 * Hands the post's link to the phone's own share sheet.
 *
 * A link, never the files: the page it opens carries a preview other apps can
 * draw, and the work stays where its author can take it down. iOS reads the
 * address from `url` and puts `message` beside it; Android ignores `url`
 * entirely, so there the address goes at the end of the message.
 *
 * Resolves whether or not anything was shared — dismissing the sheet is not a
 * failure, and there is nothing useful to tell somebody if the sheet itself
 * would not open.
 */
export async function shareShowcase(
  showcase: Pick<Showcase, 'id' | 'title'>,
  makerName: string,
): Promise<void> {
  const url = showcaseShareUrl(showcase.id, SITE);
  const text = `${showcase.title?.trim() || 'A showcase'} by ${makerName} on Virgo`;
  try {
    await Share.share(
      Platform.OS === 'ios' ? { url, message: text } : { message: `${text}: ${url}` },
    );
  } catch {
    // The sheet did not open. Nothing was sent, and nothing needs saying.
  }
}
