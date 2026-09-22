import { Global, Module } from '@nestjs/common';
import { BlocksService } from './blocks.service';
import { BlocksController, ReportsController } from './safety.controller';
import { ReportsService } from './reports.service';

/**
 * Blocking and reporting people.
 *
 * Global because a block has to be honoured everywhere two people can meet —
 * friends, messages, hire, hiring, discover, profiles, presence — and each of
 * those importing this would be a dozen edits for nothing. It depends only on
 * the Database and Mail modules, both global themselves and importing nothing
 * back, so it cannot close a cycle.
 */
@Global()
@Module({
  controllers: [BlocksController, ReportsController],
  providers: [BlocksService, ReportsService],
  exports: [BlocksService],
})
export class SafetyModule {}
