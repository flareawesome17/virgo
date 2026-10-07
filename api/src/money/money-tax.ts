/**
 * Philippine income tax arithmetic for a self-employed, non-VAT individual —
 * the three ways Money estimates, and the filing calendar.
 *
 * Estimates for planning, never advice: a CPA reviews these figures before
 * they reach anyone, and the screens say so. Kept apart from the service so
 * the rules can be read, tested and corrected on their own.
 *
 * All amounts are centavos.
 */

/** Above this a creative must register for VAT and can't choose 8%. */
export const VAT_THRESHOLD_MINOR = 300_000_000;
/** Where the meter starts warning that the line is near. */
export const VAT_WARNING_MINOR = 250_000_000;
/** The 8% option's yearly exemption, for the purely self-employed. */
export const EIGHT_PERCENT_EXEMPT_MINOR = 25_000_000;
/** Optional standard deduction for individuals: 40% of gross. */
export const OSD_RATE = 0.4;
/** Percentage tax on gross receipts for non-VAT persons (1% ended 30 Jun 2023). */
export const PERCENTAGE_TAX_RATE = 0.03;

/**
 * TRAIN graduated rates for 2023 onward: over, base tax, rate on the excess.
 * In pesos, as the law states them.
 */
const BRACKETS: readonly { over: number; base: number; rate: number }[] = [
  { over: 8_000_000, base: 2_202_500, rate: 0.35 },
  { over: 2_000_000, base: 402_500, rate: 0.3 },
  { over: 800_000, base: 102_500, rate: 0.25 },
  { over: 400_000, base: 22_500, rate: 0.2 },
  { over: 250_000, base: 0, rate: 0.15 },
];

/** Income tax on a year's taxable income under the graduated rates. */
export function graduatedTaxMinor(taxableMinor: number): number {
  const pesos = Math.max(0, taxableMinor) / 100;
  for (const b of BRACKETS) {
    if (pesos > b.over) return Math.round((b.base + (pesos - b.over) * b.rate) * 100);
  }
  return 0;
}

export interface TaxOption {
  /** What the income tax is worked out on. */
  taxableMinor: number;
  incomeTaxMinor: number;
  /** 3% of gross on the graduated options; none under 8%, which replaces it. */
  percentageTaxMinor: number;
  totalMinor: number;
  /**
   * Income tax less what clients already withheld (their 2307s), plus the
   * percentage tax, which withholding doesn't cover. Never below zero; more
   * withheld than owed shows as `excessCreditMinor` instead.
   */
  stillToPayMinor: number;
  excessCreditMinor: number;
}

export interface TaxEstimates {
  /** 8% of gross over ₱250,000. Only while gross is ₱3M or under. */
  eightPercent: TaxOption;
  /** Graduated rates on 60% of gross (OSD), plus 3% percentage tax. */
  osd: TaxOption;
  /** Graduated rates on gross less recorded expenses, plus 3% percentage tax. */
  itemized: TaxOption;
  /** The smallest total on these numbers. */
  lowest: 'eightPercent' | 'osd' | 'itemized';
}

function option(taxableMinor: number, incomeTaxMinor: number, percentageTaxMinor: number, withheldMinor: number): TaxOption {
  const afterCredit = incomeTaxMinor - withheldMinor;
  return {
    taxableMinor,
    incomeTaxMinor,
    percentageTaxMinor,
    totalMinor: incomeTaxMinor + percentageTaxMinor,
    stillToPayMinor: Math.max(0, afterCredit) + percentageTaxMinor,
    excessCreditMinor: Math.max(0, -afterCredit),
  };
}

/**
 * The three ways side by side, on one set of numbers. Null above the VAT
 * line: none of them applies there, and the honest answer is "see your
 * accountant".
 */
export function estimateTax(input: {
  grossMinor: number;
  expenseMinor: number;
  withheldMinor: number;
}): TaxEstimates | null {
  const { grossMinor, expenseMinor, withheldMinor } = input;
  if (grossMinor > VAT_THRESHOLD_MINOR) return null;
  const percentage = Math.round(grossMinor * PERCENTAGE_TAX_RATE);

  const eightTaxable = Math.max(0, grossMinor - EIGHT_PERCENT_EXEMPT_MINOR);
  const eightPercent = option(eightTaxable, Math.round(eightTaxable * 0.08), 0, withheldMinor);

  const osdTaxable = Math.round(grossMinor * (1 - OSD_RATE));
  const osd = option(osdTaxable, graduatedTaxMinor(osdTaxable), percentage, withheldMinor);

  const itemizedTaxable = Math.max(0, grossMinor - expenseMinor);
  const itemized = option(itemizedTaxable, graduatedTaxMinor(itemizedTaxable), percentage, withheldMinor);

  const all = { eightPercent, osd, itemized };
  // Ties go to the simplest to keep: 8%, then OSD (no receipts), then itemized.
  const lowest = (['eightPercent', 'osd', 'itemized'] as const).reduce((best, key) =>
    all[key].totalMinor < all[best].totalMinor ? key : best,
  );
  return { ...all, lowest };
}

export type TaxForm = '1701Q' | '1701A' | '2551Q';

export interface TaxDeadline {
  form: TaxForm;
  /** "Q1 2026", or "2026" for the annual return. */
  period: string;
  /** The day it is due: moved to the Monday when it falls on a weekend. */
  dueOn: string;
  /** Who files it: everyone, or only those on the graduated rates. */
  who: 'everyone' | 'graduated';
}

/** A Saturday or Sunday deadline moves to the Monday after. Holidays aren't known here. */
function nextWorkingDay(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay();
  if (day === 6) date.setUTCDate(date.getUTCDate() + 2);
  if (day === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Every return for one tax year, in the order they fall: the quarterly
 * income tax returns (cumulative), the percentage tax returns (only on the
 * graduated rates — 8% replaces that tax), and the annual return the April
 * after.
 */
export function taxDeadlines(year: number): TaxDeadline[] {
  const list: TaxDeadline[] = [
    { form: '2551Q', period: `Q1 ${year}`, dueOn: nextWorkingDay(year, 4, 25), who: 'graduated' },
    { form: '1701Q', period: `Q1 ${year}`, dueOn: nextWorkingDay(year, 5, 15), who: 'everyone' },
    { form: '2551Q', period: `Q2 ${year}`, dueOn: nextWorkingDay(year, 7, 25), who: 'graduated' },
    { form: '1701Q', period: `Q2 ${year}`, dueOn: nextWorkingDay(year, 8, 15), who: 'everyone' },
    { form: '2551Q', period: `Q3 ${year}`, dueOn: nextWorkingDay(year, 10, 25), who: 'graduated' },
    { form: '1701Q', period: `Q3 ${year}`, dueOn: nextWorkingDay(year, 11, 15), who: 'everyone' },
    { form: '2551Q', period: `Q4 ${year}`, dueOn: nextWorkingDay(year + 1, 1, 25), who: 'graduated' },
    { form: '1701A', period: String(year), dueOn: nextWorkingDay(year + 1, 4, 15), who: 'everyone' },
  ];
  return list.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}
