import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limit tracker that survives being behind a proxy.
 *
 * WHY THIS EXISTS
 * ThrottlerGuard buckets requests by `req.ip`. Behind a Cloudflare Tunnel every
 * request arrives from the local cloudflared daemon, so `req.ip` is the same
 * value for every user on earth — the entire user base would share one bucket.
 * With register capped at 5/min, the sixth signup from *anyone* would start
 * failing, and one noisy client could lock everybody out.
 *
 * `CF-Connecting-IP` is set by Cloudflare on every proxied request and
 * overwrites whatever the client sent, so unlike `X-Forwarded-For` it cannot be
 * spoofed from outside. That only holds while Cloudflare is the sole path in —
 * do not publish the origin port, or someone reaching it directly could forge
 * this header and evade the limiter.
 */
@Injectable()
export class CloudflareThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const headers = req?.headers as
      | Record<string, string | string[] | undefined>
      | undefined;

    const cfConnectingIp = headers?.['cf-connecting-ip'];
    if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
      return cfConnectingIp.trim();
    }

    // Direct (non-tunnelled) access, e.g. local development.
    const ip = req?.ip;
    return typeof ip === 'string' && ip ? ip : 'unknown';
  }
}
