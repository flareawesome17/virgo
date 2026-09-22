/**
 * Query key factory.
 *
 * Centralised so invalidation is reliable: `queryKeys.workspaces.all` is a
 * prefix of every workspace key, so invalidating it catches lists and details
 * alike. Hand-written keys scattered across screens drift, and a mutation then
 * silently fails to refresh a list that used a slightly different key.
 */
export const queryKeys = {
  /** The release the API reports. One key; there is only one. */
  version: {
    current: ['version'] as const,
  },
  auth: {
    all: ['auth'] as const,
    session: ['auth', 'session'] as const,
    user: ['auth', 'user'] as const,
  },
  workspaces: {
    all: ['workspaces'] as const,
    list: (params?: unknown) => ['workspaces', 'list', params ?? {}] as const,
    detail: (id: string) => ['workspaces', 'detail', id] as const,
    members: (id: string) => ['workspaces', 'members', id] as const,
    activity: (id: string) => ['workspaces', 'activity', id] as const,
  },
  albums: {
    all: ['albums'] as const,
    list: (params?: unknown) => ['albums', 'list', params ?? {}] as const,
    detail: (id: string) => ['albums', 'detail', id] as const,
    sections: (id: string) => ['albums', 'sections', id] as const,
  },
  scheduleEvents: {
    all: ['schedule-events'] as const,
    list: (params?: unknown) =>
      ['schedule-events', 'list', params ?? {}] as const,
    detail: (id: string) => ['schedule-events', 'detail', id] as const,
    /** Invitations addressed to the signed-in user. */
    invitations: ['schedule-events', 'invitations'] as const,
    attendees: (id: string) => ['schedule-events', 'attendees', id] as const,
  },
  collaborators: {
    all: ['collaborators'] as const,
    list: (params?: unknown) =>
      ['collaborators', 'list', params ?? {}] as const,
    detail: (id: string) => ['collaborators', 'detail', id] as const,
  },
  reminders: {
    all: ['reminders'] as const,
    list: (params?: unknown) => ['reminders', 'list', params ?? {}] as const,
    detail: (id: string) => ['reminders', 'detail', id] as const,
  },
  friends: {
    all: ['friends'] as const,
    list: (params?: unknown) => ['friends', 'list', params ?? {}] as const,
    detail: (id: string) => ['friends', 'detail', id] as const,
    presence: ['friends', 'presence'] as const,
    /** Under `all`, so a block or a request refreshes the relationship shown. */
    search: (q: string) => ['friends', 'search', q] as const,
  },
  /** People you have blocked. */
  blocks: {
    all: ['blocks'] as const,
    list: ['blocks', 'list'] as const,
  },
  /**
   * The prefixes of keys that live next to their hooks — chatKeys in useChat,
   * nearbyKeys in useNearby — for invalidating the lot from elsewhere.
   */
  chat: {
    all: ['chat'] as const,
  },
  discover: {
    all: ['discover'] as const,
  },
  /**
   * The same arrays the profile screens wrote by hand, so a cache the app
   * already persisted still matches.
   */
  publicProfiles: {
    all: ['public-profile'] as const,
    detail: (handle: string) => ['public-profile', handle] as const,
  },
  hire: {
    all: ['hire'] as const,
    list: () => ['hire', 'list'] as const,
  },
  jobs: {
    all: ['jobs'] as const,
    list: (params?: unknown) => ['jobs', 'list', params ?? {}] as const,
    detail: (slug: string) => ['jobs', 'detail', slug] as const,
    mine: ['jobs', 'mine'] as const,
    applicants: (postId: string) => ['jobs', 'applicants', postId] as const,
    myApplications: ['jobs', 'my-applications'] as const,
    unseen: ['jobs', 'unseen'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    list: (limit?: number) => ['notifications', 'list', limit ?? 30] as const,
    /** The filtered, paged list on the notifications page and screen. */
    feed: (filter: { unread?: boolean; category?: string | null } = {}) =>
      [
        'notifications',
        'feed',
        filter.unread ? 'unread' : 'all',
        filter.category ?? 'every',
      ] as const,
    detail: (id: string) => ['notifications', 'detail', id] as const,
    unread: ['notifications', 'unread'] as const,
    /**
     * Outside `all` on purpose: marking something read invalidates `all`, and
     * that is no reason to fetch the settings again.
     */
    settings: ['notification-settings'] as const,
  },
  support: {
    all: ['support'] as const,
    list: ['support', 'list'] as const,
    thread: (id: string) => ['support', 'thread', id] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: ['bookings', 'list'] as const,
    detail: (id: string) => ['bookings', 'detail', id] as const,
  },
  portfolio: {
    all: ['portfolio'] as const,
  },
  profile: {
    /** Settings and the page together: a handle or a publish changes both. */
    all: ['profile'] as const,
    /** Unchanged, so a cache the app already persisted still matches. */
    settings: ['profile', 'settings'] as const,
    /** Your own page, GET /me/profile/page. */
    page: ['profile', 'page'] as const,
  },
  promos: {
    all: ['promos'] as const,
    offers: ['promos', 'offers'] as const,
    referralCode: ['promos', 'referral-code'] as const,
  },
} as const;
