import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';
import { AdminAccountsService } from './admin-accounts.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminSeedService } from './admin-seed.service';
import { AdminAuthController, AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { AuditService } from './audit.service';
import { AdminSupportController, SupportController } from './support.controller';
import { SupportService } from './support.service';
import { VisitsModule } from '../visits/visits.module';
import { VisitsService } from '../visits/visits.service';
import { PromosModule } from '../promos/promos.module';
import { AdminPromosController } from '../promos/admin-promos.controller';

/**
 * The management console's API.
 *
 * Self-contained on purpose. It reads across the platform's tables, but it
 * shares no authentication with the app: its own accounts, its own signing
 * key, its own guard. Nothing here is exported, so no app module can
 * accidentally acquire an admin capability by injecting one of these services.
 *
 * `JwtModule.register({})` mirrors the auth module — the secret is passed per
 * call rather than configured once, which is what lets this module sign with a
 * different key from the app's.
 */
@Module({
  imports: [
    JwtModule.register({}),
    StorageModule,
    MailModule,
    NotificationsModule,
    VisitsModule,
    // For AdminPromosController below: the promo routes are console routes, so
    // they are registered here to inherit this module's guard and audit log
    // rather than reimplementing either inside PromosModule.
    PromosModule,
  ],
  controllers: [
    AdminAuthController,
    AdminController,
    AdminSupportController,
    SupportController,
    AdminPromosController,
  ],
  providers: [
    AdminAuthService,
    AdminSeedService,
    AdminAccountsService,
    AdminService,
    AdminGuard,
    AuditService,
    SupportService,
  ],
})
export class AdminModule {}
