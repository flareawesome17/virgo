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
  payMethods: MoneyPayMethod[];
}

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

const STYLE = `
  :root { color-scheme:light dark; --paper:${P.light.paper}; --ink:${P.light.ink}; --muted:${P.light.muted}; --line:${P.light.line}; --accent:${P.light.accent}; --card:#FFFFFF; --warn:#9A3B1E; }
  @media (prefers-color-scheme:dark) { :root { --paper:${P.dark.paper}; --ink:${P.dark.ink}; --muted:${P.dark.muted}; --line:${P.dark.line}; --accent:${P.dark.accent}; --card:#201B18; --warn:#F0A07C; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:560px; margin:0 auto; padding:32px 18px 48px; }
  .from { color:var(--muted); font-size:13px; font-weight:600; letter-spacing:.02em; }
  h1 { margin:6px 0 2px; font-size:26px; line-height:1.2; letter-spacing:-.02em; }
  .sub { color:var(--muted); margin:0; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:18px; margin-top:18px; }
  .figures { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
  .figure span { display:block; color:var(--muted); font-size:12px; font-weight:600; }
  .figure strong { display:block; font-size:18px; font-variant-numeric:tabular-nums; overflow-wrap:anywhere; }
  .balance strong { color:var(--accent); }
  .next { margin:14px 0 0; padding-top:12px; border-top:1px solid var(--line); font-weight:600; }
  .next.overdue { color:var(--warn); }
  .done { margin:0; font-weight:700; color:var(--accent); }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.12em; color:var(--muted); margin:28px 4px 8px; }
  table { width:100%; border-collapse:collapse; }
  td { padding:10px 4px; border-bottom:1px solid var(--line); vertical-align:top; }
  tr:last-child td { border-bottom:0; }
  td.amt { text-align:right; font-weight:700; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .note { display:block; color:var(--muted); font-size:12px; }
  .overdue-tag { color:var(--warn); font-weight:600; }
  .method { display:flex; gap:16px; align-items:flex-start; }
  .method + .method { margin-top:16px; padding-top:16px; border-top:1px solid var(--line); }
  .method h3 { margin:0; font-size:16px; }
  .method p { margin:2px 0 0; }
  .number { font-size:17px; font-weight:700; letter-spacing:.02em; user-select:all; font-variant-numeric:tabular-nums; }
  .qr { width:148px; height:148px; flex:none; border-radius:12px; background:#FFF; object-fit:contain; border:1px solid var(--line); }
  .ask { color:var(--muted); }
  footer { margin-top:28px; color:var(--muted); font-size:12px; line-height:1.6; }
  @media (max-width:420px) { .figures { grid-template-columns:1fr; } .figure { display:flex; justify-content:space-between; align-items:baseline; } .method { flex-direction:column-reverse; } .qr { width:200px; height:200px; } }
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

/**
 * A client's statement: what they agreed to, what they have paid, what is
 * due, and how to pay the creative directly.
 *
 * Plain HTML, no script — the route's policy allows none. Every value from the
 * database is escaped on the way in.
 */
export function renderStatement(v: StatementView): string {
  const nextDue = v.due[0];
  const paidInFull = v.balanceMinor <= 0;

  const summary = `<section class="card" aria-label="Summary">
    <div class="figures">
      <div class="figure"><span>Total</span><strong>${pesoText(v.totalMinor)}</strong></div>
      <div class="figure"><span>Paid</span><strong>${pesoText(v.receivedMinor)}</strong></div>
      <div class="figure balance"><span>Balance</span><strong>${pesoText(v.balanceMinor)}</strong></div>
    </div>
    ${
      paidInFull
        ? `<p class="next done">Paid in full. Thank you!</p>`
        : nextDue
          ? `<p class="next${nextDue.overdue ? ' overdue' : ''}">${
              nextDue.overdue ? 'Overdue: ' : 'Next payment: '
            }${pesoText(nextDue.amountMinor)} ${nextDue.overdue ? 'was due' : 'due'} ${esc(statementDay(nextDue.date))}</p>`
          : ''
    }
  </section>`;

  const payments = v.payments.length
    ? `<h2>Payments received</h2><section class="card" style="padding:6px 14px"><table>${v.payments
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
      ? `<h2>Still to pay</h2><section class="card" style="padding:6px 14px"><table>${dueRows.join('')}</table></section>`
      : '';

  const methods = !paidInFull
    ? v.payMethods.length
      ? `<h2>How to pay</h2><section class="card">${v.payMethods
          .map(
            (m) => `<div class="method"><div style="flex:1;min-width:0">
              <h3>${esc(m.kind === 'bank' && m.label ? m.label : m.kind === 'other' && m.label ? m.label : KIND_LABELS[m.kind])}</h3>
              ${m.accountName ? `<p>${esc(m.accountName)}</p>` : ''}
              ${m.accountNumber ? `<p class="number">${esc(m.accountNumber)}</p>` : ''}
            </div>${
              m.qr?.url
                ? `<img class="qr" src="${esc(m.qr.url)}" alt="${esc(KIND_LABELS[m.kind])} QR code for ${esc(v.creativeName)}">`
                : ''
            }</div>`,
          )
          .join('')}<p class="ask" style="margin:16px 0 0">Send ${esc(v.creativeName)} a screenshot of your payment so they can mark it received.</p></section>`
      : `<h2>How to pay</h2><section class="card"><p class="ask" style="margin:0">Ask ${esc(v.creativeName)} how they'd like to be paid.</p></section>`
    : '';

  const subtitle = [v.clientName, v.eventDate ? statementDay(v.eventDate) : null]
    .filter((x): x is string => !!x)
    .map(esc)
    .join(' · ');

  return page(
    `${v.title} — statement`,
    `<p class="from">Statement from ${esc(v.creativeName)}</p>
     <h1>${esc(v.title)}</h1>
     ${subtitle ? `<p class="sub">${subtitle}</p>` : ''}
     ${summary}${due}${methods}${payments}
     <footer>This is a billing statement from ${esc(v.creativeName)}, not an official receipt or a BIR invoice. Pay ${esc(v.creativeName)} directly — Virgo shows this page for them and never handles payments.<br>Shared with Virgo</footer>`,
  );
}
