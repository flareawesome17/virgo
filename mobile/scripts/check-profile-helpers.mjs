/**
 * Checks the profile helpers both clients share, without a device.
 *
 *   node --experimental-strip-types --test mobile/scripts/check-profile-helpers.mjs
 *
 * Neither app has a test runner, and the cover crop is the kind of arithmetic
 * that looks right in review and is not: the first draft of the drag mapping
 * cropped every cover at the top, whatever the person had chosen, and one of
 * its written expectations was off by a pixel. So the numbers are asserted
 * here, against the same file the apps import.
 *
 * profile-view.ts imports nothing but types, which is what lets Node load it
 * by stripping them — keep it that way, or this stops running.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  COVER_ASPECT,
  coverCropRect,
  coverFocusFromOffset,
  mutualConnectionsLine,
  profileBanner,
  profileStatsLine,
  withProfileDefaults,
} from '../src/api/profile-view.ts';

test('covers are 2:1', () => {
  assert.equal(COVER_ASPECT, 2);
});

test('coverCropRect takes the full width of a taller photo, placed by focusY', () => {
  assert.deepEqual(coverCropRect(4000, 3000, 0.5), { originX: 0, originY: 500, width: 4000, height: 2000 });
  assert.equal(coverCropRect(4000, 3000, 0).originY, 0);
  assert.equal(coverCropRect(4000, 3000, 1).originY, 1000);
  assert.deepEqual(coverCropRect(3024, 4032, 0.5), { originX: 0, originY: 1260, width: 3024, height: 1512 });
});

test('coverCropRect trims the sides of a photo wider than the cover', () => {
  assert.deepEqual(coverCropRect(6000, 1000), { originX: 2000, originY: 0, width: 2000, height: 1000 });
});

test('coverCropRect never leaves the photo, whatever focusY says', () => {
  for (const focus of [-1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
    const rect = coverCropRect(4000, 3000, focus);
    assert.ok(rect.originY >= 0 && rect.originY + rect.height <= 3000, `focus ${focus}`);
  }
});

test('coverFocusFromOffset reads the drag the right way up', () => {
  assert.equal(coverFocusFromOffset(0, 400), 0);
  assert.equal(coverFocusFromOffset(-400, 400), 1);
  assert.equal(coverFocusFromOffset(-200, 400), 0.5);
  // Nothing to drag: the middle, not a division by zero.
  assert.equal(coverFocusFromOffset(-10, 0), 0.5);
});

/** A GET /profiles/:handle answer from the API the 1.3.4 app shipped against. */
const OLD_PAYLOAD = {
  handle: 'ana',
  displayName: 'Ana Reyes',
  avatarUrl: null,
  title: null,
  bio: null,
  location: null,
  website: null,
  roles: ['Photographer'],
  memberSince: 2025,
  portfolio: [{ id: 'p1', kind: 'image', url: 'https://b2.example/p1.webp', caption: null }],
};

test('withProfileDefaults settles a payload that has none of the new keys', () => {
  const view = withProfileDefaults(OLD_PAYLOAD);
  assert.equal(view.coverUrl, null);
  assert.equal(view.studioName, null);
  assert.equal(view.availableForBookings, false);
  assert.equal(view.stats, null);
  assert.equal(view.mutualConnections, 0);
  assert.equal(view.viewer, null);
  assert.deepEqual(view.portfolio, OLD_PAYLOAD.portfolio);
});

test('withProfileDefaults keeps what a current API sends', () => {
  const view = withProfileDefaults({
    ...OLD_PAYLOAD,
    coverUrl: 'https://cdn.example/c.webp',
    studioName: '  Nailify Studio ',
    availableForBookings: true,
    stats: { connections: 12, jobsDone: 4 },
    mutualConnections: 3,
    viewer: { isSelf: false, connection: 'pending_in', friendId: 'f1' },
  });
  assert.equal(view.coverUrl, 'https://cdn.example/c.webp');
  assert.equal(view.studioName, 'Nailify Studio');
  assert.equal(view.availableForBookings, true);
  assert.deepEqual(view.stats, { connections: 12, jobsDone: 4 });
  assert.equal(view.mutualConnections, 3);
  assert.deepEqual(view.viewer, { isSelf: false, connection: 'pending_in', friendId: 'f1' });
});

test('withProfileDefaults drops a viewer block it does not understand', () => {
  // Offering Connect on a state this client has never heard of could send a
  // request to somebody the viewer is already connected to.
  const view = withProfileDefaults({
    ...OLD_PAYLOAD,
    viewer: { isSelf: false, connection: 'blocked', friendId: null },
  });
  assert.equal(view.viewer, null);
});

test('profileStatsLine says one and many properly', () => {
  assert.equal(profileStatsLine({ connections: 1, jobsDone: 1 }), '1 connection · 1 job done');
  assert.equal(profileStatsLine({ connections: 12, jobsDone: 4 }), '12 connections · 4 jobs done');
  assert.equal(profileStatsLine({ connections: 0, jobsDone: 0 }), '0 connections · 0 jobs done');
});

test('mutualConnectionsLine is silent at zero', () => {
  assert.equal(mutualConnectionsLine(0), null);
  assert.equal(mutualConnectionsLine(1), '1 mutual connection');
  assert.equal(mutualConnectionsLine(3), '3 mutual connections');
});

test('profileBanner prefers the cover, then their own work, blurred', () => {
  const image = { id: 'i', kind: 'image', url: 'https://b2.example/i.webp', caption: null };
  const album = {
    id: 'a', kind: 'album', name: 'Wedding', caption: null,
    coverUrl: 'https://b2.example/a.webp', itemCount: 3, url: 'https://virgo.ph/s/x',
  };

  assert.deepEqual(
    profileBanner({ coverUrl: 'https://cdn.example/c.webp', portfolio: [album, image] }),
    { url: 'https://cdn.example/c.webp', blurred: false },
  );
  // The first photo wins over a gallery that comes before it.
  assert.deepEqual(profileBanner({ coverUrl: null, portfolio: [album, image] }), {
    url: 'https://b2.example/i.webp',
    blurred: true,
  });
  assert.deepEqual(profileBanner({ portfolio: [album] }), {
    url: 'https://b2.example/a.webp',
    blurred: true,
  });
  assert.equal(profileBanner({ coverUrl: null, portfolio: [] }), null);
});
