import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateAlbumDto, UpdateAlbumDto } from './album.dto';

/**
 * What the album routes accept, validated the way main.ts validates them.
 *
 * An album's `item_count` is counted from its files now, and nothing a client
 * sends for it is stored. The create DTO still has to declare the field:
 * every installed phone posts `item_count: 0` when it creates an album, and
 * with `forbidNonWhitelisted` on, a field the DTO does not declare is a 400.
 * Deleting an ignored field is the obvious cleanup and the wrong one, so this
 * runs the real pipe over the body the phones send. Update never had a
 * sender, and refuses the field.
 */

/** The global pipe, with the options main.ts gives it. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

/** What mobile's create screen posts, as installed builds send it. */
const PHONE_CREATE = {
  name: 'Reyes wedding',
  description: null,
  workspace_id: 'workspace-1',
  retention_days: null,
  item_count: 0,
  status: 'draft',
};

describe('album DTOs', () => {
  it('still accepts the create body installed phones post', async () => {
    await expect(
      pipe.transform(PHONE_CREATE, { type: 'body', metatype: CreateAlbumDto }),
    ).resolves.toBeInstanceOf(CreateAlbumDto);
  });

  it('refuses a count on update', async () => {
    const refused = await pipe
      .transform(
        { name: 'Reyes wedding', item_count: 3 },
        { type: 'body', metatype: UpdateAlbumDto },
      )
      .catch((err: unknown) => err);

    expect(refused).toBeInstanceOf(BadRequestException);
    expect((refused as BadRequestException).getResponse()).toMatchObject({
      message: ['property item_count should not exist'],
    });
  });
});
