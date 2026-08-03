import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PresenceService } from './presence.service';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Global so any service can push without importing this module — the same
 * reasoning as QuotaModule and MailModule.
 *
 * JwtModule is registered bare: the gateway passes the secret explicitly on
 * every verify, because a WebSocket carries no request context for the usual
 * async config to hang off.
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway, PresenceService],
  exports: [RealtimeGateway, PresenceService],
})
export class RealtimeModule {}
