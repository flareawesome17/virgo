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
  },
  hire: {
    all: ['hire'] as const,
    list: () => ['hire', 'list'] as const,
  },
  portfolio: {
    all: ['portfolio'] as const,
  },
  profile: {
    settings: ['profile', 'settings'] as const,
  },
} as const;
