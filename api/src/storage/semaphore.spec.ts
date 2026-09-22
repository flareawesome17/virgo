import { Semaphore } from './semaphore';

/** A task that finishes when the test says so. */
function held<T>(value: T) {
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => {
    finish = resolve;
  });
  return { run: async () => { await ready; return value; }, finish };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('Semaphore', () => {
  it('runs up to the limit at once and queues the rest in order', async () => {
    const slots = new Semaphore(2);
    const tasks = [held('a'), held('b'), held('c'), held('d')];
    const started: string[] = [];

    const all = Promise.all(
      tasks.map((task, i) =>
        slots.run(() => {
          started.push('abcd'[i]);
          return task.run();
        }),
      ),
    );
    await settle();

    expect(started).toEqual(['a', 'b']);
    expect([slots.running, slots.queued]).toEqual([2, 2]);

    tasks[0].finish();
    await settle();
    expect(started).toEqual(['a', 'b', 'c']);

    for (const task of tasks) task.finish();
    await expect(all).resolves.toEqual(['a', 'b', 'c', 'd']);
    expect([slots.running, slots.queued]).toEqual([0, 0]);
  });

  it('gives the slot back when a task throws', async () => {
    const slots = new Semaphore(1);

    await expect(slots.run(() => Promise.reject(new Error('decode failed')))).rejects.toThrow(
      'decode failed',
    );
    await expect(
      slots.run(() => {
        throw new Error('not even started');
      }),
    ).rejects.toThrow('not even started');

    expect(slots.running).toBe(0);
    await expect(slots.run(async () => 'through')).resolves.toBe('through');
  });
});
