import { Global, Module } from '@nestjs/common';
import { PlansController, QuotaController } from './quota.controller';
import { QuotaService } from './quota.service';
import { DownloadAllowanceService } from './download-allowance.service';

/**
 * Global so workspaces, albums and storage can all enforce limits without
 * each importing this module.
 */
@Global()
@Module({
  controllers: [QuotaController, PlansController],
  providers: [QuotaService, DownloadAllowanceService],
  exports: [QuotaService, DownloadAllowanceService],
})
export class QuotaModule {}
