/**
 * Decides, before anything paints, whether the story moves.
 *
 * Writes three attributes on <html>, read by CSS and by `useMotionGate`:
 * - `data-motion="on"` only when the reader has not asked for reduced motion,
 *   the screen is at least 520 px tall, and Save-Data is off. Otherwise "off",
 *   and the page stays the static, complete server render (storyboard §1.1).
 * - `data-paused` when the reader pressed Pause motion on an earlier visit.
 * - `data-lite` on Save-Data, 2g/3g or ≤ 2 GB devices: fewer stars, no video.
 * - `data-lenis="on"` when the story moves and the pointer is a mouse or
 *   trackpad: the page scrolls smoothly (cinema/smooth-scroll.tsx), and the
 *   scenes' own glide steps aside so the two never stack.
 *
 * Inline and first in <body>, so it runs while the document is still parsing.
 * Every access is guarded: a blocked storage or an old browser leaves the page
 * static, which is always a correct page.
 */
const SCRIPT = `(function(){try{var d=document.documentElement,c=navigator.connection||{},save=!!c.saveData,ok=window.matchMedia&&matchMedia('(prefers-reduced-motion: no-preference) and (min-height: 520px)').matches;d.setAttribute('data-motion',ok&&!save?'on':'off');if(ok&&!save&&matchMedia('(pointer: fine)').matches)d.setAttribute('data-lenis','on');if(save||/(^|-)(2g|3g)$/.test(c.effectiveType||'')||(navigator.deviceMemory&&navigator.deviceMemory<=2))d.setAttribute('data-lite','');try{if(localStorage.getItem('virgo.pauseMotion')==='1')d.setAttribute('data-paused','')}catch(e){}}catch(e){}})();`;

export function PrePaint() {
  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}

/** The storage key Pause motion writes. */
export const PAUSE_KEY = 'virgo.pauseMotion';
