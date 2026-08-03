import { randomBytes } from 'node:crypto';

/** Words that carry no meaning in a URL and only make it longer. */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'with',
  'we', 'need', 'needed', 'looking', 'wanted', 'hiring', 'urgent', 'asap',
]);

/**
 * A readable, permanent address for a post.
 *
 * `wedding-photographer-cebu-k3f9x2`. The words are for the reader and for
 * search; the suffix is what makes it unique, so two people posting "Wedding
 * photographer needed" do not collide and neither has to be renamed.
 *
 * Generated once at insert and never regenerated — editing a title must not
 * move a URL that has already been shared and indexed.
 */
export function slugify(title: string): string {
  const words = title
    .toLowerCase()
    // Strip accents so "Cebú" and "Cebu" produce the same slug.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .slice(0, 6);

  // A title of nothing but stop words and punctuation still needs an address.
  const stem = words.join('-') || 'job';

  return `${stem}-${suffix()}`;
}

/** Lowercase letters and digits only. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Six random characters, to keep two posts of the same title apart.
 *
 * Not base64url, which was the obvious reach and wrong: its alphabet includes
 * `-` and `_`, so a suffix could produce `...wedding--x9z` or an underscore in
 * the middle of an otherwise hyphenated URL.
 *
 * The modulo is very slightly biased — 256 does not divide by 36 — which would
 * matter for a token and does not matter at all here. This is a collision
 * suffix on a public post, not a secret; 36^6 is 2.2 billion either way.
 */
function suffix(): string {
  let out = '';
  for (const byte of randomBytes(6)) out += ALPHABET[byte % ALPHABET.length];
  return out;
}
