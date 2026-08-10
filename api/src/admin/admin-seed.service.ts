import { randomBytes } from 'node:crypto';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { AdminAuthService } from './admin-auth.service';

/**
 * Creates the first console owner from ADMIN_EMAIL_SEED.
 *
 * The console has no sign-up — every account is made by an existing owner —
 * so the first one has to come from somewhere, and requiring an operator to
 * shell into the container before they can log in is a bad first five minutes.
 *
 * Runs on every boot and does nothing if that email already has an account, so
 * a restart cannot reset a password or resurrect an account somebody deleted
 * on purpose. It also never *updates* an existing row: if it did, anyone able
 * to restart the container could take over the console by changing one
 * environment variable.
 */
@Injectable()
export class AdminSeedService implements OnModuleInit {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
    private readonly auth: AdminAuthService,
  ) {}

  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL_SEED')?.trim().toLowerCase();
    if (!email) return;

    try {
      const existing = await this.db.queryOne<{ id: string }>(
        'select id from admin_users where lower(email) = $1',
        [email],
      );
      if (existing) return;

      // 24 bytes of base64url. Long enough that the 12-character policy is not
      // what stands between this account and a guess, and it is replaced on
      // first sign-in anyway.
      const password = randomBytes(18).toString('base64url');
      const hash = await this.auth.hashPassword(password);

      await this.db.query(
        `insert into admin_users (email, name, password_hash, role, must_change_password)
         values ($1, $2, $3, 'owner', true)`,
        [email, 'Owner', hash],
      );

      // Printed once, to the server's own log. There is no better channel: no
      // console account exists yet to be emailed, and a fixed default password
      // baked into the image would be worse in every way. `must_change_password`
      // is what makes this safe — the credential is single-use.
      this.logger.warn(
        [
          '',
          '  ┌────────────────────────────────────────────────────────────┐',
          '  │  Management console owner created                          │',
          '  └────────────────────────────────────────────────────────────┘',
          `     email:    ${email}`,
          `     password: ${password}`,
          '',
          '     You will be asked to change this the first time you sign in.',
          '',
        ].join('\n'),
      );
    } catch (err) {
      // Never fatal. A seeding failure must not stop the API serving the app —
      // the console being unreachable is a smaller problem than the platform
      // being down.
      this.logger.error(`Console owner not seeded: ${String(err)}`);
    }
  }
}
