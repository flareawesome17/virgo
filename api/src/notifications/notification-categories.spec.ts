import {
  allows,
  CATEGORY_OF_TOPIC,
  isNotificationCategory,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  presentSettings,
  topicsIn,
  usesChannel,
} from './notification-categories';

describe('notification categories', () => {
  it('gives every category at least one topic, and no topic two', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      expect(topicsIn(category).length).toBeGreaterThan(0);
    }
    const counted = NOTIFICATION_CATEGORIES.flatMap((c) => topicsIn(c));
    expect(counted.sort()).toEqual(Object.keys(CATEGORY_OF_TOPIC).sort());
  });

  it('recognises categories and nothing else', () => {
    expect(isNotificationCategory('bookings')).toBe(true);
    expect(isNotificationCategory('booking')).toBe(false);
    expect(isNotificationCategory(undefined)).toBe(false);
  });

  it('offers email only for kinds that are ever emailed', () => {
    const emailed = NOTIFICATION_CATEGORIES.filter((c) => usesChannel(c, 'email'));
    expect(emailed.sort()).toEqual(['hire', 'jobs', 'network', 'schedule']);
  });

  it('never offers desktop alerts for announcements, which have no live frame', () => {
    expect(usesChannel('updates', 'desktop')).toBe(false);
    expect(usesChannel('bookings', 'desktop')).toBe(true);
  });
});

describe('allows', () => {
  it('lets everything through when nothing is stored', () => {
    for (const category of NOTIFICATION_CATEGORIES) {
      for (const channel of NOTIFICATION_CHANNELS) {
        expect(allows(undefined, category, channel)).toBe(true);
        expect(allows({}, category, channel)).toBe(true);
      }
    }
  });

  it('honours a stored switch', () => {
    const stored = { jobs: { email: false, push: true } };
    expect(allows(stored, 'jobs', 'email')).toBe(false);
    expect(allows(stored, 'jobs', 'push')).toBe(true);
    expect(allows(stored, 'jobs', 'desktop')).toBe(true);
  });

  it('keeps support on whatever is stored', () => {
    expect(allows({ support: { push: false } }, 'support', 'push')).toBe(true);
  });

  it('ignores values that are not booleans', () => {
    expect(allows({ jobs: { push: 'no' } }, 'jobs', 'push')).toBe(true);
    expect(allows({ jobs: null }, 'jobs', 'push')).toBe(true);
    expect(allows('garbage', 'jobs', 'push')).toBe(true);
  });
});

describe('presentSettings', () => {
  it('lists every category in order, null where a channel is never used', () => {
    const rows = presentSettings({ bookings: { push: false } });
    expect(rows.map((r) => r.category)).toEqual([...NOTIFICATION_CATEGORIES]);
    expect(rows[0]).toEqual({
      category: 'bookings',
      push: false,
      email: null,
      desktop: true,
      locked: false,
    });
    expect(rows.find((r) => r.category === 'updates')).toEqual({
      category: 'updates',
      push: true,
      email: null,
      desktop: null,
      locked: false,
    });
    expect(rows.find((r) => r.category === 'support')?.locked).toBe(true);
  });
});
