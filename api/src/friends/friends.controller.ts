import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateFriendDto,
  ListFriendsDto,
  SendFriendRequestDto,
  UpdateFriendDto,
} from './dto/friend.dto';
import { FriendsService } from './friends.service';

@Controller('friends')
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  async list(@CurrentUser('id') userId: string, @Query() query: ListFriendsDto) {
    const filters = {
      status: query.status,
      requested_by: query.requested_by,
    };
    const [data, total] = await Promise.all([
      this.friends.list(userId, { ...query, filters }),
      this.friends.count(userId, filters),
    ]);
    return { data, total };
  }

  /** Declared before `:id` so "presence" is not swallowed as an id. */
  @Get('presence')
  presence(@CurrentUser('id') userId: string) {
    return this.friends
      .presenceOfFriends(userId)
      .then((data) => ({ data, total: data.length }));
  }

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.friends.get(userId, id);
  }

  /**
   * People the caller could add, with their current relationship.
   *
   * Rate-limited: it reads across accounts, so it should not be cheap to call
   * in a loop.
   */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('search/people')
  search(@CurrentUser('id') userId: string, @Query('q') q = '') {
    return this.friends
      .searchPeople(userId, q)
      .then((data) => ({ data, total: data.length }));
  }

  /**
   * Sends a request to a profile, an account picked from search, or an exact
   * address — whichever the body names, in that order.
   *
   * Replaces creating a friend row directly: that only ever described someone,
   * and the person described was never told.
   *
   * 20 an hour per account, shared by all three shapes, and refusals count
   * too: it is the one call that puts something in a stranger's inbox.
   */
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @HttpCode(200)
  @Post('request')
  sendRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    if (dto.handle) return this.friends.sendRequestToHandle(userId, dto.handle);
    if (dto.userId) return this.friends.sendRequestToUser(userId, dto.userId);
    if (dto.email) return this.friends.sendRequest(userId, dto.email);
    throw new BadRequestException('Choose someone to send a request to');
  }

  @HttpCode(200)
  @Post(':id/accept')
  accept(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.friends.accept(userId, id);
  }

  @HttpCode(200)
  @Post(':id/decline')
  decline(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.friends.decline(userId, id);
  }

  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFriendDto) {
    return this.friends.create(userId, { ...dto });
  }

  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateFriendDto,
  ) {
    return this.friends.update(userId, id, { ...dto });
  }

  @HttpCode(204)
  @Delete(':id')
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.friends.remove(userId, id);
  }
}
