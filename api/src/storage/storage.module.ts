import { Module } from '@nestjs/common';
import { StorageConfig } from './storage.config';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';
import { DownloadCacheService } from './download-cache.service';
import { ZipCacheService } from './zip-cache.service';
import { ThumbnailsService } from './thumbnails.service';
import { HlsService } from './hls.service';
import { MediaLinkService } from './media-link.service';
import { MediaProcessingService } from './media-processing.service';
import { MediaSweepService } from './media-sweep.service';
import { DisplayBackfillService } from './display-backfill.service';
import { SupportFilesService } from './support-files.service';
import { ReceiptFilesService } from './receipt-files.service';

@Module({
  controllers: [StorageController],
  providers: [
    StorageConfig,
    StorageService,
    DownloadCacheService,
    ZipCacheService,
    ThumbnailsService,
    MediaLinkService,
    MediaProcessingService,
    HlsService,
    MediaSweepService,
    DisplayBackfillService,
    SupportFilesService,
    ReceiptFilesService,
  ],
  // StorageConfig is exported so other modules can turn an object key into a
  // public URL without depending on the whole storage service. MediaLinkService
  // is exported for the same reason — the client gallery signs its own
  // rendition URLs and needs the media origin for its Content-Security-Policy.
  // HlsService is exported because sharing an album is what queues a ladder,
  // and that happens in AlbumShareService. SupportFilesService is shared by
  // the support desk and by account deletion, which erases a customer's files;
  // ReceiptFilesService the same way, by the money ledger and account deletion.
  exports: [
    StorageService,
    DownloadCacheService,
    ZipCacheService,
    StorageConfig,
    ThumbnailsService,
    MediaLinkService,
    HlsService,
    SupportFilesService,
    ReceiptFilesService,
  ],
})
export class StorageModule {}
