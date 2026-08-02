import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import type { JwtPayload } from '../auth/auth.service';

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
  | 'reminder';

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
  | {
      type: 'notification';
      topic: NotificationTopic;
      title: string;
      body: string;
      /** Whatever the tap handler needs to route; mirrors the push payload. */
      data: Record<string, unknown>;
      at: string;
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
    let payload: { type?: string; token?: string };
    try {
      payload = JSON.parse(raw.toString()) as typeof payload;
    } catch {
      return; // Not ours; ignore rather than dropping the connection.
    }

    if (payload.type === 'ping') {
      this.send(session.socket, { type: 'ready', userId: session.userId });
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
    set.add(session);
    this.sessions.set(claims.sub, set);

    this.send(session.socket, { type: 'ready', userId: claims.sub });
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
    if (set.size === 0) this.sessions.delete(session.userId);
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
