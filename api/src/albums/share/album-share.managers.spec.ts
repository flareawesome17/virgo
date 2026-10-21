import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { DatabaseService } from '../../database/database.service';
import type { NotifyService } from '../../notifications/notify.service';
import type { QuotaService, ResolvedAccess } from '../../quota/quota.service';
import type { HlsService } from '../../storage/hls.service';
import type { MediaLinkService } from '../../storage/media-link.service';
import type { StorageService } from '../../storage/storage.service';
import type { WorkspaceActivityService } from '../../workspaces/workspace-activity.service';
import { AlbumShareService } from './album-share.service';

/**
 * Who may make, see and turn off an album's client link.
 *
 * The album's owner, and any workspace member granted 'manage' on that album:
 * they arrange and deliver it, and the link is how it is delivered. Whoever
 * makes it, the link is the owner's, because the gallery reads the owner's
 * files through it and downloads spend the owner's allowance.
 */

const OWNER = '11111111-1111-4111-8111-111111111111';
const MANAGER = '22222222-2222-4222-8222-222222222222';
const UPLOADER = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';
const ALBUM = 'album-1';

const ACCESS: Record<string, ResolvedAccess> = {
  [OWNER]: 'owner',
  [MANAGER]: 'manage',
  [UPLOADER]: 'upload',
  [STRANGER]: null,
};

function service(existing: Record<string, unknown> | null = null) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const queryOne = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    if (/^\s*select \* from album_share_links/.test(sql)) return existing;
    if (/insert into album_share_links/.test(sql)) {
      return { id: 'link-1', created_at: new Date('2026-10-21T00:00:00Z') };
    }
    return null;
  });
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    calls.push({ sql, params });
    return /update album_share_links\s+set revoked_at/.test(sql) ? [{ id: 'link-1' }] : [];
  });
  const quota = {
    accessForAlbum: jest.fn(async (userId: string) => ACCESS[userId] ?? null),
    albumOwner: jest.fn(async () => OWNER),
  };
  const svc = new AlbumShareService(
    { queryOne, query } as unknown as DatabaseService,
    {} as unknown as StorageService,
    {} as unknown as MediaLinkService,
    { enqueueAlbum: jest.fn(async () => undefined) } as unknown as HlsService,
    { get: (_k: string, fallback?: string) => fallback } as unknown as ConfigService,
    {} as unknown as NotifyService,
    {} as unknown as WorkspaceActivityService,
    quota as unknown as QuotaService,
  );
  return { svc, calls };
}

const live = {
  id: 'link-1',
  album_id: ALBUM,
  user_id: OWNER,
  token: 'tok',
  media_kinds: ['image', 'video', 'audio'],
  purpose: 'client',
  picks_sent_at: null,
  created_at: new Date('2026-10-20T00:00:00Z'),
};

describe('a client link in a shared workspace', () => {
  it('can be made by a member who manages the album, and belongs to the owner', async () => {
    const { svc, calls } = service();
    const link = await svc.createOrGet(MANAGER, ALBUM);
    const insert = calls.find((c) => /insert into album_share_links/.test(c.sql))!;
    // [album, user_id, token, kinds, purpose]: the owner's, not the manager's.
    expect(insert.params[0]).toBe(ALBUM);
    expect(insert.params[1]).toBe(OWNER);
    expect(link.url).toMatch(/\/s\/.+/);
  });

  it('hands a manager the link already sent, rather than a new one', async () => {
    const { svc, calls } = service(live);
    const link = await svc.createOrGet(MANAGER, ALBUM);
    expect(link.token).toBe('tok');
    expect(calls.some((c) => /insert into album_share_links/.test(c.sql))).toBe(false);
  });

  it('can be seen and turned off by a manager', async () => {
    const { svc, calls } = service(live);
    await expect(svc.find(MANAGER, ALBUM)).resolves.toMatchObject({ token: 'tok' });
    await expect(svc.revoke(MANAGER, ALBUM)).resolves.toEqual({ revoked: true });
    const update = calls.find((c) => /set revoked_at/.test(c.sql))!;
    // By album and purpose: a filter on the caller would never match the owner's link.
    expect(update.params).toEqual([ALBUM, 'client']);
    expect(update.sql).not.toMatch(/user_id/);
  });

  it('is still the owner’s to make', async () => {
    const { svc, calls } = service();
    await svc.createOrGet(OWNER, ALBUM);
    expect(calls.find((c) => /insert into album_share_links/.test(c.sql))!.params[1]).toBe(OWNER);
  });

  it('is refused, with the reason, to a member who can only upload', async () => {
    const { svc } = service(live);
    await expect(svc.createOrGet(UPLOADER, ALBUM)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.find(UPLOADER, ALBUM)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.revoke(UPLOADER, ALBUM)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('looks like no album at all to someone with no access', async () => {
    const { svc } = service(live);
    await expect(svc.createOrGet(STRANGER, ALBUM)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.find(STRANGER, ALBUM)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let a manager put the album on the owner’s public profile', async () => {
    const { svc } = service();
    await expect(svc.createOrGet(MANAGER, ALBUM, ['image'], 'portfolio')).rejects.toThrow(
      "Only the album's owner can show it on their profile",
    );
    await expect(svc.revoke(MANAGER, ALBUM, 'portfolio')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
