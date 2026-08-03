import { Module } from '@nestjs/common';
import {
  MyProfileController,
  PublicProfilesController,
} from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  controllers: [PublicProfilesController, MyProfileController],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
