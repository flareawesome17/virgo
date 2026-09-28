import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateShelfDto,
  CreateShowcaseDto,
  KeepShowcaseDto,
  UpdateShelfDto,
  UpdateShowcaseDto,
} from './dto/showcase.dto';
import { FeedService } from './feed.service';
import { ShelvesService } from './shelves.service';
import { ShowcasesService } from './showcases.service';

/**
 * The owner's own showcases.
 *
 * Reading somebody else's goes through GET /showcases/:id below; there is no
 * public feed route yet, and it is deliberately not bolted onto these — a feed
 * needs an unauthenticated read path and its own delivery decisions, which are
 * a separate piece of work.
 */
@Controller('me/showcases')
export class MyShowcasesController {
  constructor(private readonly showcases: ShowcasesService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    const data = await this.showcases.listMine(userId);
    return { data, total: data.length };
  }

  // Posting reads every chosen file and may encode a web copy for each, so this
  // is the expensive write in the module, not a cheap one.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  @HttpCode(200)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateShowcaseDto) {
    return this.showcases.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShowcaseDto,
  ) {
    return this.showcases.update(userId, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.showcases.setPublished(userId, id, true);
  }

  /** Takes it down without losing when it first went out. */
  @Delete(':id/publish')
  @HttpCode(200)
  unpublish(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.showcases.setPublished(userId, id, false);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    await this.showcases.remove(userId, id);
  }
}

/**
 * One showcase, as the signed-in reader may see it.
 *
 * Signed-in only, like /profiles/:handle and for the same reason: an
 * unauthenticated reader of a creative's work is a scraper as often as a
 * client. The open-web read is the feed's problem, and the feed does not
 * exist yet.
 */
@Controller('showcases')
export class ShowcasesController {
  constructor(private readonly showcases: ShowcasesService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  one(@CurrentUser('id') viewerId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.showcases.one(viewerId, id);
  }
}

/** The shelves somebody keeps other people's work on. */
@Controller('me/shelves')
export class MyShelvesController {
  constructor(private readonly shelves: ShelvesService) {}

  @Get()
  async list(@CurrentUser('id') userId: string) {
    const data = await this.shelves.list(userId, userId);
    return { data, total: data.length };
  }

  @Post()
  @HttpCode(200)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateShelfDto) {
    return this.shelves.create(userId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShelfDto,
  ) {
    return this.shelves.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@CurrentUser('id') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.shelves.remove(userId, id);
  }

  @Get(':id/items')
  async entries(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.shelves.entries(userId, id);
    return { data, total: data.length };
  }

  @Post(':id/items')
  @HttpCode(200)
  keep(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: KeepShowcaseDto,
  ) {
    return this.shelves.keep(userId, id, dto);
  }

  @Delete(':id/items/:showcaseId')
  @HttpCode(200)
  unkeep(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('showcaseId', ParseUUIDPipe) showcaseId: string,
  ) {
    return this.shelves.unkeep(userId, id, showcaseId);
  }
}

/** Somebody else's public shelves, read by id. */
@Controller('shelves')
export class ShelvesController {
  constructor(private readonly shelves: ShelvesService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id/items')
  async entries(
    @CurrentUser('id') viewerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.shelves.entries(viewerId, id);
    return { data, total: data.length };
  }
}

/**
 * The feed.
 *
 * Signed in. The open-web version needs media that is not behind a signed url,
 * which is a storage migration; the feed people scroll inside the app is not
 * waiting on it.
 */
@Controller('feed')
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Get()
  page(
    @CurrentUser('id') viewerId: string,
    @Query('scope') scope?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feed.page(viewerId, {
      scope: scope === 'connections' ? 'connections' : 'everyone',
      cursor,
      // A limit that is not a number is no limit at all, not a 400: the page
      // size is a hint, and refusing the whole feed over it helps nobody.
      limit: Number.isFinite(Number(limit)) ? Number(limit) : undefined,
    });
  }
}
