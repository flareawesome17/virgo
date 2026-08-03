import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlbumRetentionService } from './album-retention.service';
import { AlbumsController } from './albums.controller';
import { AlbumsRepository } from './albums.repository';
import { AlbumsService } from './albums.service';
import { AlbumShareController, PublicAlbumController } from './share/album-share.controller';
import { AlbumShareService } from './share/album-share.service';

@Module({
  imports: [WorkspacesModule, StorageModule],
  controllers: [AlbumsController, AlbumShareController, PublicAlbumController],
  providers: [
    AlbumsService,
    AlbumsRepository,
    AlbumShareService,
    AlbumRetentionService,
  ],
})
export class AlbumsModule {}
