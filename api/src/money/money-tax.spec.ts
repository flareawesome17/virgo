import type { DatabaseService } from '../database/database.service';
import { estimateTax, graduatedTaxMinor, taxDeadlines, VAT_THRESHOLD_MINOR } from './money-tax';
import { MoneyTaxService } from './money-tax.service';

/**
 * Tax help. The arithmetic is pinned with worked examples a CPA can check by
 * hand; the SQL is run against real Postgres where it is checked.
 */

const ME = '11111111-1111-4111-8111-111111111111';
const pesos = (n: number) => Math.round(n * 100);

describe('graduatedTaxMinor (TRAIN, 2023 onward)', () => {
  it.each([
    [0, 0],
    [250_000, 0],
    [300_000, 7_500],
    [400_000, 22_500],
    [500_000, 42_500],
    [800_000, 102_500],
    [1_000_000, 152_500],
    [2_000_000, 402_500],
    [8_000_000, 2_202_500],
    [9_000_000, 2_552_500],
  ])('₱%d taxable is ₱%d', (taxable, tax) => {
    expect(graduatedTaxMinor(pesos(taxable))).toBe(pesos(tax));
  });
});

describe('estimateTax', () => {
  it('works out all three on ₱1M gross, ₱200k expenses, ₱50k withheld', () => {
    const e = estimateTax({ grossMinor: pesos(1_000_000), expenseMinor: pesos(200_000), withheldMinor: pesos(50_000) })!;
    // 8% of (1,000,000 − 250,000); no percentage tax.
    expect(e.eightPercent).toEqual({
      taxableMinor: pesos(750_000),
      incomeTaxMinor: pesos(60_000),
      percentageTaxMinor: 0,
      totalMinor: pesos(60_000),
      stillToPayMinor: pesos(10_000),
      excessCreditMinor: 0,
    });
    // Graduated on 60% of gross, plus 3% of gross.
    expect(e.osd).toMatchObject({
      taxableMinor: pesos(600_000),
      incomeTaxMinor: pesos(62_500),
      percentageTaxMinor: pesos(30_000),
      totalMinor: pesos(92_500),
      stillToPayMinor: pesos(42_500),
    });
    // Graduated on gross less expenses, plus 3% of gross.
    expect(e.itemized).toMatchObject({
      taxableMinor: pesos(800_000),
      incomeTaxMinor: pesos(102_500),
      totalMinor: pesos(132_500),
      stillToPayMinor: pesos(82_500),
    });
    expect(e.lowest).toBe('eightPercent');
  });

  it('never credits withholding against the percentage tax, and shows an excess as credit', () => {
    const e = estimateTax({ grossMinor: pesos(300_000), expenseMinor: 0, withheldMinor: pesos(30_000) })!;
    expect(e.eightPercent).toMatchObject({ totalMinor: pesos(4_000), stillToPayMinor: 0, excessCreditMinor: pesos(26_000) });
    // OSD: 180,000 taxable is under the first bracket; the 3% is still owed.
    expect(e.osd).toMatchObject({ incomeTaxMinor: 0, percentageTaxMinor: pesos(9_000), stillToPayMinor: pesos(9_000), excessCreditMinor: pesos(30_000) });
  });

  it('can find itemized lowest when expenses are most of the gross', () => {
    const e = estimateTax({ grossMinor: pesos(1_500_000), expenseMinor: pesos(1_200_000), withheldMinor: 0 })!;
    // Itemized: 300,000 taxable → 7,500 + 45,000 percentage = 52,500, under 8%'s 100,000.
    expect(e.itemized.totalMinor).toBe(pesos(52_500));
    expect(e.eightPercent.totalMinor).toBe(pesos(100_000));
    expect(e.lowest).toBe('itemized');
  });

  it('gives no estimate above the VAT line, where none of the three applies', () => {
    expect(estimateTax({ grossMinor: VAT_THRESHOLD_MINOR + 1, expenseMinor: 0, withheldMinor: 0 })).toBeNull();
    expect(estimateTax({ grossMinor: VAT_THRESHOLD_MINOR, expenseMinor: 0, withheldMinor: 0 })).not.toBeNull();
  });
});

describe('taxDeadlines', () => {
  it('lists the year in order, moving weekend days to the Monday', () => {
    expect(taxDeadlines(2026).map((d) => `${d.form} ${d.period} ${d.dueOn}`)).toEqual([
      '2551Q Q1 2026 2026-04-27', // Apr 25 is a Saturday
      '1701Q Q1 2026 2026-05-15',
      '2551Q Q2 2026 2026-07-27', // Jul 25 is a Saturday
      '1701Q Q2 2026 2026-08-17', // Aug 15 is a Saturday
      '2551Q Q3 2026 2026-10-26', // Oct 25 is a Sunday
      '1701Q Q3 2026 2026-11-16', // Nov 15 is a Sunday
      '2551Q Q4 2026 2027-01-25',
      '1701A 2026 2027-04-15',
    ]);
  });

  it('marks the percentage tax returns as for the graduated rates only', () => {
    for (const d of taxDeadlines(2026)) {
      expect(d.who).toBe(d.form === '2551Q' ? 'graduated' : 'everyone');
    }
  });
});

describe('MoneyTaxService', () => {
  function over(rows: { quarters?: unknown[]; withheld?: unknown[] } = {}) {
    const calls: { sql: string; args: unknown[] }[] = [];
    const tx = { query: jest.fn(async (_sql: string, args: unknown[]) => ({ rows: (args[0] as string[]).slice(0, 1).map((id) => ({ id })) })) };
    const db = {
      query: jest.fn(async (sql: string, args: unknown[]) => {
        calls.push({ sql, args });
        if (sql.includes('extract(quarter')) return rows.quarters ?? [];
        if (sql.includes('withheld_minor > 0')) return rows.withheld ?? [];
        return [];
      }),
      transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
    };
    return { service: new MoneyTaxService(db as unknown as DatabaseService), calls, tx };
  }

  it('adds up the quarters, scoped to the caller, and warns near ₱3M', async () => {
    const { service, calls } = over({
      quarters: [
        { quarter: 1, gross: '100000000', expense: '10000000', withheld: '5000000' },
        { quarter: 3, gross: '160000000', expense: '0', withheld: '0' },
      ],
    });
    const tax = await service.year(ME, 2026);
    expect(tax.quarters.map((q) => q.grossMinor)).toEqual([100_000_000, 0, 160_000_000, 0]);
    expect(tax).toMatchObject({ grossMinor: 260_000_000, expenseMinor: 10_000_000, withheldMinor: 5_000_000 });
    expect(tax.threshold.status).toBe('near');
    expect(tax.estimates).not.toBeNull();
    for (const c of calls) {
      expect(c.sql).toContain('user_id = $1');
      expect(c.args[0]).toBe(ME);
    }
  });

  it('groups 2307s by client and quarter, however the name was typed, with what is missing first', async () => {
    const entry = (id: string, who: string | null, paidOn: string, received: boolean) => ({
      id, counterparty: who, paid_on: paidOn, amount_minor: 1_000_000, withheld_minor: 50_000, received,
    });
    const { service } = over({
      withheld: [
        entry('a', 'Tan Corp', '2026-01-10', true),
        entry('b', 'tan corp ', '2026-02-11', true),
        entry('c', 'Tan Corp', '2026-04-02', false),
        entry('d', null, '2026-05-20', true),
      ],
    });
    const { form2307 } = await service.year(ME, 2026);
    expect(form2307.map((g) => [g.client, g.quarter, g.entries.length, g.received, g.withheldMinor])).toEqual([
      ['Tan Corp', 2, 1, false, 50_000],
      ['Tan Corp', 1, 2, true, 100_000],
      [null, 2, 1, true, 50_000],
    ]);
  });

  it('refuses a 2307 tick for anything but the caller\'s withheld income, changing nothing', async () => {
    const { service, tx } = over();
    await expect(service.mark2307(ME, ['e1', 'e2'], true)).rejects.toThrow('Only your own income');
    const [sql, args] = tx.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("user_id = $2 and kind = 'income' and withheld_minor > 0");
    expect(args).toEqual([['e1', 'e2'], ME, true]);
    await expect(service.mark2307(ME, ['e1', 'e1'], false)).resolves.toEqual({ updated: 1 });
  });
});
