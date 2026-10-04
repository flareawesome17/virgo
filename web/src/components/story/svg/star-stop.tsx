/**
 * B11: the page's signature full stop (storyboard §1.6). The H1's last "."
 * and the Finale's are a small warm star: an aria-hidden glyph 0.3 em wide
 * sitting on the baseline, with a real "." in an sr-only span, so screen
 * readers, search and copy-paste all get ordinary punctuation.
 *
 * Its colours are explicit rather than currentColor, so it still shows inside
 * the H1's gradient line, whose text fill is transparent.
 */
export function StarStop({ className = '', tone = '#F0C88E' }: { className?: string; tone?: string }) {
  return (
    <>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 24 24"
        className={`ml-[0.04em] inline-block h-[0.3em] w-[0.3em] overflow-visible align-baseline ${className}`}
        data-part="star-stop"
      >
        <circle cx="12" cy="12" r="12" fill={tone} opacity="0.16" />
        <circle cx="12" cy="12" r="7.5" fill={tone} opacity="0.28" />
        <path d="M12 0.5 13.7 10.3 23.5 12 13.7 13.7 12 23.5 10.3 13.7 0.5 12 10.3 10.3Z" fill={tone} />
        <circle cx="12" cy="12" r="3.4" fill="#FFF4E4" />
      </svg>
      <span className="sr-only">.</span>
    </>
  );
}
