import { DELIVERY_PALETTE as P } from '../albums/share/client-palette';
import { pesoText } from './money-nudges.service';
import type { MoneyPayMethod } from './money-pay-methods.service';

/** Everything a statement page shows, worked out by MoneyPackagesService.statement. */
export interface StatementView {
  creativeName: string;
  title: string;
  clientName: string | null;
  eventDate: string | null;
  totalMinor: number;
  receivedMinor: number;
  balanceMinor: number;
  /** What no payment is due for yet. */
  unscheduledMinor: number;
  payments: { date: string; amountMinor: number; withheldMinor: number; method: string | null }[];
  due: { date: string; amountMinor: number; overdue: boolean }[];
  /** The main way to pay first. */
  payMethods: MoneyPayMethod[];
}

/** How long after a change the page warns that the pay details are new. */
const NEW_FOR_MS = 24 * 60 * 60 * 1000;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "Sat, Nov 14, 2026" for a YYYY-MM-DD day, without passing through a time zone. */
export function statementDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The same, for a moment: the day it was in Manila. */
function manilaDay(at: string | Date): string {
  return new Date(at).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Manila',
  });
}

const KIND_LABELS: Record<MoneyPayMethod['kind'], string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank transfer',
  other: 'Other',
};

const METHOD_LABELS: Record<string, string> = {
  gcash: 'GCash',
  maya: 'Maya',
  bank: 'Bank transfer',
  cash: 'Cash',
  card: 'Card',
  other: 'Other',
};

function methodName(m: MoneyPayMethod): string {
  return (m.kind === 'bank' || m.kind === 'other') && m.label ? m.label : KIND_LABELS[m.kind];
}

const LOCK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SHIELD = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>`;
const WARN = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/></svg>`;
const SAVE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>`;

const STYLE = `
  :root { color-scheme:light dark; --paper:${P.light.paper}; --ink:${P.light.ink}; --muted:${P.light.muted}; --line:${P.light.line}; --accent:${P.light.accent}; --card:#FFFFFF; --soft:#F1E8E0; --warn:#9A3B1E; --warn-bg:#FBEDE6; --warn-line:#EBC3AE; }
  @media (prefers-color-scheme:dark) { :root { --paper:${P.dark.paper}; --ink:${P.dark.ink}; --muted:${P.dark.muted}; --line:${P.dark.line}; --accent:${P.dark.accent}; --card:#201B18; --soft:#2B2420; --warn:#F0A07C; --warn-bg:#2E1E17; --warn-line:#5A3424; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:560px; margin:0 auto; padding:20px 18px 48px; }
  .private { display:flex; align-items:center; gap:8px; margin:0 0 18px; color:var(--muted); font-size:12px; line-height:16px; }
  .private svg { flex:none; }
  .from { margin:0; color:var(--muted); font-size:13px; font-weight:600; letter-spacing:.02em; }
  h1 { margin:6px 0 2px; font-size:26px; line-height:1.2; letter-spacing:-.02em; }
  .sub { color:var(--muted); margin:0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:18px; margin-top:18px; }
  .label { display:block; color:var(--muted); font-size:13px; font-weight:600; }
  .balance { display:block; font-size:32px; line-height:38px; letter-spacing:-.02em; color:var(--accent); font-variant-numeric:tabular-nums; }
  .bar { height:6px; border-radius:999px; background:var(--soft); overflow:hidden; margin:10px 0 8px; }
  .bar span { display:block; height:100%; border-radius:999px; background:var(--muted); }
  .line { margin:0; color:var(--muted); font-size:13px; }
  .line.overdue { color:var(--warn); font-weight:600; }
  .figures { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .figure span { display:block; color:var(--muted); font-size:12px; font-weight:600; }
  .figure strong { display:block; font-size:18px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .done { margin:14px 0 0; padding-top:12px; border-top:1px solid var(--line); font-weight:700; color:var(--accent); }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:28px 4px 8px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:10px 4px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  td.amt { text-align:right; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .note { display:block; color:var(--muted); font-size:12px; }
  .overdue-tag { color:var(--warn); font-weight:600; }
  .new { display:flex; gap:12px; background:var(--warn-bg); border:1px solid var(--warn-line); border-radius:18px; padding:14px 16px; margin-bottom:12px; font-size:14px; line-height:20px; }
  .new svg { flex:none; margin-top:2px; color:var(--warn); }
  .new strong { display:block; font-size:15px; color:var(--warn); }
  .pay { margin-top:0; text-align:center; }
  .send { margin:0; font-size:17px; line-height:24px; font-weight:700; }
  .chip { display:inline-block; margin-top:12px; padding:4px 12px; border-radius:999px; background:var(--soft); font-size:13px; font-weight:700; }
  .qr { display:block; margin:12px auto 0; width:248px; height:248px; max-width:100%; border-radius:14px; background:#FFF; object-fit:contain; border:1px solid var(--line); }
  .open { display:inline-flex; align-items:center; gap:8px; margin-top:12px; min-height:44px; padding:0 18px; border-radius:12px; border:1.5px solid var(--accent); color:var(--accent); font-weight:600; text-decoration:none; }
  .who { display:block; margin-top:14px; font-size:16px; font-weight:600; }
  .number { display:block; font-size:20px; line-height:28px; font-weight:700; letter-spacing:.04em; user-select:all; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .steps { margin:16px 0 0; text-align:left; background:var(--paper); border-radius:14px; padding:12px 14px; font-size:14px; line-height:20px; }
  .steps strong { display:block; margin-bottom:4px; }
  .steps ol { margin:0; padding-left:20px; }
  .steps li + li { margin-top:4px; }
  .check { display:flex; gap:10px; margin:10px 0 0; text-align:left; font-size:14px; line-height:20px; color:var(--muted); }
  .check svg { flex:none; margin-top:1px; }
  details { margin-top:16px; border-top:1px solid var(--line); text-align:left; }
  summary { min-height:48px; display:flex; align-items:center; justify-content:space-between; font-weight:600; cursor:pointer; list-style:none; }
  summary::-webkit-details-marker { display:none; }
  summary::after { content:"+"; font-size:20px; color:var(--muted); }
  details[open] summary::after { content:"\\2212"; }
  .method { display:flex; gap:16px; align-items:flex-start; padding:14px 0; border-top:1px solid var(--line); }
  .method h3 { margin:0; font-size:16px; }
  .method p { margin:2px 0 0; }
  .method .number { font-size:17px; line-height:24px; }
  .method .qr { width:132px; height:132px; margin:0; flex:none; }
  .ask { margin:16px 0 0; color:var(--muted); font-size:14px; line-height:20px; text-align:left; }
  .changed { margin:8px 4px 0; color:var(--muted); font-size:12px; line-height:16px; }
  footer { margin-top:28px; color:var(--muted); font-size:12px; line-height:1.6; }
  @media (max-width:420px) { .figures { grid-template-columns:1fr; } .figure { display:flex; justify-content:space-between; align-items:baseline; } .method { flex-direction:column-reverse; } .method .qr { width:200px; height:200px; } }
`;

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${STYLE}</style></head><body><main>${body}</main></body></html>`;
}

export function renderStatementUnavailable(): string {
  return page(
    'Statement unavailable',
    `<h1>This statement isn't shared any more</h1><p class="sub">Ask whoever sent it for an up-to-date link.</p><footer>Shared with Virgo</footer>`,
  );
}

/** One of the other ways to pay: smaller, inside the fold. */
function otherMethod(m: MoneyPayMethod, creativeName: string): string {
  return `<div class="method"><div style="flex:1;min-width:0">
      <h3>${esc(methodName(m))}</h3>
      ${m.accountName ? `<p>${esc(m.accountName)}</p>` : ''}
      ${m.accountNumber ? `<p class="number">${esc(m.accountNumber)}</p>` : ''}
      ${m.qr?.url ? `<p><a href="${esc(m.qr.url)}" target="_blank" rel="noopener">Open the QR to save it</a></p>` : ''}
    </div>${
      m.qr?.url
        ? `<img class="qr" src="${esc(m.qr.url)}" alt="${esc(methodName(m))} QR code for ${esc(creativeName)}">`
        : ''
    }</div>`;
}

/**
 * A client's statement: what they agreed to, what is left, how to pay the
 * creative directly, and what they have paid.
 *
 * How to pay comes first after the balance, led by the amount to send and the
 * main way to pay, large. On a phone a client cannot scan a QR on their own
 * screen, so the page says how to save it and upload it instead. It names
 * when the details last changed, and for a day after a change says so above
 * the QR: someone in the account swapping in their own code is the harm here.
 *
 * Plain HTML, no script — the route's policy allows none; the fold is a
 * <details>. Every value from the database is escaped on the way in.
 */
export function renderStatement(v: StatementView, now: Date = new Date()): string {
  const nextDue = v.due[0];
  const paidInFull = v.balanceMinor <= 0;
  const firstName = v.creativeName.trim().split(/\s+/)[0] || v.creativeName;

  const summary = paidInFull
    ? `<section class="card" aria-label="Summary">
    <div class="figures">
      <div class="figure"><span>Total</span><strong>${pesoText(v.totalMinor)}</strong></div>
      <div class="figure"><span>Paid</span><strong>${pesoText(v.receivedMinor)}</strong></div>
      <div class="figure"><span>Balance</span><strong>${pesoText(Math.max(v.balanceMinor, 0))}</strong></div>
    </div>
    <p class="done">Paid in full. Thank you!</p>
  </section>`
    : `<section class="card" aria-label="Summary">
    <span class="label">Balance</span>
    <strong class="balance">${pesoText(v.balanceMinor)}</strong>
    <div class="bar"><span style="width:${Math.min(100, Math.max(0, Math.round((v.receivedMinor / Math.max(v.totalMinor, 1)) * 100)))}%"></span></div>
    <p class="line">${pesoText(v.receivedMinor)} paid of ${pesoText(v.totalMinor)}</p>
    ${
      nextDue
        ? `<p class="line${nextDue.overdue ? ' overdue' : ''}">${
            nextDue.overdue
              ? `Overdue: ${pesoText(nextDue.amountMinor)} was due ${esc(statementDay(nextDue.date))}`
              : `Next payment: ${pesoText(nextDue.amountMinor)} due ${esc(statementDay(nextDue.date))}`
          }</p>`
        : ''
    }
  </section>`;

  let howToPay = '';
  if (!paidInFull) {
    const [main, ...others] = v.payMethods;
    if (!main) {
      howToPay = `<h2>How to pay</h2><section class="card" style="margin-top:0"><p class="ask" style="margin:0">Ask ${esc(v.creativeName)} how they'd like to be paid.</p></section>`;
    } else {
      const sendMinor = nextDue ? nextDue.amountMinor : v.balanceMinor;
      const lastChanged = v.payMethods.reduce(
        (latest, m) => (m.detailsChangedAt > latest ? m.detailsChangedAt : latest),
        v.payMethods[0].detailsChangedAt,
      );
      const isNew = now.getTime() - new Date(lastChanged).getTime() < NEW_FOR_MS;

      const warning = isNew
        ? `<section class="new" role="note">${WARN}<span><strong>These pay details are new</strong>${esc(firstName)} changed how to pay on ${esc(manilaDay(lastChanged))}. If you've paid ${esc(firstName)} before to a different number, check with them on a number or chat you already know before you send.</span></section>`
        : '';

      const qrBlock = main.qr?.url
        ? `<img class="qr" src="${esc(main.qr.url)}" alt="${esc(methodName(main))} QR code for ${esc(v.creativeName)}">
          <a class="open" href="${esc(main.qr.url)}" target="_blank" rel="noopener">${SAVE}Open the QR to save it</a>`
        : '';

      const steps = main.qr?.url
        ? `<div class="steps"><strong>Paying from this phone?</strong><ol>
            <li>Open the QR, then press and hold it to save it to your photos.</li>
            <li>In GCash, Maya or your bank app, tap Scan and choose the saved QR.</li>
          </ol></div>`
        : '';

      const nameCheck = main.accountName
        ? `<p class="check">${SHIELD}<span>Before you send, check that your app shows the name <strong>${esc(main.accountName)}</strong>.</span></p>`
        : '';

      const fold = others.length
        ? `<details><summary>Other ways to pay: ${others.map((m) => esc(methodName(m))).join(', ')}</summary>${others
            .map((m) => otherMethod(m, v.creativeName))
            .join('')}</details>`
        : '';

      howToPay = `<h2>How to pay</h2>${warning}<section class="card pay">
        <p class="send">Send ${pesoText(sendMinor)} to ${esc(main.accountName ?? v.creativeName)}</p>
        <span class="chip">${esc(methodName(main))}</span>
        ${qrBlock}
        ${main.accountName ? `<span class="who">${esc(main.accountName)}</span>` : ''}
        ${main.accountNumber ? `<span class="number">${esc(main.accountNumber)}</span>` : ''}
        ${steps}${nameCheck}${fold}
        <p class="ask">Paid? Send ${esc(firstName)} a screenshot of your payment so they can mark it received.</p>
      </section>
      <p class="changed">These pay details last changed ${esc(manilaDay(lastChanged))}.</p>`;
    }
  }

  const dueRows = [
    ...v.due.map(
      (d) =>
        `<tr><td>${esc(statementDay(d.date))}${
          d.overdue ? ' <span class="overdue-tag">· overdue</span>' : ''
        }</td><td class="amt">${pesoText(d.amountMinor)}</td></tr>`,
    ),
    ...(v.unscheduledMinor > 0
      ? [`<tr><td>Date to be agreed</td><td class="amt">${pesoText(v.unscheduledMinor)}</td></tr>`]
      : []),
  ];
  const due =
    !paidInFull && dueRows.length
      ? `<h2>Still to pay</h2><section class="card" style="padding:6px 14px;margin-top:0"><table>${dueRows.join('')}</table></section>`
      : '';

  const payments = v.payments.length
    ? `<h2>Payments received</h2><section class="card" style="padding:6px 14px;margin-top:0"><table>${v.payments
        .map(
          (p) => `<tr><td>${esc(statementDay(p.date))}${
            p.method ? `<span class="note">${esc(METHOD_LABELS[p.method] ?? p.method)}</span>` : ''
          }${
            p.withheldMinor > 0
              ? `<span class="note">incl. ${pesoText(p.withheldMinor)} tax withheld (BIR 2307)</span>`
              : ''
          }</td><td class="amt">${pesoText(p.amountMinor)}</td></tr>`,
        )
        .join('')}</table></section>`
    : '';

  const subtitle = [v.clientName, v.eventDate ? statementDay(v.eventDate) : null]
    .filter((x): x is string => !!x)
    .map(esc)
    .join(' · ');

  return page(
    `${v.title} — statement`,
    `<p class="private">${LOCK}A private link from ${esc(v.creativeName)}. Only people with this link can open it.</p>
     <p class="from">Statement from ${esc(v.creativeName)}</p>
     <h1>${esc(v.title)}</h1>
     ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
     ${summary}${howToPay}${due}${payments}
     <footer>This is a billing statement from ${esc(v.creativeName)}, not an official receipt or a BIR invoice. Pay ${esc(v.creativeName)} directly — Virgo shows this page for them and never handles payments.<br>Shared with Virgo</footer>`,
  );
}
