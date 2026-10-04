import { DOWNLOAD_PATH, SIGN_IN_URL } from '@/components/landing/links';

/** Footer — STUB written by the page foundation; B6 replaces it (storyboard Footer). */
export function StoryFooter() {
  return (
    <footer className="relative z-10 border-t border-white/5 bg-[#161311] px-5 py-10 text-sm text-[#A08E84] sm:px-8">
      <nav aria-label="Footer" className="mx-auto flex max-w-6xl flex-wrap gap-x-5 gap-y-2">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href={DOWNLOAD_PATH}>Download</a>
        <a href={SIGN_IN_URL}>Sign in</a>
        <a href="mailto:support@virgo.ph">support@virgo.ph</a>
      </nav>
    </footer>
  );
}
