import { Module } from '@nestjs/common';
import { AlbumsModule } from '../../albums/albums.module';
import { BookingsModule } from '../../bookings/bookings.module';
import { FriendsModule } from '../../friends/friends.module';
import { MailModule } from '../../mail/mail.module';
import { MoneyModule } from '../../money/money.module';
import { ScheduleEventsModule } from '../../schedule-events/schedule-events.module';
import { ShowcasesModule } from '../../showcases/showcases.module';
import { MessagesModule } from '../messages.module';
import { ChatCardsController } from './chat-cards.controller';
import { ChatCardsService } from './chat-cards.service';

/**
 * Cards in chat. A module of its own because it reads from modules that
 * already import MessagesModule (bookings through hiring), so MessagesModule
 * cannot import them back. It hands MessagesService its filler as it starts.
 */
@Module({
  imports: [
    MessagesModule,
    AlbumsModule,
    BookingsModule,
    FriendsModule,
    MailModule,
    MoneyModule,
    ScheduleEventsModule,
    ShowcasesModule,
  ],
  controllers: [ChatCardsController],
  providers: [ChatCardsService],
})
export class ChatCardsModule {}
