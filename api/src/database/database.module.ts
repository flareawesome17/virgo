import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

/**
 * Global so every feature module can inject DatabaseService without importing
 * this module explicitly. There is exactly one pool for the process.
 */
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
