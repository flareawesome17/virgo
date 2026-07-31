import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsRepository } from './friends.repository';
import { FriendsService } from './friends.service';

@Module({
  controllers: [FriendsController],
  providers: [FriendsService, FriendsRepository],
})
export class FriendsModule {}
