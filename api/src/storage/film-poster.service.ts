import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { blurDataUrl } from './blur';
import { Semaphore } from './semaphore';
import { StorageService } from './storage.service';

const run = promisify(execFile);

export function posterKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-poster.webp`;
}

/**
 * How long ffmpeg may take over one frame while somebody waits to post.
 *
 * The seek is before the input, so ffmpeg reads the container's index and
 * the one keyframe it needs — a second or two even over B2. One that has not
 * finished by now is not going to finish while the app waits.
 */
const GRAB_TIMEOUT_MS = 45_000;

/** Only has to outlast the grab. */
const SOURCE_URL_TTL_SECONDS = 10 * 60;

/** Posting is rare; this only stops a burst of posts all decoding at once. */
const grabs = new Semaphore(2);

/** Posters removed per statement, and statements per sweep. */
const SWEEP_BATCH = 200;
const SWEEP_ROUNDS = 25;

/**
 * Left alone by the sweep for this long after they are made, so a poster made
 * for a post is not taken in the moment before the post's row is written.
 */
const FRESH_MS = 60 * 60_000;

/**
 * Poster frames, only for films that are posted.
 *
 * The media worker used to grab one from every film as it was uploaded. Albums
 * now show the Virgo video icon for a film instead, so the only surfaces that
 * still need a frame are a showcase's — the feed, a profile, a shared post —
 * and a film is given one when it is posted (ShowcasesService.usableKeys).
 *
 * The sweep is the other half: a poster no showcase points at is removed from
 * B2, which is also what clears the posters every film was given before.
 */
@Injectable()
export class FilmPosterService {
  private readonly logger = new Logger(FilmPosterService.name);
  private readonly inFlight = new Map<string, Promise<string | null>>();
  /** File key → when its poster was made here. See FRESH_MS. */
  private readonly made = new Map<string, number>();
  private sweeping = false;

  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
  ) {}

  /**
   * The film's poster key, making it first when it has none.
   *
   * Only for a film the media worker has finished with: its duration says
   * where to take the frame from, and an upload still being probed is one
   * that cannot be posted yet anyway. **Never throws** — null means there is
   * no poster, and the caller says so.
   */
  ensure(key: string): Promise<string | null> {
    const running = this.inFlight.get(key);
    if (running) return running;
    const job = this.make(key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, job);
    return job;
  }

  private async make(key: string): Promise<string | null> {
    try {
      const file = await this.db.queryOne<{
        poster_key: string | null;
        content_type: string | null;
        duration_ms: string | number | null;
        processing_status: string | null;
      }>(
        `select poster_key, content_type, duration_ms, processing_status
           from user_files where key = $1`,
        [key],
      );
      if (!file) return null;
      if (file.poster_key) return file.poster_key;
      if (!(file.content_type ?? '').toLowerCase().startsWith('video/')) return null;
      if (file.processing_status !== 'ready') return null;

      const source = await this.storage.mediaUrl(key, SOURCE_URL_TTL_SECONDS);
      if (!source) return null;
      // Before the frame is taken, so a sweep running meanwhile leaves this
      // key alone (see FRESH_MS).
      this.made.set(key, Date.now());

      const durationMs = file.duration_ms == null ? null : Number(file.duration_ms);
      const body = await grabs.run(() => grabFrame(source, durationMs));
      const posterKey = posterKeyFor(key);
      await this.storage.putDerived(posterKey, body, 'image/webp');
      const blur = await blurDataUrl(body);
      await this.db.query(
        `update user_files
            set poster_key = $2,
                blur_data_url = coalesce(blur_data_url, $3)
          where key = $1`,
        [key, posterKey, blur],
      );
      return posterKey;
    } catch (error) {
      this.logger.warn(
        `No poster for ${key}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300),
      );
      return null;
    }
  }

  /**
   * Removes posters that no showcase uses.
   *
   * Each round clears the rows first, in one statement that checks nothing
   * points at them and locks what it takes, and only then deletes the
   * objects. A poster that could not be deleted is put back on its row, so
   * the next sweep tries it again rather than leaving it in B2 with nothing
   * pointing at it.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    let removed = 0;
    try {
      for (let round = 0; round < SWEEP_ROUNDS; round++) {
        const { taken, gone } = await this.sweepRound();
        removed += gone;
        if (taken < SWEEP_BATCH || gone === 0) break;
      }
      if (removed > 0) this.logger.log(`Removed ${removed} poster(s) no showcase uses`);
    } catch (error) {
      this.logger.warn(
        `Poster sweep stopped: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.sweeping = false;
    }
  }

  private async sweepRound(): Promise<{ taken: number; gone: number }> {
    const now = Date.now();
    for (const [key, at] of this.made) if (now - at > FRESH_MS) this.made.delete(key);

    const taken = await this.db.query<{ key: string; poster_key: string; blur_data_url: string | null }>(
      `update user_files f
          set poster_key = null,
              -- A film's preview was made from its poster and goes with it.
              blur_data_url = case
                when split_part(coalesce(f.content_type, ''), '/', 1) = 'video' then null
                else f.blur_data_url
              end
         from (
           select key, poster_key, blur_data_url
             from user_files u
            where u.poster_key is not null
              and u.key <> all($2::text[])
              and not exists (select 1 from showcase_items i where i.file_key = u.key)
            order by u.key
            limit $1
            for update of u skip locked
         ) old
        where f.key = old.key
        returning old.key, old.poster_key, old.blur_data_url`,
      [SWEEP_BATCH, [...this.made.keys()]],
    );
    if (taken.length === 0) return { taken: 0, gone: 0 };

    // Only ever poster objects, whatever a row says, and none that a post
    // started making since the rows were taken: it writes the same key.
    const posters = taken.filter(
      (row) => row.poster_key.endsWith('-poster.webp') && !this.made.has(row.key),
    );
    const deleted = await this.storage.deleteKeys(
      posters.map((row) => row.poster_key),
      'film posters no showcase uses',
    );
    const kept = taken.filter((row) => !deleted.has(row.poster_key));
    if (kept.length > 0) {
      await this.db.query(
        `update user_files f
            set poster_key = k.poster_key,
                blur_data_url = coalesce(f.blur_data_url, k.blur_data_url)
           from unnest($1::text[], $2::text[], $3::text[]) as k(key, poster_key, blur_data_url)
          where f.key = k.key and f.poster_key is null`,
        [kept.map((row) => row.key), kept.map((row) => row.poster_key), kept.map((row) => row.blur_data_url)],
      );
    }
    return { taken: taken.length, gone: taken.length - kept.length };
  }
}

/**
 * One frame of a film as WebP, at most 1280 px wide.
 *
 * A tenth of the way in, capped at one second: past a fade from black, and
 * not so far in that a short clip has ended.
 */
async function grabFrame(source: string, durationMs: number | null): Promise<Buffer> {
  const folder = await mkdtemp(join(tmpdir(), 'virgo-poster-'));
  const output = join(folder, 'poster.webp');
  const atSeconds = Math.max(0, Math.min(1, durationMs ? durationMs / 10_000 : 1)).toFixed(2);
  try {
    await run(
      'ffmpeg',
      [
        '-v', 'error',
        '-ss', atSeconds,
        '-i', source,
        '-frames:v', '1',
        '-vf', "scale='min(1280,iw)':-2",
        '-quality', '78',
        '-y', output,
      ],
      { timeout: GRAB_TIMEOUT_MS },
    );
    return await readFile(output);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
