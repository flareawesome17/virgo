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
