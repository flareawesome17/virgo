import { Check, Copy, ExternalLink, Link2, ShieldAlert, X } from 'lucide-react';
import { DIALOG, LINK_URL, SHARE_KINDS, type ShareKind } from '../data/strings/ch6';

/**
 * The web app's "Client link" dialog (Ch6, desktop), drawn from
 * `web/src/components/media/share-dialog.tsx` in the web dark theme:
 *
 * - DialogContent: 16.8 px radius, `#1E1B18`, p-4, a 1 px foreground/10 ring,
 *   384 px wide; the ghost close button top right.
 * - "What the link shows": three checkbox rows (the Checkbox is 16 px, 4 px
 *   radius, `#D18A5A` with a `#161311` tick when checked) and the helper line.
 * - Once a link exists: the read-only Link field in mono (12 px on a phone,
 *   14 px from md, as the Input's classes merge) with Copy and Open buttons,
 *   and the ShieldAlert note.
 * - The footer (muted/50, border-t): "Revoke link" in outline destructive on
 *   the left once a link exists, and the action Button (`#A85D35`, white) on
 *   the right: Generate link, Update link, or "Link is up to date" (disabled).
 *
 * A static card, not a modal: no overlay, no focus trap, no controls. At its
 * desktop width (384 px) the footer is one row; squeezed narrower it stacks,
 * the button over Revoke, as the real one does on a small screen.
 *
 * States, in story order:
 *   fresh      no link yet; the dialog's default, everything ticked
 *   scoped     no link yet; Photos only                     → Generate link
 *   generated  the link is made; Photos only                → Link is up to date
 *   rescoped   three weeks later; Videos and Audio ticked   → Update link
 *   updated    the same link, now showing all three (default, the end of Ch6)
 *
 * Every state's markup is the same: a state only sets attributes, and CSS
 * draws them. So a stage can tick a box by setting `data-on` on its
 * `kind-*` row, show the link by setting `data-on` on `link-field` and
 * `revoke`, and flip the button with `data-state` on `cta`
 * (generate | update | uptodate), all without re-rendering.
 *
 * Parts: share-dialog (data-state), dialog-close, dialog-title,
 * dialog-description, kind-image / kind-video / kind-audio (data-on),
 * check-image / check-video / check-audio, kinds-helper, link-field (data-on),
 * link-url, link-note, dialog-footer, revoke (data-on), cta (data-state).
 */

export type ShareDialogState = 'fresh' | 'scoped' | 'generated' | 'rescoped' | 'updated';
export type ShareDialogCta = 'generate' | 'update' | 'uptodate';

export const SHARE_DIALOG_STATES: Record<
  ShareDialogState,
  { kinds: readonly ShareKind[]; link: boolean; cta: ShareDialogCta }
> = {
  fresh: { kinds: SHARE_KINDS, link: false, cta: 'generate' },
  scoped: { kinds: ['image'], link: false, cta: 'generate' },
  generated: { kinds: ['image'], link: true, cta: 'uptodate' },
  rescoped: { kinds: SHARE_KINDS, link: true, cta: 'update' },
  updated: { kinds: SHARE_KINDS, link: true, cta: 'uptodate' },
};

/** The outline Button and the Input, in dark: border-input, input/30. */
const OUTLINE = 'border border-[#362F2B] bg-[rgba(54,47,43,0.3)]';

const on = (yes: boolean) => (yes ? '' : undefined);

export function ShareDialog({
  state = 'updated',
  className = '',
}: {
  state?: ShareDialogState;
  className?: string;
}) {
  const s = SHARE_DIALOG_STATES[state];

  return (
    <div
      aria-hidden
      data-part="share-dialog"
      data-state={state}
      className={`@container relative grid w-full max-w-[384px] gap-4 rounded-[16.8px] bg-[#1E1B18] p-4 font-sans text-sm text-[#F2EDE8] shadow-[0_0_0_1px_rgba(242,237,232,0.1)] ${className}`}
    >
      <span
        data-part="dialog-close"
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-[9.6px] text-[#F2EDE8]"
      >
        <X aria-hidden className="size-4" />
      </span>

      <div className="flex flex-col gap-2">
        <p data-part="dialog-title" className="text-base font-medium leading-none">
          {DIALOG.title}
        </p>
        <p data-part="dialog-description" className="text-sm text-[#A08E84]">
          {DIALOG.description}
        </p>
      </div>

      <div className="grid gap-4 py-1">
        <div className="grid gap-2">
          <p className="flex items-center gap-2 text-sm font-medium leading-none">{DIALOG.shows}</p>
          <div className="flex flex-col gap-1">
            {SHARE_KINDS.map((kind) => (
              <div
                key={kind}
                data-part={`kind-${kind}`}
                data-on={on(s.kinds.includes(kind))}
                className="group/kind flex items-center gap-3 rounded-[12px] px-1 py-2"
              >
                <span
                  data-part={`check-${kind}`}
                  className="relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-[#362F2B] bg-[rgba(54,47,43,0.3)] text-[#161311] group-data-[on]/kind:border-[#D18A5A] group-data-[on]/kind:bg-[#D18A5A]"
                >
                  <Check aria-hidden className="size-3.5 opacity-0 group-data-[on]/kind:opacity-100" />
                </span>
                <span className="text-sm">{DIALOG.kinds[kind]}</span>
              </div>
            ))}
          </div>
          <p data-part="kinds-helper" className="text-xs text-[#A08E84]">
            {DIALOG.helper}
          </p>
        </div>

        {/* There is no link until one is generated; the real dialog adds this
            block then, and grows by its height. */}
        <div data-part="link-field" data-on={on(s.link)} className="hidden gap-2 data-[on]:grid">
          <p className="flex items-center gap-2 text-sm font-medium leading-none">{DIALOG.link}</p>
          <div className="flex gap-2">
            {/* The read-only Input. The app passes `font-mono text-xs`, and its
                cn() merge keeps the Input's own `md:text-sm`, so the address is
                12 px on a phone and 14 px from 768 up. An input adds nothing to
                its parents' minimum width and clips what does not fit;
                `contain: inline-size` does the same for this span, so a narrow
                dialog clips the address instead of growing past its frame. */}
            <span
              data-part="link-url"
              className={`flex h-8 w-full min-w-0 items-center overflow-hidden whitespace-nowrap rounded-[12px] px-2.5 font-mono text-xs [contain:inline-size] md:text-sm ${OUTLINE}`}
            >
              {LINK_URL}
            </span>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-[12px] ${OUTLINE}`}>
              <Copy aria-hidden className="size-4" />
            </span>
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-[12px] ${OUTLINE}`}>
              <ExternalLink aria-hidden className="size-4" />
            </span>
          </div>
          <p data-part="link-note" className="mt-1 flex items-start gap-2 text-xs leading-relaxed text-[#A08E84]">
            <ShieldAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {DIALOG.note}
          </p>
        </div>
      </div>

      <div
        data-part="dialog-footer"
        className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-[16.8px] border-t border-[#362F2B] bg-[rgba(42,37,34,0.5)] p-4 @min-[352px]:flex-row @min-[352px]:items-center @min-[352px]:justify-between"
      >
        {/* Before there is a link the real footer holds an empty span here; an
            invisible Revoke keeps the same place without changing the layout. */}
        <span
          data-part="revoke"
          data-on={on(s.link)}
          className={`hidden h-8 items-center justify-center whitespace-nowrap rounded-[12px] px-2.5 text-sm font-medium text-[#C8503C] opacity-0 data-[on]:inline-flex data-[on]:opacity-100 @min-[352px]:inline-flex ${OUTLINE}`}
        >
          {DIALOG.revoke}
        </span>
        <span
          data-part="cta"
          data-state={s.cta}
          className="group/cta inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] bg-[#A85D35] px-2.5 text-sm font-medium text-white data-[state=uptodate]:opacity-50"
        >
          <Link2 aria-hidden className="size-4" />
          <span className="hidden group-data-[state=generate]/cta:inline">{DIALOG.generate}</span>
          <span className="hidden group-data-[state=update]/cta:inline">{DIALOG.update}</span>
          <span className="hidden group-data-[state=uptodate]/cta:inline">{DIALOG.upToDate}</span>
        </span>
      </div>
    </div>
  );
}
