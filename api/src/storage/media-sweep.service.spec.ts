import { planSweep, type Candidate } from './media-sweep.service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

function item(over: Partial<Candidate> & { path: string }): Candidate {
  return {
    kind: 'proxy',
    bytes: 1_000,
    lastUsed: NOW - 90 * DAY,
    source: `${over.path}.src`,
    ...over,
  };
}

const opts = (maxBytes: number, minAgeDays = 30) => ({
  maxBytes,
  minAgeMs: minAgeDays * DAY,
  now: NOW,
});

describe('planSweep', () => {
  it('evicts nothing when under budget', () => {
    const plan = planSweep([item({ path: 'a' }), item({ path: 'b' })], opts(10_000));
    expect(plan.evict).toEqual([]);
    expect(plan.totalBytes).toBe(2_000);
    expect(plan.stuck).toBe(false);
  });

  it('evicts nothing when no budget is set', () => {
    // 0 means unbounded, which is the default. A sweep that started deleting
    // because nobody had configured it yet would be the worst possible
    // default behaviour.
    const plan = planSweep([item({ path: 'a' })], opts(0));
    expect(plan.evict).toEqual([]);
  });

  it('takes the coldest first', () => {
    const plan = planSweep(
      [
        item({ path: 'warm', lastUsed: NOW - 40 * DAY }),
        item({ path: 'coldest', lastUsed: NOW - 200 * DAY }),
        item({ path: 'cold', lastUsed: NOW - 100 * DAY }),
      ],
      opts(2_000),
    );
    expect(plan.evict.map((i) => i.path)).toEqual(['coldest']);
  });

  it('stops as soon as it is under budget', () => {
    const plan = planSweep(
      [
        item({ path: 'a', lastUsed: NOW - 300 * DAY }),
        item({ path: 'b', lastUsed: NOW - 200 * DAY }),
        item({ path: 'c', lastUsed: NOW - 100 * DAY }),
      ],
      opts(1_500),
    );
    expect(plan.evict.map((i) => i.path)).toEqual(['a', 'b']);
    expect(plan.freedBytes).toBe(2_000);
    expect(plan.stuck).toBe(false);
  });

  it('breaks ties towards the larger item', () => {
    // Equally cold, so the one that frees more disk per deletion wins.
    const plan = planSweep(
      [
        item({ path: 'small', bytes: 1_000 }),
        item({ path: 'big', bytes: 9_000 }),
      ],
      opts(5_000),
    );
    expect(plan.evict.map((i) => i.path)).toEqual(['big']);
  });

  it('never touches anything inside the grace window', () => {
    // The point of the window. A client watching a film this week must not
    // have its ladder deleted out from under them because the disk is full.
    const plan = planSweep(
      [
        item({ path: 'yesterday', lastUsed: NOW - 1 * DAY }),
        item({ path: 'last-week', lastUsed: NOW - 7 * DAY }),
      ],
      opts(500),
    );
    expect(plan.evict).toEqual([]);
  });

  it('reports being stuck when over budget with nothing old enough', () => {
    const plan = planSweep([item({ path: 'hot', lastUsed: NOW })], opts(100));
    expect(plan.stuck).toBe(true);
    expect(plan.evict).toEqual([]);
  });

  it('is not stuck when eviction got it under budget', () => {
    const plan = planSweep(
      [item({ path: 'a' }), item({ path: 'b', lastUsed: NOW })],
      opts(1_000),
    );
    expect(plan.evict.map((i) => i.path)).toEqual(['a']);
    expect(plan.stuck).toBe(false);
  });

  it('treats a ladder as one unit, however large', () => {
    const plan = planSweep(
      [
        item({ path: 'film-hls', kind: 'ladder', bytes: 400_000, lastUsed: NOW - 60 * DAY }),
        item({ path: 'photo-2048.webp', kind: 'display', bytes: 300, lastUsed: NOW - 61 * DAY }),
      ],
      opts(1_000),
    );
    // The display copy is fractionally colder and goes first, but it frees
    // 300 bytes, so the ladder has to go too.
    expect(plan.evict.map((i) => i.kind)).toEqual(['display', 'ladder']);
    expect(plan.freedBytes).toBe(400_300);
  });

  it('handles an empty volume', () => {
    expect(planSweep([], opts(1_000))).toEqual({
      totalBytes: 0,
      evict: [],
      freedBytes: 0,
      stuck: false,
    });
  });

  it('carries the source key through, which is what gets reset', () => {
    const plan = planSweep(
      [item({ path: 'x-web.mp4', source: 'users/u/a/x.mov', lastUsed: NOW - 90 * DAY })],
      opts(1),
    );
    expect(plan.evict[0].source).toBe('users/u/a/x.mov');
  });
});
