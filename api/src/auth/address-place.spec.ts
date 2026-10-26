import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { PromosService } from '../promos/promos.service';
import type { StorageService } from '../storage/storage.service';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/auth.dto';
import type { SessionsService } from './sessions.service';
import type { TwoFactorService } from './two-factor.service';
import { toPublicUser, type UserRow, type UsersRepository } from './users.repository';

/**
 * What an address does besides being an address: it places the account in
 * Nearby, and it becomes the "City, Province" the profile shows.
 *
 * The installed apps still send a free-text location with every save, the
 * address included and usually unchanged; the current ones send no location
 * at all. Both have to come out right.
 */

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

const savedInCebu: Partial<UserRow> = {
  id: 'user-1',
  email: 'mika@example.com',
  created_at: new Date(),
  location: 'Wherever the work is',
  address_line1: '1 Rizal St',
  address_city: 'Cebu City',
  address_province: 'Cebu',
  address_country: 'PH',
};

function serviceWith(row: Partial<UserRow>) {
  const users = {
    findById: jest.fn(async () => row as UserRow),
    findByEmail: jest.fn(async () => null),
    updateProfile: jest.fn(async () => row as UserRow),
    create: jest.fn(async () => row as UserRow),
  };
  const service = new AuthService(
    users as unknown as UsersRepository,
    {} as unknown as JwtService,
    // The cheapest bcrypt cost, so registering in a test does not take a second.
    { get: (k: string, fallback?: string) => (k === 'BCRYPT_ROUNDS' ? '4' : fallback) } as unknown as ConfigService,
    {} as unknown as StorageService,
    {} as unknown as PromosService,
    {} as unknown as TwoFactorService,
    {} as unknown as SessionsService,
  );
  return { service, users };
}

const fieldsWritten = (users: ReturnType<typeof serviceWith>['users']) =>
  (users.updateProfile.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];

describe('AuthService.register and the address', () => {
  it('places the new account and gives its profile the city and province', async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.register('mika@example.com', 'a long password', 'Mika', ['Photographer'], {
      addressLine1: '1 Rizal St',
      addressCity: 'Mandaue City',
      addressProvince: 'Cebu',
      addressCountry: 'PH',
    });

    const details = (users.create.mock.calls[0] as unknown as unknown[])[4];
    expect(details).toMatchObject({
      addressPlace: {
        place: 'Mandaue, Cebu',
        latitude: 10.3237,
        longitude: 123.9227,
        precision: 'city',
      },
      location: 'Mandaue, Cebu',
    });
  });

  it('still records the address when the city cannot be placed', async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.register('mika@example.com', 'a long password', 'Mika', ['Photographer'], {
      addressLine1: '1 Rizal St',
      addressCity: 'Atlantis',
      addressProvince: 'Narnia',
      addressCountry: 'PH',
    });

    const details = (users.create.mock.calls[0] as unknown as unknown[])[4];
    expect(details).toMatchObject({
      addressCity: 'Atlantis',
      addressPlace: null,
      location: 'Atlantis, Narnia',
    });
  });
});

describe('AuthService.updateProfile and the address', () => {
  it('sets the location from the address when the current apps save it', async () => {
    const { service, users } = serviceWith(savedInCebu);

    // The same address, and no location key: what the current apps send.
    await service.updateProfile('user-1', {
      addressLine1: '1 Rizal St',
      addressCity: 'Cebu City',
      addressProvince: 'Cebu',
      addressCountry: 'PH',
    });

    expect(fieldsWritten(users)).toMatchObject({
      location: 'Cebu City, Cebu',
      address_place: 'Cebu City, Cebu',
      address_precision: 'city',
      address_latitude: 10.3157,
      address_longitude: 123.8854,
      address_geocoded_at: expect.any(Date),
    });
  });

  it("keeps an installed app's location when its address did not move", async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.updateProfile('user-1', {
      location: 'Visayas and Mindanao',
      addressLine1: '1 Rizal St',
      addressCity: ' Cebu City ',
      addressProvince: 'Cebu',
      addressCountry: 'PH',
      addressLine2: 'Unit 4B',
    });

    expect(fieldsWritten(users)).toMatchObject({
      location: 'Visayas and Mindanao',
      address_place: 'Cebu City, Cebu',
      address_line2: 'Unit 4B',
    });
  });

  it("replaces an installed app's location when the address moved", async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.updateProfile('user-1', {
      location: 'Wherever the work is',
      addressLine1: '2 Osmeña Blvd',
      addressCity: 'Plaridel',
      addressProvince: 'Misamis Occidental',
      addressCountry: 'PH',
    });

    expect(fieldsWritten(users)).toMatchObject({
      location: 'Plaridel, Misamis Occidental',
      // At Plaridel itself, not at the province's capital.
      address_place: 'Plaridel, Misamis Occidental',
      address_precision: 'city',
      address_latitude: 8.6214,
    });
  });

  it('places a city saved on its own with the province already on the account', async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.updateProfile('user-1', { addressCity: 'Talisay' });

    expect(fieldsWritten(users)).toMatchObject({
      address_place: 'Talisay, Cebu',
      location: 'Talisay, Cebu',
    });
  });

  it('leaves the location and the place alone when no address is sent', async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.updateProfile('user-1', { bio: 'Weddings' });

    const fields = fieldsWritten(users);
    expect(fields.location).toBeUndefined();
    expect(fields).not.toHaveProperty('address_place');
    expect(users.findById).not.toHaveBeenCalled();
  });

  it('still takes a location on its own from an installed app', async () => {
    const { service, users } = serviceWith(savedInCebu);

    await service.updateProfile('user-1', { location: 'Davao' });

    expect(fieldsWritten(users).location).toBe('Davao');
  });
});

describe('UpdateProfileDto and what the installed apps still send', () => {
  const validate = (body: Record<string, unknown>) =>
    pipe.transform(body, { type: 'body', metatype: UpdateProfileDto });

  it('accepts the second address line and a free-text location', async () => {
    await expect(
      validate({ addressLine2: 'Unit 4B', location: 'Cebu', addressCity: 'Cebu City' }),
    ).resolves.toBeInstanceOf(UpdateProfileDto);
    await expect(validate({ addressLine2: null, location: null })).resolves.toBeInstanceOf(
      UpdateProfileDto,
    );
  });

  it('still refuses keys it does not know', async () => {
    await expect(validate({ addressPlace: 'Cebu City' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('toPublicUser and the address place', () => {
  it('says where the address placed them, and null on a row from before migration 089', () => {
    expect(toPublicUser({ ...savedInCebu, address_place: 'Cebu City' } as UserRow).addressPlace).toBe(
      'Cebu City',
    );
    expect(toPublicUser(savedInCebu as UserRow).addressPlace).toBeNull();
  });

  it('carries neither the coordinates nor the hidden flag', () => {
    const user = toPublicUser({
      ...savedInCebu,
      address_latitude: 10.3,
      address_longitude: 123.9,
      nearby_hidden: true,
    } as UserRow);

    expect(JSON.stringify(user)).not.toContain('123.9');
    expect(user).not.toHaveProperty('nearbyHidden');
  });
});
