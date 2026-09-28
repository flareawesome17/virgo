import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ShelvesService } from './shelves.service';
import {
  MyShelvesController,
  MyShowcasesController,
  ShelvesController,
  ShowcasesController,
} from './showcases.controller';
import { ShowcasesService } from './showcases.service';

/**
 * Showcases, and the shelves people keep them on.
 *
 * StorageModule for the URLs a piece renders from and the thumbnail one needs
 * before it can be posted. Nothing else: blocks and connections are read as SQL
 * fragments rather than through SafetyModule or FriendsModule, the way Discover
 * and Profiles already do, so this module does not pull half the app in behind
 * it and nothing imports it back.
 */
@Module({
  imports: [StorageModule],
  controllers: [
    MyShowcasesController,
    ShowcasesController,
    MyShelvesController,
    ShelvesController,
  ],
  providers: [ShowcasesService, ShelvesService],
  exports: [ShowcasesService, ShelvesService],
})
export class ShowcasesModule {}
