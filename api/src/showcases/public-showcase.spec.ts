import { INestApplication, NotFoundException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import type { DatabaseService } from '../database/database.service';
import type { FilmPosterService } from '../storage/film-poster.service';
import type { HlsService } from '../storage/hls.service';
import type { MediaLinkService } from '../storage/media-link.service';
import type { StorageService } from '../storage/storage.service';
import type { ThumbnailsService } from '../storage/thumbnails.service';
import type { ShowcaseMediaService } from './showcase-media.service';
import { PublicShowcasesController } from './showcases.controller';
import { ShowcasesService, type PublicShowcase } from './showcases.service';

/**
 * GET /public/showcases/:id — the read behind a shared link, with no account.
 *
 * Which posts it answers for is one SQL statement, checked against a real
 * PostgreSQL 18 with every migration applied: private (never posted or taken
 * down), hidden by the console, connections-only and a suspended or paused
 * maker all read as nothing. Here: what it hands back, that it never names an
 * account, and that every refusal is the same 404 — over HTTP, through the
 * app's real deny-by-default guard.
 */

const ID = '11111111-1111-4111-8111-111111111111';
const MAKER = '99999999-9999-4999-8999-999999999999';

function service(row: Record<string, unknown> | null, pieces: Record<string, unknown>[]) {
  const db = {
    queryOne: jest.fn(async () => row),
    query: jest.fn(async () => pieces),
  } as unknown as DatabaseService;
  const showcases = new ShowcasesService(
    db,
    { mediaUrl: jest.fn(async (key: string | null) => (key ? `cdn:${key}` : null)) } as unknown as StorageService,
    {
      displaySources: jest.fn((key: string, widths: number[] | null) =>
        (widths ?? []).map((width) => ({ width, url: `vol:${key}-${width}` })),
      ),
      hlsUrl: jest.fn(() => null),
      url: jest.fn(() => null),
    } as unknown as MediaLinkService,
    {} as ThumbnailsService,
    {} as HlsService,
    {} as ShowcaseMediaService,
    {} as FilmPosterService,
  );
  return { showcases, db };
}

const showcaseRow = {
  id: ID,
  user_id: MAKER,
  title: 'Golden hour',
  caption: 'Shot on the last day.',
  craft_note: 'Backlit, 85mm.',
  craft_tags: ['85mm'],
  category: 'portrait',
  location: 'Cebu',
  visibility: 'public',
  allow_downloads: false,
  allow_comments: true,
  show_hire: true,
  published_at: new Date('2026-10-01T08:00:00Z'),
  unpublished_at: null,
  hidden_at: null,
  kept_count: 3,
  like_count: 7,
  comment_count: 2,
  created_at: new Date('2026-09-30T08:00:00Z'),
  display_name: 'Mika Reyes',
  avatar_url: 'https://cdn.virgo.ph/avatars/mika.webp',
  user_title: 'Photographer',
  handle: 'mika',
};

const photoPiece = {
  item_id: 'item-1',
  showcase_id: ID,
  user_id: MAKER,
  file_key: `users/${MAKER}/albums/2026/10/a.jpg`,
  copied_at: null,
  own_kind: null,
  own_thumb_key: null,
  own_poster_key: null,
  own_video_key: null,
  own_widths: null,
  own_width_px: null,
  own_height_px: null,
  own_duration_ms: null,
  content_type: 'image/jpeg',
  thumb_key: `users/${MAKER}/albums/2026/10/a-thumb.webp`,
  poster_key: null,
  proxy_key: null,
  hls_prefix: null,
  duration_ms: null,
  display_widths: [1024, 2048],
  width_px: 3000,
  height_px: 2000,
};

describe('ShowcasesService.publicOne', () => {
  it('hands back the post as a stranger sees it, and no account id', async () => {
    const { showcases } = service(showcaseRow, [photoPiece]);

    const out = await showcases.publicOne(ID);

    expect(out).toEqual<PublicShowcase>({
      id: ID,
      title: 'Golden hour',
      caption: 'Shot on the last day.',
      location: 'Cebu',
      publishedAt: '2026-10-01T08:00:00.000Z',
      likeCount: 7,
      maker: {
        displayName: 'Mika Reyes',
        handle: 'mika',
        avatarUrl: 'https://cdn.virgo.ph/avatars/mika.webp',
        title: 'Photographer',
      },
      pieces: [
        {
          fileKey: photoPiece.file_key,
          kind: 'image',
          url: `cdn:${photoPiece.thumb_key}`,
          displaySources: [
            { width: 1024, url: `vol:${photoPiece.file_key}-1024` },
            { width: 2048, url: `vol:${photoPiece.file_key}-2048` },
          ],
          width: 3000,
          height: 2000,
        },
      ],
    });
    // Nothing that names the maker's account, or what the owner's editor sees.
    expect(JSON.stringify({ ...out, pieces: [] })).not.toContain(MAKER);
    expect(out.pieces[0]).not.toHaveProperty('publiclyShown');
    expect(out).not.toHaveProperty('craftNote');
  });

  it('asks every gate in the one statement, about the post alone', async () => {
    const { showcases, db } = service(showcaseRow, [photoPiece]);
    await showcases.publicOne(ID);

    const [sql, params] = (db.queryOne as jest.Mock).mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([ID]);
    for (const gate of [
      "s.visibility = 'public'",
      's.published_at is not null',
      's.unpublished_at is null',
      's.hidden_at is null',
      'u.suspended_at is null',
      'u.disabled_until is null or u.disabled_until <= now()',
      // A handle only once the profile is published.
      'case when u.public_profile then u.handle end as handle',
    ]) {
      expect(sql).toContain(gate);
    }
  });

  it('is not found when the statement finds nothing', async () => {
    const { showcases, db } = service(null, []);
    await expect(showcases.publicOne(ID)).rejects.toThrow(
      new NotFoundException('Showcase not found'),
    );
    // No pieces read for a post that is not there.
    expect(db.query).not.toHaveBeenCalled();
  });

  it('is not found, the same way, when no piece has anything to show', async () => {
    const { showcases } = service(showcaseRow, [{ ...photoPiece, thumb_key: null }]);
    await expect(showcases.publicOne(ID)).rejects.toThrow(
      new NotFoundException('Showcase not found'),
    );
  });

  it('names nobody by handle whose profile is not published', async () => {
    const { showcases } = service({ ...showcaseRow, handle: null }, [photoPiece]);
    expect((await showcases.publicOne(ID)).maker.handle).toBeNull();
  });
});

describe('GET /public/showcases/:id', () => {
  let app: INestApplication;
  const publicOne = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicShowcasesController],
      providers: [
        { provide: ShowcasesService, useValue: { publicOne } },
        // The app's own deny-by-default guard: this route has to opt out of it.
        { provide: APP_GUARD, useClass: JwtAuthGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => publicOne.mockReset());

  it('answers with no session, and lets nothing keep a copy', async () => {
    publicOne.mockResolvedValueOnce({ id: ID, pieces: [] });

    const res = await request(app.getHttpServer()).get(`/public/showcases/${ID}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: ID, pieces: [] });
    expect(res.headers['cache-control']).toBe('no-store');
    expect(publicOne).toHaveBeenCalledWith(ID);
  });

  it('gives a post it will not show and an id that is not one the same 404', async () => {
    publicOne.mockRejectedValueOnce(new NotFoundException('Showcase not found'));
    const hidden = await request(app.getHttpServer()).get(`/public/showcases/${ID}`);
    const garbage = await request(app.getHttpServer()).get('/public/showcases/not-an-id');

    expect(hidden.status).toBe(404);
    expect(garbage.status).toBe(404);
    expect(garbage.body).toEqual(hidden.body);
    expect(hidden.body.message).toBe('Showcase not found');
    // The id is checked before anything is asked.
    expect(publicOne).toHaveBeenCalledTimes(1);
  });

  it('is public and rate-limited like the other reads', () => {
    const handler = PublicShowcasesController.prototype.one;
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
  });
});
