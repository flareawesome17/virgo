import { BadRequestException } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import type { FriendsService } from './friends.service';

/**
 * POST /friends/request: which body shape wins, and its own rate limit.
 *
 * The limit is read off the handler's metadata, which is what the throttler
 * guard reads; the per-account bucketing is CloudflareThrottlerGuard's.
 */

function controllerOver() {
  const friends = {
    sendRequestToHandle: jest.fn(async () => ({ via: 'handle' })),
    sendRequestToUser: jest.fn(async () => ({ via: 'userId' })),
    sendRequest: jest.fn(async () => ({ via: 'email' })),
  };
  return {
    controller: new FriendsController(friends as unknown as FriendsService),
    friends,
  };
}

describe('FriendsController.sendRequest', () => {
  it('routes a handle before a user id before an email', async () => {
    const { controller, friends } = controllerOver();

    await controller.sendRequest('me', {
      handle: 'ana_cruz',
      userId: 'someone',
      email: 'a@example.com',
    });
    expect(friends.sendRequestToHandle).toHaveBeenCalledWith('me', 'ana_cruz');
    expect(friends.sendRequestToUser).not.toHaveBeenCalled();

    await controller.sendRequest('me', { userId: 'someone', email: 'a@example.com' });
    expect(friends.sendRequestToUser).toHaveBeenCalledWith('me', 'someone');
    expect(friends.sendRequest).not.toHaveBeenCalled();

    await controller.sendRequest('me', { email: 'a@example.com' });
    expect(friends.sendRequest).toHaveBeenCalledWith('me', 'a@example.com');
  });

  it('asks for someone when the body names nobody', () => {
    const { controller } = controllerOver();
    expect(() => controller.sendRequest('me', {})).toThrow(
      new BadRequestException('Choose someone to send a request to'),
    );
  });

  it('is limited to 20 an hour', () => {
    const handler = FriendsController.prototype.sendRequest;
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(3_600_000);
  });
});
