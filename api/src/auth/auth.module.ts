import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountService } from './account.service';
import { AccountFlowsService } from './account-flows.service';
import { AuthTokensService } from './auth-tokens.service';
import { JwtStrategy } from './jwt.strategy';
import { StorageModule } from '../storage/storage.module';
import { PromosModule } from '../promos/promos.module';
import { UsersRepository } from './users.repository';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Secrets are passed per-sign call in AuthService so access and refresh
    // paths cannot accidentally share one.
    JwtModule.register({}),
    // Deleting an account has to empty its bucket objects too, or they are
    // stranded — paid for, unreachable, and impossible to find again.
    StorageModule,
    // Signup records who referred an account; verifying the address is what
    // pays them. Both halves of a referral live in this module's flows.
    PromosModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AccountService,
    AccountFlowsService,
    AuthTokensService,
    JwtStrategy,
    UsersRepository,
    TwoFactorService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
