import { Module } from '@nestjs/common';
import { ChatCrewModule } from '../messages/crew/chat-crew.module';
import { MoneyModule } from '../money/money.module';
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
  // Money: a confirmed booking shows the poster the creative's way to pay.
  // ChatCrew: a cancelled booking takes its creative out of the crew chat.
  imports: [NotificationsModule, MoneyModule, ChatCrewModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
