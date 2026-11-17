import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbumShareService } from '../albums/share/album-share.service';
import { DatabaseService } from '../database/database.service';
import { blockedBetween } from '../safety/block-sql';
import { ShowcasesService } from '../showcases/showcases.service';

/**
 * What a chat draws under a Virgo link.
 *
 * Only Virgo's own pages, and only from the database: nothing here fetches
 * the address it is given, so a pasted link cannot make the server call out
 * anywhere. Anything that is not one of our pages answers 404 and the app
 * shows the plain link.
 */
export type LinkPreview =
  | {
      kind: 'album';
      url: string;
      title: string;
      /** 'section' or 'files' for a link to part of an album. */
      part: 'album' | 'section' | 'files';
      total: number;
      counts: { image: number; video: number; audio: number };
      /** Up to four small images, signed for a day. */
      thumbs: string[];
    }
  | {
      kind: 'profile';
      url: string;
      title: string;
      subtitle: string | null;
      imageUrl: string | null;
    }
  | {
      kind: 'post';
      url: string;
      title: string;
      subtitle: string;
      imageUrl: string | null;
    }
  | {
      kind: 'job';
      url: string;
      title: string;
      subtitle: string | null;
      date: string | null;
    }
  | {
      /** A package statement. Its figures stay on the page, not in a chat. */
      kind: 'statement';
      url: string;
      title: string;
    };

/** The hosts a Virgo page is served from, as well as any configured ones. */
const KNOWN_HOSTS = ['virgo.ph', 'www.virgo.ph', 'web.virgo.ph', 'client.virgo.ph'];

/** A share or statement token: base64url. */
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class LinkPreviewsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly shares: AlbumShareService,
    private readonly showcases: ShowcasesService,
  ) {}

  private hosts(): Set<string> {
    const hosts = new Set(KNOWN_HOSTS);
    for (const key of ['CLIENT_DELIVERY_URL', 'PUBLIC_APP_URL', 'PUBLIC_API_URL']) {
      const value = this.config.get<string>(key);
      if (!value) continue;
      try {
        hosts.add(new URL(value).host.toLowerCase());
      } catch {
        // A malformed setting adds nothing.
      }
    }
    return hosts;
  }

  async preview(viewerId: string, raw: string): Promise<LinkPreview> {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      throw new NotFoundException('Not a Virgo link');
    }
    if (!this.hosts().has(url.host.toLowerCase())) throw new NotFoundException('Not a Virgo link');

    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const href = url.toString();

    if (parts[0] === 's' && parts[1] === 'statement' && parts[2] && TOKEN.test(parts[2])) {
      return { kind: 'statement', url: href, title: 'Package statement' };
    }

    if (parts[0] === 's' && parts[1] && TOKEN.test(parts[1]) && parts.length === 2) {
      const album = await this.shares.preview(parts[1]).catch(() => null);
      if (!album) throw new NotFoundException('This link is no longer available');
      return { kind: 'album', url: href, ...album };
    }

    if (parts[0] === 'u' && parts[1] && parts.length === 2) {
      const row = await this.db.queryOne<{
        display_name: string | null;
        title: string | null;
        location: string | null;
        avatar_url: string | null;
      }>(
        `select u.display_name, u.title, u.location, u.avatar_url
           from users u
          where lower(u.handle) = lower($1)
            and u.public_profile = true
            and u.suspended_at is null
            and (u.disabled_until is null or u.disabled_until <= now())
            and not ${blockedBetween('$2', 'u.id')}`,
        [parts[1], viewerId],
      );
      if (!row) throw new NotFoundException('Profile not found');
      const subtitle = [row.title, row.location].filter((s) => s && s.trim()).join(' · ');
      return {
        kind: 'profile',
        url: href,
        title: row.display_name?.trim() || parts[1],
        subtitle: subtitle || null,
        imageUrl: row.avatar_url,
      };
    }

    if (parts[0] === 'p' && parts[1] && UUID.test(parts[1]) && parts.length === 2) {
      const post = await this.showcases.publicOne(parts[1]).catch(() => null);
      if (!post) throw new NotFoundException('Post not found');
      return {
        kind: 'post',
        url: href,
        title: post.title?.trim() || 'A post',
        subtitle: post.maker.displayName,
        imageUrl: post.pieces[0]?.url ?? null,
      };
    }

    if (parts[0] === 'jobs' && parts[1] && parts.length === 2) {
      const row = await this.db.queryOne<{
        title: string;
        event_date: string | null;
        location: string | null;
        roles_wanted: string[];
      }>(
        `select p.title, to_char(p.event_date, 'YYYY-MM-DD') as event_date,
                p.location, p.roles_wanted
           from hiring_posts p
           join users u on u.id = p.user_id
          where p.slug = $1
            and p.hidden_at is null
            and u.suspended_at is null
            and not ${blockedBetween('$2', 'p.user_id')}`,
        [parts[1], viewerId],
      );
      if (!row) throw new NotFoundException('Job not found');
      const subtitle = [row.location, row.roles_wanted.join(', ')]
        .filter((s) => s && s.trim())
        .join(' · ');
      return {
        kind: 'job',
        url: href,
        title: row.title,
        subtitle: subtitle || null,
        date: row.event_date,
      };
    }

    throw new NotFoundException('Not a Virgo link');
  }
}
