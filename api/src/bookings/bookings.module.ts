import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

/**
 * Bookings.
 *
 * Exports the service because HiringService creates one inside its own
 * acceptance transaction — the booking and the acceptance have to land
 * together, or an accepted application with no booking is exactly the state
 * this feature exists to remove.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
