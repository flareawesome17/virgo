import { Module } from '@nestjs/common';
import { AlbumsModule } from '../albums/albums.module';
import { BookingsModule } from '../bookings/bookings.module';
import { FriendsModule } from '../friends/friends.module';
import { StorageModule } from '../storage/storage.module';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import {
  MyProfileController,
  PublicProfilesController,
} from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  // AlbumsModule for the share links a showcased album needs; Storage for the
  // URLs a portfolio image and a cover render from, and the thumbnail a
  // photograph needs before it can be shown. Friends and Bookings for a
  // profile's counts. None of the four imports this module back.
  imports: [AlbumsModule, StorageModule, FriendsModule, BookingsModule],
  controllers: [PublicProfilesController, MyProfileController, PortfolioController],
  providers: [ProfilesService, PortfolioService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
