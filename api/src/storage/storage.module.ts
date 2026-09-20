import { Module } from '@nestjs/common';
import { StorageConfig } from './storage.config';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { ThumbnailsService } from './thumbnails.service';
import { MediaLinkService } from './media-link.service';
import { MediaProcessingService } from './media-processing.service';

@Module({
  controllers: [StorageController],
  providers: [
    StorageConfig,
    StorageService,
    ThumbnailsService,
    MediaLinkService,
    MediaProcessingService,
  ],
  // StorageConfig is exported so other modules can turn an object key into a
  // public URL without depending on the whole storage service. MediaLinkService
  // is exported for the same reason — the client gallery signs its own
  // rendition URLs and needs the media origin for its Content-Security-Policy.
  exports: [StorageService, StorageConfig, ThumbnailsService, MediaLinkService],
})
export class StorageModule {}
