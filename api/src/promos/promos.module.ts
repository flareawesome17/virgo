import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PromosController } from './promos.controller';
import { PromosService } from './promos.service';

/**
 * Promos and referrals.
 *
 * Exports the service because three other places drive it and none of them
 * belong here: QuotaService adds claimed grants to a plan's limits, AuthService
 * records a referral at signup and pays it out at verification, and the
 * console's AdminPromosController creates and hands them out.
 *
 * Only the recipient-facing controller is registered here. The admin one lives
 * in AdminModule, behind that module's guard.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [PromosController],
  providers: [PromosService],
  exports: [PromosService],
})
export class PromosModule {}
