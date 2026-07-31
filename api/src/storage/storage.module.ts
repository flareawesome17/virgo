import { Module } from '@nestjs/common';
import { StorageConfig } from './storage.config';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  controllers: [StorageController],
  providers: [StorageConfig, StorageService],
  // StorageConfig is exported so other modules can turn an object key into a
  // public URL without depending on the whole storage service.
  exports: [StorageService, StorageConfig],
})
export class StorageModule {}
