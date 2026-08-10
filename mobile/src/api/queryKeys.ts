/**
 * Query key factory.
 *
 * Centralised so invalidation is reliable: `queryKeys.workspaces.all` is a
 * prefix of every workspace key, so invalidating it catches lists and details
 * alike. Hand-written keys scattered across screens drift, and a mutation then
 * silently fails to refresh a list that used a slightly different key.
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    session: ['auth', 'session'] as const,
    user: ['auth', 'user'] as const,
  },
  workspaces: {
    all: ['workspaces'] as const,
    list: (params?: unknown) => ['workspaces', 'list', params ?? {}] as const,
    detail: (id: string) => ['workspaces', 'detail', id] as const,
  },
  albums: {
    all: ['albums'] as const,
    list: (params?: unknown) => ['albums', 'list', params ?? {}] as const,
    detail: (id: string) => ['albums', 'detail', id] as const,
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
    settings: ['profile', 'settings'] as const,
  },
} as const;
