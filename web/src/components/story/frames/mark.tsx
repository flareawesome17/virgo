/**
 * The Virgo mark, as the frames draw it: the real `logo.png`, never a
 * redrawing (storyboard B13).
 *
 * A background image on a span rather than an `<img>` or `next/image`:
 * frames are decorative, aria-hidden, server-only markup, and this keeps
 * them free of client components and of an image request per size.
 */
export function VirgoMark({ size, className = '' }: { size: number; className?: string }) {
  return (
    <span
      aria-hidden
      data-part="mark"
      className={`inline-block shrink-0 bg-contain bg-center bg-no-repeat ${className}`}
      style={{ width: size, height: size, backgroundImage: 'url(/logo.png)' }}
    />
  );
}

/** The app icon as a phone shows it in a notification: the mark on a dark tile. */
export function AppIconTile({ size = 20 }: { size?: number }) {
  return (
    <span
      aria-hidden
      data-part="app-icon"
      className="inline-flex shrink-0 items-center justify-center bg-[#161311]"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    >
      <VirgoMark size={Math.round(size * 0.78)} />
    </span>
  );
}
