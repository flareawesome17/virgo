import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, CalendarDays, Check, MapPin, Send, X } from 'lucide-react';
import { FILLED, FORM, FORM_ROLES, POSTED_STAMP, STILL_NEEDS } from '../data/strings/ch1';

/**
 * The phone app's "Post a job" screen (`mobile/app/(app)/jobs/new.tsx`),
 * filling in as Ch1 scrolls: roles switch on, budgets type in, the brief
 * types in, and the post goes up at 11:58 PM.
 *
 * Drawn from the app: the fixed header, then a scroll of 20 px padding and
 * 18 px gaps holding the intro, the title, the role chips, the date, the
 * place, the budgets (which only exist once a role is picked), the brief,
 * "Post it" (at 40% until the form is ready) and the helper under it. The
 * helper is the app's own blocker sentence until the form is ready; "Posts
 * run for 30 days…" shows only once it is. The brief's hint becomes the
 * counter at 30 characters. Fills follow the phone (§1.5): the button and the
 * picked chips are `#A85D35` with white; small accent text is `#D18A5A`, not
 * the app's `#B66A40`, so it clears AA.
 *
 * One DOM for every state, so a Phase 4 island can play the whole fill:
 * - Typed fields stack the placeholder and the value in one grid cell and
 *   crossfade them (`*-placeholder` / `*-value`, opacity).
 * - Chips flip with `data-on`; the button's readiness is its opacity.
 * - Two changes are layout, exactly as in the app, and flip discretely with
 *   the `hidden` attribute: the budgets block appearing with the first role,
 *   and the brief's hint giving way to the counter.
 * - Scrolling is two transforms, never `top`: `job-scroll` moves down by
 *   t × the viewport and `job-column` up by t × its own height, so t = 0 is
 *   the top of the form and t = 1 its bottom at any width. Write both with
 *   the same t to scroll; `JOB_FORM_SCROLL` holds each state's rest value.
 *
 * The "Posted" stamp is the page's annotation, not app UI: a mono slate in
 * the page's accent, set apart from the form.
 *
 * Fills `PhoneFrame`'s content area (absolute inset-0); give the phone a
 * screen at least 340 px wide so the title fits on its line.
 *
 * Parts: job-form (data-state), job-header, job-viewport, job-scroll,
 * job-column, field-title, title-placeholder, title-value, roles,
 * role-<role> (data-on), field-date, date-empty, date-value, date-clear,
 * field-where, where-placeholder, where-value, budgets (hidden),
 * budget-<role>, budget-<role>-min / -max (+ -placeholder / -value),
 * field-brief, brief-placeholder, brief-value, brief-hint (hidden),
 * brief-count (hidden), post-button, helper-needs-all, helper-needs-brief,
 * helper-ready, posted-stamp.
 */

export type JobPostFormState = 'empty' | 'roles' | 'budgets' | 'brief' | 'posted';

export const JOB_FORM_STATES: readonly JobPostFormState[] = ['empty', 'roles', 'budgets', 'brief', 'posted'];

/**
 * Where the form rests in each state, as a scroll fraction: 0 is the top,
 * 1 the bottom. The ends are exact at any width; the middle two put the typed
 * title and role chips, then the budgets, in view on a phone 340–400 px wide.
 */
export const JOB_FORM_SCROLL: Record<JobPostFormState, number> = {
  empty: 0,
  roles: 0.14,
  budgets: 0.86,
  brief: 1,
  posted: 1,
};

/** "SDE Editor Video" → "sde-editor-video", for part names. */
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const show = (on: boolean): CSSProperties => ({ opacity: on ? 1 : 0 });

/** The roles Mika picks, in the order she picks them (the order the budget rows follow). */
const PICKED: readonly string[] = FILLED.budgets.map((b) => b.role);

const MUTED = 'text-[#A08E84]';
const STACK = 'col-start-1 row-start-1';

/** A Field's label: 11 px bold, uppercase, 2 px tracking, muted. */
function Label({ children, inset = false }: { children: ReactNode; inset?: boolean }) {
  return (
    <p className={`text-[11px] font-bold uppercase leading-[14px] tracking-[2px] ${MUTED} ${inset ? 'ml-1' : ''}`}>{children}</p>
  );
}

function Hint({ children, part, hidden }: { children: ReactNode; part?: string; hidden?: boolean }) {
  return (
    <p data-part={part} hidden={hidden} className={`text-[11px] leading-4 ${MUTED}`}>
      {children}
    </p>
  );
}

/**
 * A one-line TextInput: card fill, 12 px radius, 14 px text. The placeholder
 * and the value share one cell and never wrap, as a single-line input clips.
 */
function TextBox({
  part,
  placeholder,
  value,
  filled,
  numeric = false,
  className = '',
  children,
}: {
  part: string;
  placeholder: string;
  value: string;
  filled: boolean;
  numeric?: boolean;
  className?: string;
  /** An icon before the text, as LocationField draws one. */
  children?: ReactNode;
}) {
  return (
    <div
      data-part={part}
      className={`flex min-w-0 items-center gap-2 rounded-[12px] bg-[#1E1B18] px-3.5 py-3 text-sm leading-5 ${className}`}
    >
      {children}
      <div className={`grid min-w-0 flex-1 overflow-hidden whitespace-nowrap ${numeric ? 'tabular-nums' : ''}`}>
        <span data-part={`${part.replace(/^field-/, '')}-placeholder`} className={`${STACK} text-[#9ca3af]`} style={show(!filled)}>
          {placeholder}
        </span>
        <span data-part={`${part.replace(/^field-/, '')}-value`} className={`${STACK} text-[#F2EDE8]`} style={show(filled)}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function JobPostForm({
  state = 'posted',
  scroll,
  className = '',
}: {
  state?: JobPostFormState;
  /** Override the rest scroll fraction (0 top … 1 bottom). */
  scroll?: number;
  className?: string;
}) {
  const step = JOB_FORM_STATES.indexOf(state);
  const reached = (s: JobPostFormState) => step >= JOB_FORM_STATES.indexOf(s);
  // The top of the form is filled with the roles; then the budgets, then the brief.
  const top = reached('roles');
  const budgets = reached('budgets');
  const brief = reached('brief');
  const ready = brief;
  const posted = state === 'posted';
  const t = Math.max(0, Math.min(1, scroll ?? JOB_FORM_SCROLL[state]));
  const pct = Math.round(t * 1000) / 10;

  return (
    <div
      aria-hidden
      data-part="job-form"
      data-state={state}
      className={`absolute inset-0 flex flex-col bg-[#161311] text-[#F2EDE8] ${className}`}
    >
      {/* Fixed above the scroll, as the screen's header is. */}
      <div data-part="job-header" className="flex shrink-0 items-center gap-3 px-5 py-3">
        <ArrowLeft aria-hidden size={20} className="shrink-0" />
        <p className="text-[18px] font-bold leading-7">{FORM.title}</p>
      </div>

      <div data-part="job-viewport" className="relative min-h-0 flex-1 overflow-hidden">
        <div data-part="job-scroll" className="absolute inset-0" style={{ transform: `translateY(${pct}%)` }}>
          <div
            data-part="job-column"
            className="flex flex-col gap-[18px] px-5 pb-[60px] pt-5"
            style={{ transform: `translateY(-${pct}%)` }}
          >
            <p className={`-mb-2 text-[12px] leading-5 ${MUTED}`}>{FORM.intro}</p>

            <div className="flex flex-col gap-2">
              <Label>{FORM.titleLabel}</Label>
              <TextBox part="field-title" placeholder={FORM.titlePlaceholder} value={FILLED.title} filled={top} />
              <Hint>{FORM.titleHint}</Hint>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{FORM.rolesLabel}</Label>
              <div data-part="roles" className="flex flex-wrap gap-2">
                {FORM_ROLES.map((role) => {
                  const on = top && PICKED.includes(role);
                  return (
                    <span
                      key={role}
                      data-part={`role-${slug(role)}`}
                      data-on={on ? '' : undefined}
                      className="rounded-full border border-[#B66A4055] px-3.5 py-2 text-[12px] font-semibold leading-4 text-[#D18A5A] data-[on]:border-[#A85D35] data-[on]:bg-[#A85D35] data-[on]:text-white"
                    >
                      {role}
                    </span>
                  );
                })}
              </div>
              <Hint>{FORM.rolesHint}</Hint>
            </div>

            {/* DateTimeField: its label is inset 4 px, its box is a 16 px card. */}
            <div className="flex flex-col gap-2">
              <Label inset>{FORM.dateLabel}</Label>
              <div data-part="field-date" className="flex items-center gap-2 rounded-[16px] bg-[#1E1B18] px-4 py-3.5 text-sm leading-5">
                <CalendarDays aria-hidden size={15} className={`shrink-0 ${MUTED}`} />
                <div className="grid min-w-0 flex-1 whitespace-nowrap">
                  <span data-part="date-empty" className={`${STACK} ${MUTED}`} style={show(!top)}>
                    {FORM.dateEmpty}
                  </span>
                  <span data-part="date-value" className={STACK} style={show(top)}>
                    {FILLED.date}
                  </span>
                </div>
                <X data-part="date-clear" aria-hidden size={15} className={`shrink-0 ${MUTED}`} style={show(top)} />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{FORM.whereLabel}</Label>
              {/* LocationField: a pin, then the box (px-3.5 on the row, py-3 on the input: the same 44 px). */}
              <TextBox part="field-where" placeholder={FORM.wherePlaceholder} value={FILLED.where} filled={top}>
                <MapPin aria-hidden size={14} className={`shrink-0 ${MUTED}`} />
              </TextBox>
            </div>

            {/* Only once a role is picked: the section grows with the post. */}
            <div data-part="budgets" hidden={!top} className="flex flex-col gap-2">
              <p className={`text-[12px] font-semibold leading-4 ${MUTED}`}>{FORM.budgetsLabel}</p>
              {FILLED.budgets.map((b) => {
                const part = `budget-${slug(b.role)}`;
                return (
                  <div key={b.role} data-part={part} className="flex flex-col gap-1.5">
                    <p className="text-[13px] font-medium leading-[18px]">{b.role}</p>
                    <div className="flex gap-3">
                      <TextBox part={`${part}-min`} placeholder={FORM.budgetFrom} value={b.min} filled={budgets} numeric className="flex-1" />
                      <TextBox part={`${part}-max`} placeholder={FORM.budgetTo} value={b.max} filled={budgets} numeric className="flex-1" />
                    </div>
                  </div>
                );
              })}
              <p className="text-[11px] leading-[14px] text-[#9ca3af]">{FORM.budgetHint}</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{FORM.briefLabel}</Label>
              <div data-part="field-brief" className="min-h-[150px] rounded-[12px] bg-[#1E1B18] px-3.5 py-3 text-sm leading-5">
                <div className="grid">
                  <span data-part="brief-placeholder" className={`${STACK} text-[#9ca3af]`} style={show(!brief)}>
                    {FORM.briefPlaceholder}
                  </span>
                  <span data-part="brief-value" className={STACK} style={show(brief)}>
                    {FILLED.brief}
                  </span>
                </div>
              </div>
              <Hint part="brief-hint" hidden={brief}>
                {FORM.briefHint}
              </Hint>
              <p data-part="brief-count" hidden={!brief} className={`text-[11px] leading-4 tabular-nums ${MUTED}`}>
                {FILLED.briefCount}
              </p>
            </div>

            <div className="relative">
              <div
                data-part="post-button"
                className="flex items-center justify-center gap-2 rounded-[16px] bg-[#A85D35] py-4"
                style={{ opacity: ready ? 1 : 0.4 }}
              >
                <Send aria-hidden size={16} className="text-white" />
                <span className="text-[15px] font-bold leading-[18px] text-white">{FORM.submit}</span>
              </div>
              {/* The page's stamp, rotated on its wrapper so the part's own transform stays free. */}
              <span className="pointer-events-none absolute -top-[22px] right-1 z-10 rotate-[-6deg]">
                <span
                  data-part="posted-stamp"
                  className="figure inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] border-[1.5px] border-[#D18A5A] bg-[#161311] px-2.5 py-[5px] text-[11px] font-semibold uppercase leading-none tracking-[0.14em] text-[#D18A5A] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.85)]"
                  style={show(posted)}
                >
                  <Check aria-hidden size={12} strokeWidth={2.75} />
                  {POSTED_STAMP}
                </span>
              </span>
            </div>

            <div className={`grid text-center text-[11px] leading-[14px] ${MUTED}`}>
              <p data-part="helper-needs-all" className={STACK} style={show(!top)}>
                {STILL_NEEDS.empty}
              </p>
              <p data-part="helper-needs-brief" className={STACK} style={show(top && !ready)}>
                {STILL_NEEDS.brief}
              </p>
              <p data-part="helper-ready" className={STACK} style={show(ready)}>
                {FORM.ready}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
