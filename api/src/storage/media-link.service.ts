import { createHash } from 'node:crypto';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MEDIA_URL_WINDOW_SECONDS,
  PUBLISHED_URL_TTL_SECONDS,
} from './storage.config';

/**
 * Renditions live on a local volume, not in B2, and are reached through
 * media.virgo.ph — the one hostname that does not go through the tunnel.
 * This is both ends of that: where a rendition is written, and how a URL for
 * it is signed.
 *
 * See docs/MEDIA_DELIVERY.md. The signing scheme has to match
 * `secure_link_md5` in deployment/media/nginx.conf.template and
 * scripts/sign-media-url.mjs exactly — three implementations of one string,
 * and a mismatch in any of them is a 403 with nothing in the log to explain
 * it. media-link.service.spec.ts pins the expected output.
 */

/** Keys are generated, never taken from an upload. nginx matches its location
 *  against the DECODED uri, so anything needing percent-encoding would sign
 *  one string and be verified against another. */
const SAFE_KEY = /^[A-Za-z0-9._\-/]+$/;

/**
 * `.../ceremony.mov` → `.../ceremony-web.mp4`.
 *
 * Same `-suffix` convention as `thumbKeyFor` and `posterKeyFor`, but this one
 * names a path on the media volume rather than a B2 object — which is why it
 * lives here and not beside them. It is derived rather than stored so that
 * deletion needs no row to work from, and there have historically been more
 * objects without a `user_files` row than anyone would like.
 *
 * Here rather than in media-processing.service.ts to keep the import graph
 * acyclic: that module imports StorageService, and StorageService needs this.
 */
export function proxyKeyFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-web.mp4`;
}

/**
 * Long-edge widths generated for photographs, narrowest first.
 *
 * Two, not a ladder. 1024 covers a phone lightbox and a grid tile at any
 * density; 2048 covers a laptop at 1x and a phone at 3x. Anything larger is
 * within a factor of two of the originals we are trying to stop sending, and
 * anything between them is a rounding error the browser picks by itself.
 *
 * A source smaller than a width does not get that width — there is nothing to
 * gain by re-encoding a 900 px scan at 1024.
 */
export const DISPLAY_WIDTHS = [1024, 2048] as const;

/** `.../frame.jpg` → `.../frame-1024.webp`. */
export function displayKeyFor(key: string, width: number): string {
  return `${key.replace(/\.[^./]+$/, '')}-${width}.webp`;
}

/** `.../ceremony.mov` → `.../ceremony-hls` (a directory, not a file). */
export function hlsPrefixFor(key: string): string {
  return `${key.replace(/\.[^./]+$/, '')}-hls`;
}

/**
 * Every rendition path derived from one original.
 *
 * Deletion works from this rather than from stored columns, so it still
 * collects renditions belonging to an object whose `user_files` row was never
 * written — of which the bucket has had more than anyone would like. It is
 * deliberately generous: naming a path that was never created costs one
 * `rm -f` that does nothing.
 */
export function renditionKeysFor(key: string): string[] {
  return [
    proxyKeyFor(key),
    ...DISPLAY_WIDTHS.map((width) => displayKeyFor(key, width)),
  ];
}

@Injectable()
export class MediaLinkService {
  private readonly logger = new Logger(MediaLinkService.name);

  /** Hostname renditions are served from. Empty disables the whole feature. */
  readonly host: string;
  /** Where the volume is mounted inside this container. */
  readonly root: string;
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.host = config.get<string>('MEDIA_HOST', '').trim().replace(/^https?:\/\//i, '');
    this.root = config.get<string>('MEDIA_ROOT', '/srv/media');
    this.secret = config.get<string>('MEDIA_LINK_SECRET', '');

    if (this.host && !this.secret) {
      // Worth shouting about: with a host and no secret every URL this mints
      // is rejected by nginx, and the symptom is films that silently fail to
      // play rather than anything that looks like a configuration error.
      this.logger.error(
        'MEDIA_HOST is set but MEDIA_LINK_SECRET is not — media links will all be refused.',
      );
    } else if (!this.isConfigured) {
      this.logger.warn(
        'Media host is not configured — renditions will not be produced and players fall back to originals.',
      );
    }
  }

  get isConfigured(): boolean {
    return Boolean(this.host && this.secret);
  }

  /**
   * A signed URL for a rendition, or null when the media host is not set up.
   *
   * Null is the graceful path, not an error: every caller already handles a
   * missing rendition by falling back to the B2 original, which is what the
   * deployment did before this existed.
   *
   * Expiry is rounded DOWN to a window so repeated renders inside it return a
   * byte-identical URL and the browser can reuse what it has — the same
   * reasoning, and the same trade, as `mediaUrl` and MEDIA_URL_WINDOW_SECONDS
   * in storage.config.ts.
   */
  url(
    key: string | null | undefined,
    ttlSeconds: number = PUBLISHED_URL_TTL_SECONDS,
  ): string | null {
    if (!key || !this.isConfigured) return null;

    const clean = key.replace(/^\/+/, '');
    if (!this.isSafeKey(clean)) {
      this.logger.warn(`Refusing to sign an unsafe rendition key: ${key}`);
      return null;
    }

    const expires =
      Math.floor((Math.floor(Date.now() / 1000) + ttlSeconds) / MEDIA_URL_WINDOW_SECONDS) *
      MEDIA_URL_WINDOW_SECONDS;

    const signature = createHash('md5')
      .update(`${expires}/${clean} ${this.secret}`)
      .digest('base64')
      // nginx's base64url: + → -, / → _, padding stripped.
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `https://${this.host}/${expires}/${signature}/${clean}`;
  }

  /**
   * Signed display copies for one photograph, narrowest first.
   *
   * Takes the widths that were actually written rather than DISPLAY_WIDTHS,
   * so a source too small for 2048 — or a copy that failed to encode — does
   * not produce a URL that 404s. Empty means the clients fall back to `url`.
   */
  displaySources(
    key: string,
    widths: readonly number[] | null | undefined,
    ttlSeconds: number = PUBLISHED_URL_TTL_SECONDS,
  ): { width: number; url: string }[] {
    if (!widths?.length || !this.isConfigured) return [];
    return widths
      .slice()
      .sort((a, b) => a - b)
      .map((width) => ({ width, url: this.url(displayKeyFor(key, width), ttlSeconds) }))
      .filter((source): source is { width: number; url: string } => source.url !== null);
  }

  /**
   * A signed URL for an HLS master playlist.
   *
   * Signs the ladder DIRECTORY, not the file, and serves it under `/h/` —
   * a different nginx location with a different signing expression. That is
   * the only form that works: a playlist's child URIs are relative, and no
   * player carries anything from the manifest URL down to them. With the
   * token above the directory, every relative URI resolves under the same
   * signed prefix by plain URL resolution.
   *
   * Signing the full key the way `url` does would refuse the first segment
   * the player asked for, with a 403 and nothing in the log to explain it.
   */
  hlsUrl(
    prefix: string | null | undefined,
    ttlSeconds: number = PUBLISHED_URL_TTL_SECONDS,
  ): string | null {
    if (!prefix || !this.isConfigured) return null;

    const dir = prefix.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!this.isSafeKey(dir) || !dir.endsWith('-hls')) {
      this.logger.warn(`Refusing to sign an unsafe ladder prefix: ${prefix}`);
      return null;
    }

    const expires =
      Math.floor((Math.floor(Date.now() / 1000) + ttlSeconds) / MEDIA_URL_WINDOW_SECONDS) *
      MEDIA_URL_WINDOW_SECONDS;

    const signature = createHash('md5')
      .update(`${expires}/${dir} ${this.secret}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `https://${this.host}/h/${expires}/${signature}/${dir}/master.m3u8`;
  }

  /** `url` for a batch, preserving order. Signing is a hash, not a call. */
  urls(
    keys: (string | null | undefined)[],
    ttlSeconds: number = PUBLISHED_URL_TTL_SECONDS,
  ): (string | null)[] {
    return keys.map((key) => this.url(key, ttlSeconds));
  }

  /**
   * Publishes a finished rendition into the volume.
   *
   * ffmpeg writes to `<key>.part` inside the volume and this renames it into
   * place, because nginx serves the directory live and a half-written mp4 is
   * indistinguishable from a corrupt one. Rename is atomic within a
   * filesystem, which is why the temporary file cannot live in tmpdir — that
   * is a different mount and the rename would fail with EXDEV.
   */
  async publish(key: string): Promise<void> {
    const final = this.pathFor(key);
    await rename(`${final}.part`, final);
  }

  /** Absolute path for a rendition key, with the staging directory created. */
  async stagePathFor(key: string): Promise<string> {
    const final = this.pathFor(key);
    await mkdir(dirname(final), { recursive: true });
    return `${final}.part`;
  }

  /**
   * Staging directory for a ladder, created empty.
   *
   * A ladder is hundreds of files that are only valid together, so it is
   * staged and swapped as a whole rather than written in place. nginx serves
   * this tree live and a master playlist pointing at segments that do not
   * exist yet is worse than no ladder at all.
   */
  async stageDirFor(prefix: string): Promise<string> {
    if (!this.isSafeKey(prefix)) throw new Error(`Unsafe ladder prefix: ${prefix}`);
    const staged = `${this.pathFor(prefix)}.part`;
    await rm(staged, { recursive: true, force: true });
    await mkdir(staged, { recursive: true });
    return staged;
  }

  /**
   * Swaps a staged ladder into place.
   *
   * The old directory is removed first because rename onto a non-empty
   * directory fails. That leaves a window of a few milliseconds with no
   * ladder, which only matters on a re-encode — and a re-encode is rare
   * enough to be worth the simplicity.
   */
  async publishDir(prefix: string): Promise<void> {
    const final = this.pathFor(prefix);
    await rm(final, { recursive: true, force: true });
    await rename(`${final}.part`, final);
  }

  /** Creates a directory inside an already-staged tree. */
  async makeDir(absolutePath: string): Promise<void> {
    await mkdir(absolutePath, { recursive: true });
  }

  /** Throws away a staged ladder that will not be published. */
  async discardDir(prefix: string): Promise<void> {
    await rm(`${this.pathFor(prefix)}.part`, { recursive: true, force: true }).catch(
      () => undefined,
    );
  }

  /**
   * Writes a rendition that is already in memory.
   *
   * The counterpart to `stagePathFor` + `publish` for producers that hand
   * over a buffer rather than writing a file — sharp returns one, ffmpeg does
   * not. Staged and renamed for the same reason: nginx serves this directory
   * live, and a half-written file is indistinguishable from a corrupt one.
   */
  async write(key: string, body: Buffer): Promise<void> {
    if (!this.isSafeKey(key)) throw new Error(`Unsafe rendition key: ${key}`);
    const staged = await this.stagePathFor(key);
    try {
      await writeFile(staged, body);
      await this.publish(key);
    } catch (error) {
      await rm(staged, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Removes every rendition belonging to the given ORIGINAL keys.
   *
   * Takes originals rather than rendition keys because every rendition name
   * is derived from its source, so deletion needs no database round trip and
   * cannot be defeated by a row that was never written — of which there have
   * historically been more than anyone would like. It also means a rendition
   * type added later is collected retroactively, as soon as it appears in
   * `renditionKeysFor`.
   *
   * Never throws. A rendition that will not delete is wasted disk, and the
   * LRU sweep will get it; failing the user's delete over it would be a much
   * worse trade.
   */
  async removeFor(originalKeys: readonly string[]): Promise<void> {
    if (!this.root) return;
    for (const original of originalKeys) {
      // The ladder is a directory of hundreds of segments, so it goes as a
      // tree rather than as a name in the list below.
      await this.removeTree(hlsPrefixFor(original));
      for (const key of renditionKeysFor(original)) {
        if (!this.isSafeKey(key)) continue;
        try {
          await rm(this.pathFor(key), { force: true });
          await rm(`${this.pathFor(key)}.part`, { force: true });
        } catch (error) {
          this.logger.warn(
            `Could not remove rendition ${key}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  /**
   * Removes every rendition under a prefix — `users/<id>/` for a full wipe.
   *
   * A wipe deletes the user's originals from B2, and deriving a rendition
   * name for each of several thousand keys to unlink them one at a time is
   * both slower and less complete than removing the subtree they all live
   * under. Never throws, for the same reason `removeFor` does not.
   */
  async removeTree(prefix: string): Promise<void> {
    if (!this.root || !this.isSafeKey(prefix)) return;
    try {
      await rm(this.pathFor(prefix), { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `Could not remove rendition tree ${prefix}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Scheme + host, for a Content-Security-Policy source list. */
  origin(): string {
    return this.host ? `https://${this.host}` : '';
  }

  /**
   * Absolute path, refusing anything that escapes the volume.
   *
   * `isSafeKey` already rejects `..`, so this is the second lock on the same
   * door — but it is the one that would still hold if the key ever came from
   * somewhere less trustworthy than our own code.
   */
  private pathFor(key: string): string {
    const resolved = normalize(join(this.root, key));
    if (!resolved.startsWith(this.root.endsWith(sep) ? this.root : `${this.root}${sep}`)) {
      throw new Error(`Rendition key escapes the media root: ${key}`);
    }
    return resolved;
  }

  private isSafeKey(key: string): boolean {
    return SAFE_KEY.test(key) && !key.includes('..');
  }
}
