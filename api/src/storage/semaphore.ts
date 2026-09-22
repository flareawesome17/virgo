/**
 * At most `limit` tasks at once; the rest wait their turn, in the order they
 * asked.
 *
 * In-process, which is all it has to be. It exists to keep a burst of uploads
 * from running every expensive decode at the same time on a box that also
 * runs Postgres and the web servers — a second API process would have its own
 * memory and its own share of the CPU, and its own count.
 */
export class Semaphore {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  /** Runs `task` once a slot is free, and gives the slot back however it ends. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  /** How many tasks hold a slot right now. */
  get running(): number {
    return this.active;
  }

  /** How many are waiting for one. */
  get queued(): number {
    return this.waiting.length;
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    // Handed straight to whoever is next rather than counted down and back
    // up, so a task arriving in between cannot take the slot from them.
    const next = this.waiting.shift();
    if (next) next();
    else this.active -= 1;
  }
}
