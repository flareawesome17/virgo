import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../../database/database.service';
import type { NotifyService } from '../../notifications/notify.service';
import type { QuotaService } from '../../quota/quota.service';
import type { HlsService } from '../../storage/hls.service';
import type { MediaLinkService } from '../../storage/media-link.service';
import type { StorageService } from '../../storage/storage.service';
import type { WorkspaceActivityService } from '../../workspaces/workspace-activity.service';
import { AlbumShareController } from './album-share.controller';
import { AlbumShareService, MAX_LINK_FILES } from './album-share.service';

// The controller module imports the zip streamer, and archiver ships as ESM.
jest.mock('archiver', () => ({ ZipArchive: class {} }));

/**
 * Links to part of an album: one section, or a chosen set of files.
 *
 * What matters most is that every query reading files through a link keeps
 * to the part, or the part would be cosmetic: a client could widen it by
 * asking for the zip, a single download or a pick. These run against a fake
 * database and check the SQL each route sends; the SQL itself was proven on
 * Postgres separately.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const LINK_ID = '99999999-9999-4999-8999-999999999999';

function link(scope: 'album' | 'section' | 'files') {
  return {
    id: LINK_ID,
    album_id: 'al',
    user_id: OWNER,
    name: 'Wedding',
    description: null,
    media_kinds: ['image', 'video', 'audio'],
    purpose: 'client',
    picks_sent_at: null,
    scope,
    section_id: scope === 'section' ? 'cer' : null,
    section_name: scope === 'section' ? 'Ceremony' : null,
  };
}

function service(scope: 'album' | 'section' | 'files' = 'album', inAlbum = 2) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const queryOne = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/from album_share_links l\s+join albums a/.test(sql)) return link(scope);
    if (/select count\(\*\)::text as count from user_files/.test(sql)) return { count: String(inAlbum) };
    if (/with scoped as/.test(sql)) return { key: 'k', position: '3', size_bytes: '10' };
    if (/select key from user_files f/.test(sql)) return { key: 'k' };
    return { count: '0' };
  });
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return [];
  });
  const svc = new AlbumShareService(
    { queryOne, query } as unknown as DatabaseService,
    { mediaUrls: async (k: unknown[]) => k.map(() => null) } as unknown as StorageService,
    { displaySources: () => [], url: () => null, hlsUrl: () => null } as unknown as MediaLinkService,
    { enqueueAlbum: jest.fn(async () => undefined) } as unknown as HlsService,
    { get: (_k: string, d?: string) => d } as unknown as ConfigService,
    {} as unknown as NotifyService,
    {} as unknown as WorkspaceActivityService,
    {
      accessForAlbum: async () => 'manage',
      albumOwner: async () => OWNER,
    } as unknown as QuotaService,
  );
  return { svc, calls };
}

/** Every query that read user_files through the link. */
const fileQueries = (calls: { sql: string; params: unknown[] }[]) =>
  calls.filter((c) => /user_files/.test(c.sql) && !/from album_share_links l\s+join albums a/.test(c.sql));

describe.each([
  ['a section', 'section' as const, /section_id = \$\d+/, 'cer'],
  ['a selection', 'files' as const, /album_share_link_files lf\s+where lf\.link_id = \$\d+/, LINK_ID],
])('every route through a link to %s keeps to it', (_label, scope, clause, param) => {
  it.each([
    ['the page', (s: AlbumShareService) => s.resolve('t')],
    ['the zip', (s: AlbumShareService) => s.filesForDownload('t')],
    ['the picks zip', (s: AlbumShareService) => s.picksForDownload('t')],
    ['a single download', (s: AlbumShareService) => s.downloadTarget('t', 'file-id')],
    ['a pick', (s: AlbumShareService) => s.setPick('t', 'file-id', true)],
  ])('%s', async (_route, run) => {
    const { svc, calls } = service(scope);
    await run(svc).catch(() => undefined);
    const reads = fileQueries(calls);
    expect(reads.length).toBeGreaterThan(0);
    for (const c of reads) {
      expect(c.sql).toMatch(clause);
      expect(c.params).toContain(param);
    }
  });
});

describe('a link to a whole album', () => {
  it('adds no part condition', async () => {
    const { svc, calls } = service('album');
    await svc.filesForDownload('t');
    for (const c of fileQueries(calls)) expect(c.sql).not.toMatch(/album_share_link_files|section_id = \$/);
  });
});

describe('making a link to a selection', () => {
  it('needs at least one file, and no more than the limit', async () => {
    const { svc } = service();
    await expect(svc.createFilesLink(OWNER, 'al', [])).rejects.toBeInstanceOf(BadRequestException);
    const many = Array.from({ length: MAX_LINK_FILES + 1 }, (_, i) => `k${i}`);
    await expect(svc.createFilesLink(OWNER, 'al', many)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses files that are not the album’s', async () => {
    const { svc } = service('album', 1);
    await expect(svc.createFilesLink(OWNER, 'al', ['a', 'b'])).rejects.toThrow('not in this album');
  });

  it('names the same set the same way whatever the order', async () => {
    const hashes: unknown[] = [];
    for (const order of [['b', 'a'], ['a', 'b', 'a']]) {
      const { svc, calls } = service('album', 2);
      await svc.createFilesLink(OWNER, 'al', order).catch(() => undefined);
      hashes.push(calls.find((c) => /l\.files_hash = \$2/.test(c.sql))?.params[1]);
    }
    expect(hashes[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes[1]).toBe(hashes[0]);
  });
});

describe('the parts route', () => {
  it('takes a section or files, not both and not neither', () => {
    const controller = new AlbumShareController({} as AlbumShareService);
    expect(() => controller.createPart(OWNER, 'al', {})).toThrow(BadRequestException);
    expect(() => controller.createPart(OWNER, 'al', { sectionId: 's', keys: ['k'] })).toThrow(BadRequestException);
  });
});
