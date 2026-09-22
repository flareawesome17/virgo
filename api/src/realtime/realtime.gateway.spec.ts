import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { WebSocket } from 'ws';
import type { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Admitting a socket, and ending a suspended account's live sessions.
 *
 * Sockets are faked: each records what was sent and how it was closed, and
 * authenticates the way a client does, with an `auth` frame as its first
 * message.
 */

function fakeSocket() {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    readyState: 1,
    on: jest.fn((event: string, fn: (...args: unknown[]) => void) => {
      handlers.set(event, fn);
    }),
    send: jest.fn(),
    close: jest.fn(),
    ping: jest.fn(),
  };
  const emit = (event: string, ...args: unknown[]) => handlers.get(event)?.(...args);
  return { socket, emit };
}

/** Lets the auth frame's account lookup, and whatever follows it, settle. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function gatewayOver(mayConnect: (userId: string) => Promise<boolean> = async () => true) {
  const jwt = {
    // The token is the account id, which is all these tests need of it.
    verify: jest.fn((token: string) => ({ sub: token })),
  };
  const config = { getOrThrow: jest.fn(() => 'secret') };
  const presence = {
    touch: jest.fn(async () => undefined),
    audienceFor: jest.fn(async () => [] as string[]),
    mayConnect: jest.fn(mayConnect),
  };
  const gateway = new RealtimeGateway(
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
    presence as unknown as PresenceService,
  );

  const open = (userId: string) => {
    const s = fakeSocket();
    gateway.handleConnection(s.socket as unknown as WebSocket);
    s.emit('message', JSON.stringify({ type: 'auth', token: userId }));
    return s;
  };
  const connect = async (userId: string) => {
    const { socket } = open(userId);
    await settle();
    return socket;
  };
  const sent = (socket: { send: jest.Mock }) =>
    socket.send.mock.calls.map(([frame]) => JSON.parse(String(frame)) as { type: string });

  return { gateway, presence, open, connect, sent };
}

describe('RealtimeGateway auth', () => {
  let gateway: RealtimeGateway | undefined;

  // The first connection starts the heartbeat interval; stop it.
  afterEach(() => gateway?.onModuleDestroy());

  it('admits an active account: ready, online, and announced', async () => {
    const h = gatewayOver();
    gateway = h.gateway;

    const socket = await h.connect('user-1');

    expect(h.presence.mayConnect).toHaveBeenCalledWith('user-1');
    expect(h.sent(socket)).toEqual([{ type: 'ready', userId: 'user-1' }]);
    expect(socket.close).not.toHaveBeenCalled();
    expect(h.gateway.isOnline('user-1')).toBe(true);
    expect(h.presence.touch).toHaveBeenCalledWith('user-1');
  });

  it('refuses a suspended account with 4001 even though its token is valid, and tells nobody', async () => {
    const h = gatewayOver(async (id) => id !== 'suspended');
    gateway = h.gateway;

    const socket = await h.connect('suspended');

    // 4001 is the code the clients treat as "stop", so it does not loop.
    expect(socket.close).toHaveBeenCalledWith(4001, 'Session ended');
    expect(h.sent(socket)).toEqual([]);
    expect(h.gateway.isOnline('suspended')).toBe(false);
    expect(h.presence.touch).not.toHaveBeenCalled();
    expect(h.presence.audienceFor).not.toHaveBeenCalled();
  });

  it('ignores typing from a socket still waiting on the account check', async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    const h = gatewayOver(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    gateway = h.gateway;
    const othersInConversation = jest.fn();
    Object.assign(h.presence, { othersInConversation });

    const { socket, emit } = h.open('suspended');
    emit('message', JSON.stringify({ type: 'typing', conversationId: 'convo-1' }));
    answer(false);
    await settle();

    expect(othersInConversation).not.toHaveBeenCalled();
    expect(socket.close).toHaveBeenCalledWith(4001, 'Session ended');
  });

  it('closes with a retryable code, not 4001, when the account cannot be checked', async () => {
    const h = gatewayOver(async () => {
      throw new Error('connection reset');
    });
    gateway = h.gateway;

    const socket = await h.connect('user-1');

    expect(socket.close).toHaveBeenCalledWith(1011, 'Try again');
    expect(h.gateway.isOnline('user-1')).toBe(false);
  });

  it('never registers a socket that closed while the check was in flight', async () => {
    let answer: (allowed: boolean) => void = () => undefined;
    const h = gatewayOver(
      () =>
        new Promise<boolean>((resolve) => {
          answer = resolve;
        }),
    );
    gateway = h.gateway;

    const { socket, emit } = h.open('user-1');
    socket.readyState = 3;
    emit('close');
    answer(true);
    await settle();

    expect(h.gateway.isOnline('user-1')).toBe(false);
    expect(h.presence.touch).not.toHaveBeenCalled();
  });
});

describe('RealtimeGateway.closeUser', () => {
  let gateway: RealtimeGateway | undefined;

  afterEach(() => gateway?.onModuleDestroy());

  it("closes every one of that account's sessions with 4001, and nobody else's", async () => {
    const h = gatewayOver();
    gateway = h.gateway;
    const phone = await h.connect('user-1');
    const browser = await h.connect('user-1');
    const someoneElse = await h.connect('user-2');

    h.gateway.closeUser('user-1');

    // 4001 is the code the clients treat as "stop, do not retry".
    expect(phone.close).toHaveBeenCalledWith(4001, 'Session ended');
    expect(browser.close).toHaveBeenCalledWith(4001, 'Session ended');
    expect(someoneElse.close).not.toHaveBeenCalled();
    expect(h.gateway.isOnline('user-2')).toBe(true);
  });

  it('passes a given reason through', async () => {
    const h = gatewayOver();
    gateway = h.gateway;
    const socket = await h.connect('user-1');

    h.gateway.closeUser('user-1', 'Account suspended');

    expect(socket.close).toHaveBeenCalledWith(4001, 'Account suspended');
  });

  it('does nothing for an account with no sessions', async () => {
    const h = gatewayOver();
    gateway = h.gateway;
    const socket = await h.connect('user-2');

    expect(() => h.gateway.closeUser('user-1')).not.toThrow();
    expect(socket.close).not.toHaveBeenCalled();
  });

  it('refuses the reconnect a suspended client makes with its stored token', async () => {
    let suspended = false;
    const h = gatewayOver(async () => !suspended);
    gateway = h.gateway;
    await h.connect('user-1');

    suspended = true;
    h.gateway.closeUser('user-1', 'Account suspended');
    const again = await h.connect('user-1');

    expect(again.close).toHaveBeenCalledWith(4001, 'Session ended');
    expect(h.sent(again)).toEqual([]);
  });
});
