import { Injectable } from '@nestjs/common';

export type PresenceState = 'viewing' | 'replying';

interface Seen {
  adminId: string;
  name: string;
  state: PresenceState;
  at: number;
}

/** A heartbeat older than this is somebody who has left. */
const STALE_MS = 45_000;

/**
 * Who else has a record open: "Sam is viewing", "Sam is replying…".
 *
 * Held in memory, not the database. It is worth nothing after 45 seconds, it
 * is written every 20 by every open page, and the API runs as one process —
 * the same assumption RealtimeGateway makes for its sockets. A restart forgets
 * everyone, and the next heartbeat brings them back.
 */
@Injectable()
export class PresenceService {
  private readonly records = new Map<string, Map<string, Seen>>();

  private key(targetType: string, targetId: string) {
    return `${targetType}:${targetId}`;
  }

  /** Marks the caller present and returns everyone else who is. */
  beat(
    admin: { id: string; name: string },
    targetType: string,
    targetId: string,
    state: PresenceState,
    now = Date.now(),
  ) {
    const key = this.key(targetType, targetId);
    const here = this.records.get(key) ?? new Map<string, Seen>();
    here.set(admin.id, { adminId: admin.id, name: admin.name, state, at: now });
    this.records.set(key, here);
    this.prune(key, now);
    return [...(this.records.get(key)?.values() ?? [])]
      .filter((s) => s.adminId !== admin.id)
      .map(({ adminId, name, state: s }) => ({ adminId, name, state: s }));
  }

  leave(adminId: string, targetType: string, targetId: string) {
    const key = this.key(targetType, targetId);
    this.records.get(key)?.delete(adminId);
    if (this.records.get(key)?.size === 0) this.records.delete(key);
  }

  private prune(key: string, now: number) {
    const here = this.records.get(key);
    if (!here) return;
    for (const [id, seen] of here) if (now - seen.at > STALE_MS) here.delete(id);
    if (here.size === 0) this.records.delete(key);
    // Sweep the rest occasionally so records nobody revisits do not linger.
    if (Math.random() < 0.02) {
      for (const [other, map] of this.records) {
        for (const [id, seen] of map) if (now - seen.at > STALE_MS) map.delete(id);
        if (map.size === 0) this.records.delete(other);
      }
    }
  }
}
