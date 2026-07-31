import { Global, Module } from '@nestjs/common';
import { QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';

/**
 * Global so workspaces, albums and storage can all enforce limits without
 * each importing this module.
 */
@Global()
@Module({
  controllers: [QuotaController],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
