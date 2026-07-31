import {
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

  @Get(':id')
  get(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.friends.get(userId, id);
  }

  /**
   * Sends a request by email, addressed to a real account.
   *
   * Replaces creating a friend row directly: that only ever described someone,
   * and the person described was never told.
   */
  @HttpCode(200)
  @Post('request')
  sendRequest(
    @CurrentUser('id') userId: string,
    @Body() dto: SendFriendRequestDto,
  ) {
    return this.friends.sendRequest(userId, dto.email);
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
