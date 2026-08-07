import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import type { JwtPayload } from '../auth/auth.service';
import { PresenceService } from './presence.service';

/**
 * What a notification is about.
 *
 * The client switches on this to decide which cached queries went stale, so
 * adding a topic here means adding a case there — a topic nothing handles is
 * still delivered, it just refreshes nothing.
 */
export type NotificationTopic =
  | 'friend-request'
  | 'friend-accepted'
  | 'collaborator-invite'
  | 'collaborator-response'
  | 'event-invite'
  | 'event-response'
  /** Someone wants to hire you, and said what for. */
  | 'hire-enquiry'
  | 'hire-response'
  /** Someone applied to a job you posted, or answered your application. */
  | 'job-application'
  | 'job-response'
  | 'reminder'
  /** A plan started, lapsed, or failed to renew. */
  | 'billing'
  /** Delivered files removed by an album's retention setting. */
  | 'retention';

/** What the server pushes. Discriminated on `type`. */
export type ServerEvent =
  | { type: 'ready'; userId: string }
  | { type: 'message'; conversationId: string; message: unknown }
  | { type: 'message-deleted'; conversationId: string; messageId: string; scope: 'me' | 'everyone' }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'delivered'; conversationId: string; userId: string; at: string }
  | { type: 'conversation'; conversationId: string }
  /**
   * Everything that is not chat: friend requests, invitations, reminders.
   *
   * One envelope rather than an event type per feature. Each of these needs
   * the same three things on the client — refresh the affected list, show
   * something, buzz — and a shared shape means a new notification is a new
   * `topic`, not a new branch in every client.
   */
  /**
   * A job was posted, to everyone connected except whoever posted it.
   *
   * Deliberately not a `notification`: those are addressed to a person and
   * ring their phone. This is ambient — the board changed — so it carries no
   * text and exists only so an open client can bump its badge and refetch
   * without waiting for a poll.
   */
  | { type: 'job-posted'; slug: string; at: string }
  | {
      type: 'notification';
      topic: NotificationTopic;
      title: string;
      body: string;
      /** Whatever the tap handler needs to route; mirrors the push payload. */
      data: Record<string, unknown>;
      at: string;
    }
  /**
   * Somebody came online or went offline.
   *
   * Sent only to people who share a conversation with them — see
   * PresenceService. `lastSeenAt` is what to show once `online` is false.
   */
  | { type: 'presence'; userId: string; online: boolean; lastSeenAt: string | null }
  /**
   * Somebody started or stopped typing in a conversation.
   *
   * Carries the name so the client can render "Ana is typing" without a
   * lookup — the typist may not be in any list the reader has loaded.
   */
  | {
      type: 'typing';
      conversationId: string;
      userId: string;
      name: string;
      typing: boolean;
    };

interface Session {
  socket: WebSocket;
  userId: string;
  /** Cleared once the socket authenticates. */
  authTimer?: NodeJS.Timeout;
  alive: boolean;
}

/**
 * Live delivery for chat.
 *
 * A plain WebSocket rather than socket.io or SSE. React Native has no native
 * EventSource, and socket.io's protocol would mean a client library on both
 * platforms; `WebSocket` is built into the browser and into React Native, so
 * one transport covers everything with no dependency on either client.
 *
 * Authentication is a first *message*, not a query parameter. A browser cannot
 * set headers on a WebSocket handshake, and the usual workaround —
 * `?token=…` — writes the access token into URLs, which land in proxy logs and
 * browser history. Sending it in the opening frame keeps it out of both.
 */
@Injectable()
@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server?: Server;

  /** userId -> their open sockets. Somebody may have the app and the web open. */
  private readonly sessions = new Map<string, Set<Session>>();
  private readonly bySocket = new WeakMap<WebSocket, Session>();
  private heartbeat?: NodeJS.Timeout;

  /** An unauthenticated socket gets this long before it is dropped. */
  private static readonly AUTH_GRACE_MS = 10_000;
  /** Ping interval. Cloudflare closes idle tunnelled sockets around 100s. */
  private static readonly PING_MS = 30_000;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly presence: PresenceService,
  ) {}

  /**
   * Called by Nest for each new connection.
   *
   * Named `handleConnection` by convention; the adapter wires it up.
   */
  handleConnection(socket: WebSocket): void {
    this.startHeartbeat();

    const session: Session = {
      socket,
      userId: '',
      alive: true,
      authTimer: setTimeout(() => {
        // Never authenticated. 4001 rather than a plain close so the client
        // can tell this apart from a network drop and not retry blindly.
        this.close(socket, 4001, 'Authentication timed out');
      }, RealtimeGateway.AUTH_GRACE_MS),
    };
    this.bySocket.set(socket, session);

    socket.on('message', (raw: Buffer | string) => this.onMessage(session, raw));
    socket.on('pong', () => {
      session.alive = true;
    });
    socket.on('close', () => this.forget(session));
    socket.on('error', () => this.forget(session));
  }

  private onMessage(session: Session, raw: Buffer | string): void {
    let payload: {
      type?: string;
      token?: string;
      conversationId?: string;
      typing?: boolean;
    };
    try {
      payload = JSON.parse(raw.toString()) as typeof payload;
    } catch {
      return; // Not ours; ignore rather than dropping the connection.
    }

    if (payload.type === 'ping') {
      this.send(session.socket, { type: 'ready', userId: session.userId });
      return;
    }

    if (payload.type === 'typing') {
      // Ignored before authentication: an unauthenticated socket has no
      // identity to attribute typing to.
      if (!session.userId || !payload.conversationId) return;
      void this.relayTyping(
        session.userId,
        payload.conversationId,
        payload.typing !== false,
      );
      return;
    }

    if (payload.type !== 'auth' || !payload.token) return;

    let claims: JwtPayload;
    try {
      claims = this.jwt.verify<JwtPayload>(payload.token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
    } catch {
      this.close(session.socket, 4001, 'Invalid token');
      return;
    }

    clearTimeout(session.authTimer);
    session.authTimer = undefined;
    session.userId = claims.sub;

    const set = this.sessions.get(claims.sub) ?? new Set<Session>();
    // Somebody with the app and the web open has two sockets. Only the first
    // is a transition from offline — announcing on every socket would flicker
    // them "online" repeatedly for anyone watching.
    const wasOffline = set.size === 0;
    set.add(session);
    this.sessions.set(claims.sub, set);

    this.send(session.socket, { type: 'ready', userId: claims.sub });
    if (wasOffline) void this.announcePresence(claims.sub, true);
  }

  /**
   * Tells the people who share a conversation with this user.
   *
   * Fire-and-forget: presence is decoration, and a failure here must not
   * affect the socket that triggered it.
   */
  private async announcePresence(userId: string, online: boolean): Promise<void> {
    try {
      await this.presence.touch(userId);
      const audience = await this.presence.audienceFor(userId);
      if (audience.length === 0) return;

      this.emitToUsers(audience, {
        type: 'presence',
        userId,
        online,
        // Only meaningful when they have gone; while online the client shows
        // "online" and ignores this.
        lastSeenAt: online ? null : new Date().toISOString(),
      });
    } catch (err) {
      this.logger.debug(`Presence announce failed: ${String(err)}`);
    }
  }

  /**
   * Passes a typing signal to the rest of the conversation.
   *
   * Nothing is stored. A typing indicator is only true for the couple of
   * seconds it is on screen, and a row recording that somebody was typing at
   * 11:04 is a record nobody asked to keep.
   */
  private async relayTyping(
    userId: string,
    conversationId: string,
    typing: boolean,
  ): Promise<void> {
    try {
      const { allowed, others, name } =
        await this.presence.othersInConversation(userId, conversationId);
      if (!allowed || others.length === 0) return;

      this.emitToUsers(others, {
        type: 'typing',
        conversationId,
        userId,
        name,
        typing,
      });
    } catch (err) {
      this.logger.debug(`Typing relay failed: ${String(err)}`);
    }
  }

  /** Whether this account has a socket open right now. */
  isOnline(userId: string): boolean {
    return (this.sessions.get(userId)?.size ?? 0) > 0;
  }

  /** Of these accounts, the ones currently connected. */
  onlineAmong(userIds: readonly string[]): Set<string> {
    return new Set(userIds.filter((id) => this.isOnline(id)));
  }

  /**
   * Pushes an event to every socket these users have open.
   *
   * Best-effort and never throws: realtime is an accelerator on top of the
   * REST API, and a dead socket must not fail the request that triggered it.
   * A client that misses an event still catches up on its next poll.
   */
  emitToUsers(userIds: readonly string[], event: ServerEvent): void {
    for (const userId of new Set(userIds)) {
      const set = this.sessions.get(userId);
      if (!set) continue;
      for (const session of set) this.send(session.socket, event);
    }
  }

  /**
   * Sends to every connected session except one.
   *
   * For board-level changes, where the audience is "anyone looking" rather
   * than a named list. `except` keeps a poster from being told about their
   * own post, which would show them a badge for something they just wrote.
   */
  broadcast(event: ServerEvent, except?: string): void {
    for (const [userId, set] of this.sessions) {
      if (userId === except) continue;
      for (const session of set) this.send(session.socket, event);
    }
  }

  /** Whether anyone is listening — lets callers skip work when nobody is. */
  hasListeners(userId: string): boolean {
    return (this.sessions.get(userId)?.size ?? 0) > 0;
  }

  private send(socket: WebSocket, event: ServerEvent): void {
    // 1 === OPEN. Comparing the numeric constant avoids importing the enum.
    if (socket.readyState !== 1) return;
    try {
      socket.send(JSON.stringify(event));
    } catch (err) {
      this.logger.debug(`Dropped a frame: ${String(err)}`);
    }
  }

  private close(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // Already gone.
    }
  }

  private forget(session: Session): void {
    clearTimeout(session.authTimer);
    const set = this.sessions.get(session.userId);
    if (!set) return;
    set.delete(session);
    if (set.size > 0) return;

    // Their last socket. Closing the app on the phone while the web is still
    // open is not going offline, which is why this only fires once the set
    // empties.
    this.sessions.delete(session.userId);
    if (session.userId) void this.announcePresence(session.userId, false);
  }

  /**
   * Drops sockets that have stopped answering.
   *
   * A TCP connection through a tunnel can be silently dead for a long time; a
   * half-open socket that is never cleaned up leaks memory and makes
   * `hasListeners` lie.
   */
  private startHeartbeat(): void {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => {
      for (const set of this.sessions.values()) {
        for (const session of set) {
          if (!session.alive) {
            this.close(session.socket, 4002, 'No pong');
            this.forget(session);
            continue;
          }
          session.alive = false;
          try {
            session.socket.ping();
          } catch {
            this.forget(session);
          }
        }
      }
    }, RealtimeGateway.PING_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const set of this.sessions.values()) {
      for (const session of set) this.close(session.socket, 1001, 'Server shutting down');
    }
    this.sessions.clear();
  }
}
