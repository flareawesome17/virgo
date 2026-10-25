import { statedDistanceKm } from './distance';

/**
 * How far away somebody is said to be, given how closely each end is placed.
 *
 * The case that started this: seven people in towns the old table did not
 * have, all at Misamis Occidental's capital, and a viewer whose device cell
 * is 0.8 km from it. Every one of them read "about 1 km". Every town has its
 * own centre now; a province stand-in is left for a town box that names none.
 */

describe('statedDistanceKm', () => {
  it('says nothing about a distance inside a province it only knows by its capital', () => {
    expect(statedDistanceKm(0.84, 'province', 'gps')).toBe(0);
    expect(statedDistanceKm(37, 'province', 'gps')).toBe(0);
    // Far enough to be another province: to the nearest ten kilometres.
    expect(statedDistanceKm(54.9, 'province', 'gps')).toBe(50);
    expect(statedDistanceKm(136, 'province', 'city')).toBe(140);
  });

  it('is "in" a town within a few kilometres of its centre, and whole kilometres beyond', () => {
    expect(statedDistanceKm(2.4, 'city', 'gps')).toBe(0);
    expect(statedDistanceKm(3.4, 'city', 'gps')).toBe(3);
    expect(statedDistanceKm(37.43, 'city', 'gps')).toBe(37);
  });

  it('keeps a device to whole kilometres: the 1.1 km cell is the privacy floor', () => {
    expect(statedDistanceKm(0, 'gps', 'gps')).toBe(0);
    expect(statedDistanceKm(0.99, 'gps', 'gps')).toBe(0);
    expect(statedDistanceKm(1.11, 'gps', 'gps')).toBe(1);
    expect(statedDistanceKm(2.46, 'gps', 'gps')).toBe(2);
    expect(statedDistanceKm(12.6, 'gps', 'city')).toBe(13);
  });

  it('is no finer than the searcher is placed, for a town or a province at the far end', () => {
    // A searcher placed at their province's capital cannot tell a town 37 km
    // from it apart from their own.
    expect(statedDistanceKm(37, 'city', 'province')).toBe(0);
    expect(statedDistanceKm(83, 'city', 'province')).toBe(80);
    expect(statedDistanceKm(2.6, 'city', 'city')).toBe(0);
  });

  it('measures a device from a province-placed searcher in its own steps, never zeroing it', () => {
    // 0 would read "under 1 km away"; the searcher's status card says their
    // distances are rough instead.
    expect(statedDistanceKm(14.2, 'gps', 'province')).toBe(14);
  });

  it('treats a typed city as the exact centre it is', () => {
    expect(statedDistanceKm(2.4, 'gps', null)).toBe(2);
    expect(statedDistanceKm(2.4, 'city', null)).toBe(0);
    expect(statedDistanceKm(20, 'province', null)).toBe(0);
  });
});
