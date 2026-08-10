import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';

/**
 * Counting visits without becoming a tracking company.
 *
 * Built here rather than bought because the obvious hosted options could not
 * be pointed at this product safely: client delivery lives at
 * `client.virgo.ph/s/<token>` where the token IS the credential, so any tool
 * that records page URLs would have shipped live gallery passwords to a third
 * party and kept them in someone else's logs.
 *
 * Two rules make this safe to keep:
 *
 *  - The path is normalised before it is stored, and a share link collapses to
 *    '/s'. The token never reaches the database.
 *  - No IP address and no user agent is retained. `visitor_hash` mixes them
 *    with a salt that changes daily, so the same person is countable within a
 *    day and uncorrelatable across days. There is nothing here to work
 *    backwards from to a person.
 */
@Injectable()
export class VisitsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Collapses a path to something countable and safe.
   *
   * Anything carrying a secret or an identifier becomes its prefix: '/s' for
   * client galleries, '/@' for public profiles, '/jobs/:slug' for a posting.
   * The point of this table is "how many people looked at pricing", not a
   * per-visitor history.
   */
  normalisePath(raw: string): string {
    // Query strings can carry tokens too, and never carry anything worth
    // counting.
    let path = (raw || '/').split('?')[0].split('#')[0];
    if (!path.startsWith('/')) path = `/${path}`;
    path = path.replace(/\/+$/, '') || '/';

    if (path === '/s' || path.startsWith('/s/')) return '/s';
    if (path.startsWith('/@')) return '/@';
    if (path.startsWith('/jobs/')) return '/jobs/:slug';
    if (path.startsWith('/albums/')) return '/albums/:id';
    if (path.startsWith('/workspaces/')) return '/workspaces/:id';
    if (path.startsWith('/chat/')) return '/chat/:id';

    // A path nobody routes is not worth a row of its own; bucketing keeps a
    // scanner from filling the table with junk.
    if (path.length > 60) return '/other';
    return path;
  }

  /** Host only — a full referrer URL can carry the sending site's own tokens. */
  private referrerHost(referrer?: string): string | null {
    if (!referrer) return null;
    try {
      const host = new URL(referrer).hostname.toLowerCase();
      return host.endsWith('virgo.ph') ? null : host.slice(0, 120);
    } catch {
      return null;
    }
  }

  /**
   * A visitor identity that expires on its own.
   *
   * The salt includes the date, so today's hash for a given browser is
   * unrelated to tomorrow's. That is what makes this a counter rather than a
   * profile — there is no stable identifier to join on.
   */
  private visitorHash(ip: string, userAgent: string): string {
    const day = new Date().toISOString().slice(0, 10);
    const salt = this.config.get<string>('ADMIN_JWT_SECRET') ?? 'virgo';
    return createHash('sha256')
      .update(`${day}:${salt}:${ip}:${userAgent}`)
      .digest('hex')
      .slice(0, 32);
  }

  async record(input: {
    host: string;
    path: string;
    referrer?: string;
    ip: string;
    userAgent: string;
  }): Promise<void> {
    await this.db.query(
      `insert into site_visits (host, path, referrer_host, visitor_hash)
       values ($1, $2, $3, $4)`,
      [
        (input.host || 'unknown').toLowerCase().slice(0, 120),
        this.normalisePath(input.path),
        this.referrerHost(input.referrer),
        this.visitorHash(input.ip, input.userAgent),
      ],
    );
  }

  /** Totals for the overview: views and distinct visitors over a window. */
  async summary(days = 30) {
    const totals = await this.db.queryOne<{
      views: string;
      visitors: string;
    }>(
      `select count(*)::text as views,
              count(distinct visitor_hash)::text as visitors
         from site_visits
        where created_at > now() - ($1 || ' days')::interval`,
      [String(days)],
    );

    const daily = await this.db.query(
      `select date_trunc('day', created_at)::date::text as day,
              count(*)::int as views,
              count(distinct visitor_hash)::int as visitors
         from site_visits
        where created_at > now() - ($1 || ' days')::interval
        group by 1 order by 1`,
      [String(days)],
    );

    const topPaths = await this.db.query(
      `select host, path, count(*)::int as views
         from site_visits
        where created_at > now() - ($1 || ' days')::interval
        group by 1, 2 order by 3 desc limit 12`,
      [String(days)],
    );

    const referrers = await this.db.query(
      `select referrer_host as host, count(*)::int as views
         from site_visits
        where created_at > now() - ($1 || ' days')::interval
          and referrer_host is not null
        group by 1 order by 2 desc limit 10`,
      [String(days)],
    );

    return {
      views: Number(totals?.views ?? 0),
      visitors: Number(totals?.visitors ?? 0),
      daily,
      topPaths,
      referrers,
    };
  }
}
