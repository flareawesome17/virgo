/**
 * Initials avatars, drawn the way each surface of the app draws them
 * (storyboard §4 B8). Never a solid fill: always a tint with coloured
 * letters. The story has no photographs of people, so every face is one of
 * these.
 *
 * | surface          | app source                                  | fill            | letters            |
 * |------------------|---------------------------------------------|-----------------|--------------------|
 * | phone-nearby     | mobile discover/nearby.tsx, mention picker  | #B66A40 at 9%   | first letter       |
 * | phone-chat       | mobile (tabs)/chat.tsx                      | primary at 9%   | first letter       |
 * | phone-attendee   | mobile components/EventInvites.tsx          | #B66A40 at 13%  | first two letters  |
 * | web              | web nearby, chat (fallback bg-primary/15)   | primary/15      | first two letters  |
 * | web-muted        | web jobs applicants (plain fallback)        | muted           | first two letters  |
 * | workspace        | web workspaces/bits.tsx PersonAvatar        | primary/15      | first + last       |
 * | phone-showcase   | mobile feed Placard (showcase author)       | primary at 15%  | first letter       |
 *
 * One deliberate deviation (§1.5): the phone's letters are `#D18A5A`, not the
 * app's `#B66A40`, so they clear AA on the dark ground.
 *
 * Text never goes under 11 px; below 28 px a two-letter surface shows one
 * letter rather than shrink (or crowd its neighbours in a stack).
 */

export type AvatarSurface =
  | 'phone-nearby'
  | 'phone-chat'
  | 'phone-attendee'
  | 'phone-showcase'
  | 'web'
  | 'web-muted'
  | 'workspace';

type Spec = {
  bg: string;
  fg: string;
  letters: (name: string) => string;
  /** The size the app draws on this surface. */
  size: number;
  /** Letter size as a share of the diameter. */
  font: number;
  /** The web Avatar's 1 px border-border overlay. */
  ring: boolean;
  /** Letter weight. The jobs applicant fallback sets none, so it renders regular. */
  weight?: 400 | 700;
};

const firstLetter = (name: string) => name.trim().charAt(0).toUpperCase();
const firstTwo = (name: string) => name.trim().slice(0, 2).toUpperCase();
/** PersonAvatar: first and last initials, or the first two letters of one word. */
const firstLast = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[words.length - 1][0] : name.trim().slice(0, 2)).toUpperCase();
};

const PHONE_INK = '#D18A5A';

const SPECS: Record<AvatarSurface, Spec> = {
  'phone-nearby': { bg: '#B66A4018', fg: PHONE_INK, letters: firstLetter, size: 44, font: 16 / 44, ring: false },
  'phone-chat': { bg: '#D18A5A18', fg: PHONE_INK, letters: firstLetter, size: 48, font: 17 / 48, ring: false },
  'phone-attendee': { bg: '#B66A4022', fg: PHONE_INK, letters: firstTwo, size: 34, font: 0.35, ring: false },
  'phone-showcase': { bg: '#D18A5A26', fg: PHONE_INK, letters: firstLetter, size: 36, font: 14 / 36, ring: false },
  web: { bg: 'rgba(209,138,90,0.15)', fg: '#D18A5A', letters: firstTwo, size: 44, font: 12 / 44, ring: true },
  'web-muted': { bg: '#2A2522', fg: '#A08E84', letters: firstTwo, size: 32, font: 0.3, ring: true, weight: 400 },
  workspace: { bg: 'rgba(209,138,90,0.15)', fg: '#D18A5A', letters: firstLast, size: 32, font: 11 / 32, ring: true },
};

/** What an avatar on `surface` would print for `name`. */
export function avatarLetters(surface: AvatarSurface, name: string, size = SPECS[surface].size): string {
  const letters = SPECS[surface].letters(name);
  return size < 28 ? letters.charAt(0) : letters;
}

export function Avatar({
  surface,
  name,
  size,
  ring,
  className = '',
}: {
  surface: AvatarSurface;
  name: string;
  /** Diameter in px. Defaults to the size the app uses on this surface. */
  size?: number;
  /** A separating ring in this colour, for overlapping stacks (the app's ring-2 ring-card). */
  ring?: string;
  className?: string;
}) {
  const spec = SPECS[surface];
  const d = size ?? spec.size;
  const font = Math.max(11, Math.round(d * spec.font));
  const shadows = [
    spec.ring ? 'inset 0 0 0 1px #362F2B' : '',
    ring ? `0 0 0 2px ${ring}` : '',
  ].filter(Boolean);

  return (
    <span
      aria-hidden
      data-part="avatar"
      data-surface={surface}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full leading-none ${className}`}
      style={{
        fontWeight: spec.weight ?? 700,
        width: d,
        height: d,
        fontSize: font,
        background: spec.bg,
        color: spec.fg,
        boxShadow: shadows.length ? shadows.join(', ') : undefined,
      }}
    >
      {avatarLetters(surface, name, d)}
    </span>
  );
}
