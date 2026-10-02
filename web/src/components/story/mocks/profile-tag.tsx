import { profileStatsLine } from '@/api/profile-view';
import { PROFILE_TAG, PROFILE_TAG_LINE } from '../data/strings/ch8';
import { Avatar } from './avatar';

/**
 * The profile tag that rises beside Bea's star at the end of Ch8: who she is,
 * what she does and where, and under it the stats line the web profile
 * prints under a name, from the app's own `profileStatsLine`
 * ("3 connections · 1 job done").
 *
 * Web dark, as a member sees a profile at virgo.ph/@handle: Geist, the
 * profile's own fallback avatar (muted, first two letters), the stats line
 * 14 px semibold in the foreground as there (13 px here, beside a 14 px
 * first line). The card is the sky scrim from §1.5, `#161311` at 0.94, so the
 * muted line clears AA over the brightest star.
 *
 * Not a screen: a label. The leader is a hairline toward the star on the
 * left, for a stage that wants the tag to point at it.
 *
 * States: hidden (before the zoom ends: faded, 10 px low), shown (default).
 *
 * Parts: profile-tag (data-state), tag-leader, tag-line, tag-stats.
 */

export type ProfileTagState = 'hidden' | 'shown';

export function ProfileTag({
  state = 'shown',
  leader = false,
  className = '',
}: {
  state?: ProfileTagState;
  /** A 20 px hairline off the left edge, toward the star. */
  leader?: boolean;
  className?: string;
}) {
  const shown = state === 'shown';

  return (
    <div
      aria-hidden
      data-part="profile-tag"
      data-state={state}
      className={`inline-flex rounded-[16.8px] border border-[#362F2B] font-sans text-[#F2EDE8] shadow-[0_18px_40px_-22px_rgba(0,0,0,0.85)] ${className}`}
      style={{
        background: 'rgba(22,19,17,0.94)',
        opacity: shown ? 1 : 0,
        transform: shown ? undefined : 'translateY(10px)',
      }}
    >
      {/* Positioned here rather than on the root, so a stage can place the root freely. */}
      <span className="relative flex items-center gap-3 py-2.5 pl-2.5 pr-4">
        {leader && (
          <span
            data-part="tag-leader"
            className="absolute right-[calc(100%+1px)] top-1/2 h-px w-5 -translate-y-1/2"
            style={{ background: 'linear-gradient(90deg, rgba(242,237,232,0), rgba(242,237,232,0.45))' }}
          />
        )}
        <Avatar surface="web-muted" name={PROFILE_TAG.name} size={36} />
        <span className="min-w-0">
          <span data-part="tag-line" className="block whitespace-nowrap text-[14px] leading-tight">
            <span className="font-semibold">{PROFILE_TAG.name}</span>
            <span className="text-[#BCADA3]">{PROFILE_TAG_LINE.slice(PROFILE_TAG.name.length)}</span>
          </span>
          <span data-part="tag-stats" className="mt-1 block whitespace-nowrap text-[13px] font-semibold leading-tight">
            {profileStatsLine(PROFILE_TAG.stats)}
          </span>
        </span>
      </span>
    </div>
  );
}
