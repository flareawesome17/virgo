import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../storage/storage.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { AlbumRetentionService } from './album-retention.service';
import { AlbumsController } from './albums.controller';
import { AlbumsRepository } from './albums.repository';
import { AlbumsService } from './albums.service';
import { AlbumSectionsController } from './sections/album-sections.controller';
import { AlbumSectionsService } from './sections/album-sections.service';
import { AlbumShareController, PublicAlbumController } from './share/album-share.controller';
import { AlbumShareService } from './share/album-share.service';
import { VisitsModule } from '../visits/visits.module';

@Module({
  // AuthModule for ReauthService: deleting an album asks for the password.
  imports: [WorkspacesModule, StorageModule, VisitsModule, AuthModule],
  controllers: [
    AlbumsController,
    AlbumSectionsController,
    AlbumShareController,
    PublicAlbumController,
  ],
  providers: [
    AlbumsService,
    AlbumsRepository,
    AlbumSectionsService,
    AlbumShareService,
    AlbumRetentionService,
  ],
  // Public profiles showcase albums through the same share-link machinery.
  exports: [AlbumShareService],
})
export class AlbumsModule {}
