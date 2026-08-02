import { Global, Module } from '@nestjs/common';
import { MailConfig } from './mail.config';
import { MailService } from './mail.service';

/**
 * Global so auth, collaborators and friends can all send without each
 * importing this module — the same reasoning as QuotaModule.
 */
@Global()
@Module({
  providers: [MailConfig, MailService],
  exports: [MailConfig, MailService],
})
export class MailModule {}
