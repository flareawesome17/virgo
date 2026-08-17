import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';

/**
 * Serving the desktop app's installers to people who have no GitHub account.
 *
 * The repository is private, so a release asset URL answers 404 to anybody not
 * signed in as a collaborator — a download page linking straight to GitHub
 * would be broken for every visitor it is built for. This module is the way
 * across: it holds a read-only token server-side, and hands out the bytes
 * under an address on api.virgo.ph.
 *
 * Nothing here decides *what* a release contains. The release workflow builds
 * the installers and attaches them; this reads back whatever it attached, so
 * adding a platform there needs no change here beyond a naming rule below.
 */

/** The platforms the desktop app is built for. */
export type DesktopPlatform = 'windows' | 'macos';

export interface DownloadAsset {
  filename: string;
  platform: DesktopPlatform;
  arch: 'x64' | 'arm64';
  /** What a button for this file should say. */
  label: string;
  /** The line under it, naming who it is for. */
  hint: string;
  /**
   * The one to offer first for this platform and architecture.
   *
   * Both macOS builds are recommended — for different machines. On Windows the
   * .exe is, and the .msi is not: they install the same app, and the MSI is
   * there for administrators deploying by policy rather than for a person
   * clicking a button.
   */
  recommended: boolean;
  /** Bytes, so the page can say how large the download is before it starts. */
  size: number;
  /** Absolute, and on this API rather than on GitHub. */
  url: string;
}

export interface LatestRelease {
  version: string;
  tag: string;
  publishedAt: string | null;
  assets: DownloadAsset[];
}

interface GitHubAsset {
  id: number;
  name: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name?: string | null;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GitHubAsset[];
}

/**
 * The dynamic-format response `tauri-plugin-updater` expects.
 *
 * Field names are Tauri's, `pub_date` included — the plugin deserialises this,
 * nothing of ours reads it.
 */
export interface UpdateManifest {
  version: string;
  notes?: string;
  pub_date?: string;
  url: string;
  signature: string;
}

/**
 * `a` is newer than `b`, compared numerically per part.
 *
 * 1.10.0 is newer than 1.9.0, which a string comparison gets backwards — and
 * that is exactly the release where somebody would notice, because every
 * installed copy would quietly stop being offered updates.
 */
function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

/**
 * A release tag, exactly as the release workflow validates it.
 *
 * Checked before the value reaches a URL because it is user input on a public
 * endpoint: without it, `..%2f..` in a tag would address paths on api.github.com
 * that this token can read and this endpoint should not expose.
 */
const TAG_PATTERN = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/**
 * How long the release listing is held.
 *
 * The listing changes a few times a month; the rate limit is 5,000 requests an
 * hour. Without a cache a download page open in a few dozen tabs, each polling
 * on focus, is enough to spend it — and running out means the page fails for
 * everybody until the window rolls over.
 */
const CACHE_TTL_MS = 5 * 60_000;

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);
  private cached: { at: number; release: LatestRelease } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get repository(): string {
    return (
      this.config.get<string>('GITHUB_REPOSITORY')?.trim() ||
      'flareawesome17/virgo'
    );
  }

  private get token(): string | undefined {
    // Not the deployment worker's token, despite doing the same job against
    // the same repository. That one lives DPAPI-encrypted under
    // deployment/windows/secrets and can be read only by the Windows account
    // running the scheduled task, which a Linux container cannot do. Separate
    // tokens also mean this one — reachable from the internet — can be revoked
    // without stopping deployments.
    return this.config.get<string>('GITHUB_DOWNLOADS_TOKEN')?.trim() || undefined;
  }

  private get publicApiUrl(): string {
    return (
      this.config.get<string>('PUBLIC_API_URL')?.trim().replace(/\/+$/, '') ||
      'https://api.virgo.ph'
    );
  }

  /**
   * Whether this deployment can serve downloads at all.
   *
   * Exposed so the endpoint can answer "not configured" distinctly from "no
   * release yet". They need different fixes and look identical from outside.
   */
  isConfigured(): boolean {
    return Boolean(this.token);
  }

  private async github(path: string, accept: string): Promise<Response> {
    const token = this.token;
    if (!token) {
      throw new NotFoundException(
        'Downloads are not configured on this server.',
      );
    }

    // GitHub answers this repository's release endpoints with an occasional
    // 404 that is not true — the same request repeated immediately succeeds.
    // Observed directly: three identical calls returned 404, the release, 404,
    // with the rate limit untouched at 5000/5000.
    //
    // A private repository returns 404 rather than 403 for anything the caller
    // may not see, so a transient internal state looks identical to "no such
    // release". Retrying is the only way to tell them apart, and it is cheap:
    // a genuine 404 costs two extra requests and still answers in well under a
    // second.
    const RETRYABLE = new Set([404, 500, 502, 503, 504]);
    let last: Response | undefined;

    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
      }

      last = await fetch(`https://api.github.com${path}`, {
        headers: {
          Accept: accept,
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'virgo-api',
        },
      });

      if (last.ok || !RETRYABLE.has(last.status)) return last;

      // Only the metadata calls are retried. An asset download follows a
      // redirect to storage and streams tens of megabytes; replaying that on a
      // transient failure would fetch the whole installer twice.
      if (accept === 'application/octet-stream') return last;

      this.logger.warn(
        `GitHub answered ${last.status} for ${path} (attempt ${attempt + 1} of 3)`,
      );
    }

    return last!;
  }

  /**
   * Names an installer from its filename.
   *
   * The names come from Tauri's bundler and carry the architecture but not the
   * audience — `Virgo_1.7.0_aarch64.dmg` is accurate and tells a photographer
   * nothing about whether it is the file for their laptop. Everything below
   * exists to turn that into "macOS (Apple Silicon) — M1, M2, M3 and later".
   *
   * An unrecognised file returns null and is dropped from the listing rather
   * than shown unlabelled: an unexplained download is worse than an absent one,
   * and the release also carries the deployment worker zip and its checksum,
   * which are not for end users at all.
   */
  private classify(asset: GitHubAsset, tag: string): DownloadAsset | null {
    const name = asset.name;
    const lower = name.toLowerCase();

    const base = {
      filename: name,
      size: asset.size,
      url: `${this.publicApiUrl}/downloads/${tag}/${encodeURIComponent(name)}`,
    };

    if (lower.endsWith('.msi')) {
      return {
        ...base,
        platform: 'windows',
        arch: 'x64',
        label: 'Windows (MSI)',
        hint: 'For administrators deploying by policy',
        recommended: false,
      };
    }

    if (lower.endsWith('.exe')) {
      return {
        ...base,
        platform: 'windows',
        arch: 'x64',
        label: 'Windows',
        hint: 'Windows 10 and 11, 64-bit',
        recommended: true,
      };
    }

    if (lower.endsWith('.dmg')) {
      // Tauri writes the Rust target's architecture, so Apple Silicon is
      // `aarch64` and Intel is `x64` or `x86_64` depending on the version.
      const isAppleSilicon = lower.includes('aarch64') || lower.includes('arm64');
      return {
        ...base,
        platform: 'macos',
        arch: isAppleSilicon ? 'arm64' : 'x64',
        label: isAppleSilicon ? 'macOS (Apple Silicon)' : 'macOS (Intel)',
        hint: isAppleSilicon
          ? 'M1, M2, M3 and later'
          : 'Intel-based Macs, 2020 and earlier',
        recommended: true,
      };
    }

    return null;
  }

  /**
   * What a Tauri dynamic updater endpoint answers with.
   *
   * Field names are Tauri's, including the snake_case `pub_date` — this is
   * deserialised by the plugin, not read by anything of ours.
   */
  private async updateFor(
    target: string,
    arch: string,
    currentVersion: string,
  ): Promise<UpdateManifest | null> {
    // Only Windows for now. macOS updates need the app packaged as a tarball
    // rather than the .dmg the download page serves, which is a separate build
    // target and a platform this has never run on — so it is added
    // deliberately rather than by leaving a guess in here.
    if (target !== 'windows') return null;

    const release = await this.newestReleaseWithInstallers();
    if (!release) return null;

    const version = release.tag_name.replace(/^v/, '');
    if (!isNewer(version, currentVersion)) return null;

    // The NSIS installer is what the updater runs, and the .sig beside it is
    // what proves the download is ours. Both come from the same build; a
    // release carrying one without the other is not offered at all, because
    // the plugin would download the installer and then refuse it.
    const installer = release.assets.find((asset) =>
      asset.name.toLowerCase().endsWith('-setup.exe'),
    );
    const signatureAsset = installer
      ? release.assets.find((asset) => asset.name === `${installer.name}.sig`)
      : undefined;

    if (!installer || !signatureAsset) {
      this.logger.warn(
        `${release.tag_name} has no signed Windows installer — not offering an update.`,
      );
      return null;
    }

    const signature = await this.readAssetText(signatureAsset.id);
    if (!signature) return null;

    return {
      version,
      notes: release.name || undefined,
      pub_date: release.published_at ?? undefined,
      url: `${this.publicApiUrl}/downloads/${release.tag_name}/${encodeURIComponent(installer.name)}`,
      signature: signature.trim(),
    };
  }

  /** Public wrapper, so the controller does not reach into the private half. */
  async getUpdate(
    target: string,
    arch: string,
    currentVersion: string,
  ): Promise<UpdateManifest | null> {
    return this.updateFor(target, arch, currentVersion);
  }

  /**
   * A small asset's contents, as text.
   *
   * Only ever used for `.sig` files, which are a single short line. Anything
   * larger has no business being read into memory here — the installers
   * themselves are streamed by `openAsset`.
   */
  private async readAssetText(assetId: number): Promise<string | null> {
    const response = await this.github(
      `/repos/${this.repository}/releases/assets/${assetId}`,
      'application/octet-stream',
    );
    if (!response.ok) {
      this.logger.error(
        `Reading asset ${assetId} failed: ${response.status} ${response.statusText}`,
      );
      return null;
    }
    return response.text();
  }

  /** The raw release behind `getLatest`, for callers that need its assets. */
  private async newestReleaseWithInstallers(): Promise<GitHubRelease | null> {
    const response = await this.github(
      `/repos/${this.repository}/releases?per_page=20`,
      'application/vnd.github+json',
    );
    if (!response.ok) return null;

    const releases = (await response.json()) as GitHubRelease[];
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      if (!TAG_PATTERN.test(release.tag_name)) continue;
      if (release.assets.some((asset) => this.classify(asset, release.tag_name))) {
        return release;
      }
    }
    return null;
  }

  /**
   * The newest published release that actually carries installers.
   *
   * `/releases/latest` is deliberately not used: it answers with the newest
   * non-draft release whether or not the desktop job attached anything to it,
   * so a release cut while that job was failing would leave the download page
   * describing a version nobody can download. Walking the list and taking the
   * first with recognisable assets degrades to the previous working release
   * instead, which is the behaviour somebody visiting the page wants.
   */
  async getLatest(): Promise<LatestRelease> {
    if (this.cached && Date.now() - this.cached.at < CACHE_TTL_MS) {
      return this.cached.release;
    }

    const response = await this.github(
      `/repos/${this.repository}/releases?per_page=20`,
      'application/vnd.github+json',
    );

    if (!response.ok) {
      this.logger.error(
        `Listing releases failed: ${response.status} ${response.statusText}`,
      );
      // Stale is better than nothing: GitHub being briefly unavailable should
      // not empty a page that was correct a minute ago.
      if (this.cached) return this.cached.release;

      // The status is named in the response, not only in the log.
      //
      // Without it, a token GitHub rejects and a token that is merely missing
      // look identical from outside — and diagnosing it needs a shell on the
      // production host, which is a poor requirement for "the download page is
      // empty". This is not sensitive: it says the server cannot read its own
      // releases, which the empty page already says.
      const reason =
        response.status === 401
          ? 'the configured token was rejected'
          : response.status === 403
            ? 'the configured token is forbidden or rate limited'
            : response.status === 404
              ? 'the configured token cannot see the repository — check it lists this repository and grants Contents: Read'
              : `GitHub answered ${response.status}`;

      throw new NotFoundException(
        `No downloads are available right now: ${reason}.`,
      );
    }

    const releases = (await response.json()) as GitHubRelease[];

    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      if (!TAG_PATTERN.test(release.tag_name)) continue;

      const assets = release.assets
        .map((asset) => this.classify(asset, release.tag_name))
        .filter((asset): asset is DownloadAsset => asset !== null)
        // Windows first, then Apple Silicon, then Intel — the order the page
        // reads top to bottom, so it does not have to re-sort.
        .sort((a, b) => {
          if (a.platform !== b.platform) return a.platform === 'windows' ? -1 : 1;
          return a.arch === b.arch ? 0 : a.arch === 'arm64' ? -1 : 1;
        });

      if (assets.length === 0) continue;

      const latest: LatestRelease = {
        version: release.tag_name.replace(/^v/, ''),
        tag: release.tag_name,
        publishedAt: release.published_at,
        assets,
      };

      this.cached = { at: Date.now(), release: latest };
      return latest;
    }

    throw new NotFoundException('No downloads are available yet.');
  }

  /**
   * Resolves a requested file to a real asset on a real release.
   *
   * The filename is matched against what the release actually carries rather
   * than trusted and appended to a URL. That is what keeps this endpoint from
   * being a way to read arbitrary paths on api.github.com with the server's
   * token, and it is the reason the asset id — not the name — is what the
   * download below is fetched by.
   */
  private async findAsset(
    tag: string,
    filename: string,
  ): Promise<{ id: number; name: string; size: number }> {
    if (!TAG_PATTERN.test(tag)) {
      throw new NotFoundException('No such download.');
    }

    const response = await this.github(
      `/repos/${this.repository}/releases/tags/${tag}`,
      'application/vnd.github+json',
    );

    if (!response.ok) {
      this.logger.error(
        `Looking up ${tag} failed: ${response.status} ${response.statusText}`,
      );
      // Not "no such download": after three attempts this is a failure to
      // reach GitHub, and saying otherwise sends whoever is debugging it to
      // look for a missing file that is sitting right there on the release.
      // That is precisely what happened — every installer 404'd while the
      // download page listed them, because the page reads a cached listing and
      // this does not.
      throw new ServiceUnavailableException(
        `Could not reach the release store (GitHub answered ${response.status}). Try again in a moment.`,
      );
    }

    const release = (await response.json()) as GitHubRelease;
    if (release.draft) throw new NotFoundException('No such download.');

    const asset = release.assets.find((candidate) => candidate.name === filename);
    // Only files this module is willing to describe are files it will serve.
    // Without this the deployment worker zip, which is on every release and is
    // not for end users, would be downloadable by name.
    if (!asset || !this.classify(asset, tag)) {
      throw new NotFoundException('No such download.');
    }

    return { id: asset.id, name: asset.name, size: asset.size };
  }

  /**
   * Opens an installer for streaming.
   *
   * GitHub answers this with a redirect to a signed, short-lived CDN URL that
   * needs no credentials. `fetch` follows it, and drops the Authorization
   * header on the way because the redirect crosses origins — which is both
   * correct and necessary, since sending this token to a storage host would
   * leak it.
   *
   * The bytes are then relayed rather than the caller being redirected. That
   * costs bandwidth this server has, and buys a download that stays on
   * api.virgo.ph instead of bouncing somebody to a githubusercontent.com
   * address for a private repository they cannot see.
   */
  async openAsset(
    tag: string,
    filename: string,
  ): Promise<{ name: string; size: number; body: Readable }> {
    const asset = await this.findAsset(tag, filename);

    const response = await this.github(
      `/repos/${this.repository}/releases/assets/${asset.id}`,
      'application/octet-stream',
    );

    if (!response.ok || !response.body) {
      this.logger.error(
        `Fetching asset ${asset.id} failed: ${response.status} ${response.statusText}`,
      );
      // Same distinction as above: the asset was found a moment ago, so a
      // failure here is the store being unreachable rather than the file being
      // absent.
      throw new ServiceUnavailableException(
        `Could not fetch that download (GitHub answered ${response.status}). Try again in a moment.`,
      );
    }

    return {
      name: asset.name,
      size: asset.size,
      body: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    };
  }
}
