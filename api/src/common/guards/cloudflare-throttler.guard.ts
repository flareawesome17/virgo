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
    /**
     * An authenticated request is bucketed by account, not by address.
     *
     * IP is the only thing available for a signed-out caller, but it is the
     * wrong key once we know who is asking. Mobile data in the Philippines is
     * overwhelmingly CGNAT and a studio shares one office line, so an IP bucket
     * means colleagues consume each other's allowance — with hire enquiries at
     * 5/hour, two photographers on the same network lock each other out of a
     * feature neither has abused.
     *
     * It is also the better limit for the abuse actually worth stopping. The
     * concern is one account spraying the directory, and that is attributable
     * to an account; a determined sprayer rotates IPs anyway, while creating
     * accounts to dodge this costs a fresh signup (itself IP-limited) and an
     * email verification.
     */
    const userId = (req?.user as { id?: string } | undefined)?.id;
    if (typeof userId === 'string' && userId) return `user:${userId}`;

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
