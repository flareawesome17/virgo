import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AlbumsModule } from './albums/albums.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { EmailVerifiedGuard } from './auth/email-verified.guard';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CollaboratorsModule } from './collaborators/collaborators.module';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { CloudflareThrottlerGuard } from './common/guards/cloudflare-throttler.guard';
import { validateEnv } from './config/env.validation';
import { DatabaseModule } from './database/database.module';
import { FriendsModule } from './friends/friends.module';
import { HealthModule } from './health/health.module';
import { ProfilesModule } from './profiles/profiles.module';
import { QuotaModule } from './quota/quota.module';
import { MailModule } from './mail/mail.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RemindersModule } from './reminders/reminders.module';
import { ScheduleEventsModule } from './schedule-events/schedule-events.module';
import { ServicesModule } from './services/services.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DiscoverModule } from './discover/discover.module';
import { MessagesModule } from './messages/messages.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    // Drives the due-reminder sweep in NotificationsModule.
    ScheduleModule.forRoot(),
    DatabaseModule,
    QuotaModule,
    MailModule,
    RealtimeModule,
    AuthModule,
    HealthModule,
    WorkspacesModule,
    AlbumsModule,
    ScheduleEventsModule,
    CollaboratorsModule,
    RemindersModule,
    FriendsModule,
    ServicesModule,
    StorageModule,
    NotificationsModule,
    DiscoverModule,
    MessagesModule,
    BillingModule,
    ProfilesModule,
  ],
  providers: [
    // Deny by default: every route requires a valid JWT unless it carries
    // @Public(). Adding an endpoint without thinking about auth yields a locked
    // endpoint, not an open one.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // After JwtAuthGuard: it needs request.user, which that one attaches.
    { provide: APP_GUARD, useClass: EmailVerifiedGuard },
    // Buckets by CF-Connecting-IP so the tunnel does not collapse every user
    // into a single rate-limit bucket.
    { provide: APP_GUARD, useClass: CloudflareThrottlerGuard },
    { provide: APP_FILTER, useClass: DatabaseExceptionFilter },
  ],
})
export class AppModule {}
