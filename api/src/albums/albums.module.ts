import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlbumRetentionService } from './album-retention.service';
import { AlbumsController } from './albums.controller';
import { AlbumsRepository } from './albums.repository';
import { AlbumsService } from './albums.service';
import { AlbumShareController, PublicAlbumController } from './share/album-share.controller';
import { AlbumShareService } from './share/album-share.service';
import { VisitsModule } from '../visits/visits.module';

@Module({
  imports: [WorkspacesModule, StorageModule, VisitsModule],
  controllers: [AlbumsController, AlbumShareController, PublicAlbumController],
  providers: [
    AlbumsService,
    AlbumsRepository,
    AlbumShareService,
    AlbumRetentionService,
  ],
  // Public profiles showcase albums through the same share-link machinery.
  exports: [AlbumShareService],
})
export class AlbumsModule {}
