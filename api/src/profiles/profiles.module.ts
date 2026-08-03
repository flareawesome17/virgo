import { Module } from '@nestjs/common';
import { AlbumsModule } from '../albums/albums.module';
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
  // CDN URLs a portfolio image renders from.
  imports: [AlbumsModule, StorageModule],
  controllers: [PublicProfilesController, MyProfileController, PortfolioController],
  providers: [ProfilesService, PortfolioService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
