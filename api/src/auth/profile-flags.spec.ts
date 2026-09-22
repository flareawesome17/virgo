import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PromosService } from '../promos/promos.service';
import type { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/auth.dto';
import type { TwoFactorService } from './two-factor.service';
import { toPublicUser, type UserRow, type UsersRepository } from './users.repository';

/**
 * The two profile switches, and the cover that is not one of them.
 *
 * The apps save each switch in a PATCH of its own, so an API that does not
 * know it answers 400 for that switch alone. What this API accepts is the
 * other half of that: booleans only, and no cover URL at all, because a cover
 * is set from a key the server re-encoded, never from a URL a client names.
 */

/** The global pipe, with the options main.ts gives it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const validate = (body: Record<string, unknown>) =>
  pipe.transform(body, { type: 'body', metatype: UpdateProfileDto });

describe('UpdateProfileDto and the profile switches', () => {
  it('accepts either switch on its own', async () => {
    await expect(validate({ availableForBookings: true })).resolves.toBeInstanceOf(
      UpdateProfileDto,
    );
    await expect(validate({ showStudio: false })).resolves.toBeInstanceOf(UpdateProfileDto);
  });

  it('refuses anything but a boolean, null included', async () => {
    // The columns are NOT NULL; a null let through would be a 500 at the
    // database rather than a 400 here.
    await expect(validate({ availableForBookings: 'yes' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(validate({ showStudio: null })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('has no cover URL to set', async () => {
    await expect(validate({ coverUrl: 'https://x' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AuthService.updateProfile and the switches', () => {
  function serviceWith(row: Partial<UserRow>) {
    const users = {
      findById: jest.fn(async () => row as UserRow),
      updateProfile: jest.fn(async () => row as UserRow),
    };
    const service = new AuthService(
      users as unknown as UsersRepository,
      {} as unknown as JwtService,
      { get: (_k: string, fallback?: string) => fallback } as unknown as ConfigService,
      {} as unknown as StorageService,
      {} as unknown as PromosService,
      {} as unknown as TwoFactorService,
    );
    return { service, users };
  }

  it('writes each switch to its column, and leaves an omitted one alone', async () => {
    const { service, users } = serviceWith({
      id: 'user-1',
      email: 'mika@example.com',
      created_at: new Date(),
      available_for_bookings: true,
      show_studio: false,
    });

    await service.updateProfile('user-1', { availableForBookings: true });

    expect(users.updateProfile).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ available_for_bookings: true, show_studio: undefined }),
    );
  });
});

describe('toPublicUser', () => {
  it('gives the new fields their defaults on a row from before migration 070', () => {
    // What a rolled-back database, or a row read before the migration, hands
    // back: none of the three columns at all.
    const user = toPublicUser({
      id: 'user-1',
      email: 'mika@example.com',
      created_at: new Date(),
    } as UserRow);

    expect(user.coverUrl).toBeNull();
    expect(user.availableForBookings).toBe(false);
    expect(user.showStudio).toBe(false);
  });

  it('carries them when they are there', () => {
    const user = toPublicUser({
      id: 'user-1',
      email: 'mika@example.com',
      created_at: new Date(),
      cover_url: 'https://cdn.virgo.test/users/user-1/covers/2026/09/c.webp',
      available_for_bookings: true,
      show_studio: true,
    } as UserRow);

    expect(user).toMatchObject({
      coverUrl: 'https://cdn.virgo.test/users/user-1/covers/2026/09/c.webp',
      availableForBookings: true,
      showStudio: true,
    });
  });
});
