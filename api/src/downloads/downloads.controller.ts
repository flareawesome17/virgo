import { Controller, Get, Logger, Param, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { DownloadsService } from './downloads.service';

/**
 * Public endpoints for the desktop app's installers.
 *
 * Both are unauthenticated on purpose: this is what the download page on the
 * marketing site reads, and that page is for people who do not have an account
 * yet. It exposes exactly two things — which release is current, and the bytes
 * of a file attached to it — and nothing about the repository beyond that.
 */
@Controller('downloads')
export class DownloadsController {
  private readonly logger = new Logger(DownloadsController.name);

  constructor(private readonly downloads: DownloadsService) {}

  /**
   * What to offer, and how to label it.
   *
   * The page renders entirely from this, so a new platform appears there as
   * soon as the release workflow attaches one — there is no list of files kept
   * in the frontend to drift out of step with what was actually built.
   */
  @Public()
  @Get('latest')
  async latest() {
    return this.downloads.getLatest();
  }

  /**
   * The Android app, which has no store listing to link to yet.
   *
   * Its own endpoint rather than a field on `latest`, because the two carry
   * unrelated version numbers — the desktop app is on 1.12.x and the phone app
   * on 1.3.x — and one response captioned with a single version would be
   * wrong about one of them.
   *
   * Answers `null`, not 404, when there is no mobile release. The page draws
   * nothing in that case, which is a state it should reach quietly.
   */
  @Public()
  @Get('android')
  async android() {
    return this.downloads.getAndroid();
  }

  /**
   * What `tauri-plugin-updater` polls.
   *
   * Answers 204 when the caller is already current, which is how the plugin is
   * told there is nothing to do — an empty body or a 404 would both be read as
   * an error and surface to the user as a failed update check.
   *
   * The path carries the caller's platform and version because Tauri
   * substitutes them into the endpoint URL it was configured with; none of it
   * is trusted for anything beyond choosing which asset to describe.
   */
  @Public()
  @Get('updater/:target/:arch/:version')
  async updater(
    @Param('target') target: string,
    @Param('arch') arch: string,
    @Param('version') version: string,
    @Res() res: Response,
  ): Promise<void> {
    const update = await this.downloads.getUpdate(target, arch, version);

    if (!update) {
      res.status(204).end();
      return;
    }

    res.status(200).json(update);
  }

  /**
   * The installer itself, relayed from the release.
   *
   * Rate limited well below the default: these are ~100 MB files, and the
   * limit that suits a JSON endpoint would let a handful of clients saturate
   * the host's uplink. Ten an hour is far more than a person installing an app
   * needs and far less than a script would want.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @Get(':tag/:filename')
  async download(
    @Param('tag') tag: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const asset = await this.downloads.openAsset(tag, filename);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(asset.size));
    // The filename is one of the release's own asset names, matched exactly by
    // openAsset, so it cannot carry a quote or a newline into this header.
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asset.name}"`,
    );
    // Installers are immutable once a release is published, so a proxy or a
    // browser holding one indefinitely is correct and saves this host from
    // relaying the same 100 MB twice.
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    asset.body.on('error', (error) => {
      this.logger.error(`Streaming ${asset.name} failed: ${error.message}`);
      // Headers are already sent by the time bytes are flowing, so there is no
      // status left to change — destroying the socket is what tells the client
      // the file is incomplete rather than letting it believe a truncated
      // installer is the whole thing.
      res.destroy(error);
    });

    // A visitor who cancels mid-download leaves the upstream response open;
    // without this it would go on being read until GitHub closes it.
    res.on('close', () => {
      if (!res.writableEnded) asset.body.destroy();
    });

    asset.body.pipe(res);
  }
}
