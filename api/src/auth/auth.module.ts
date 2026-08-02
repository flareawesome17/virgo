import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountFlowsService } from './account-flows.service';
import { AuthTokensService } from './auth-tokens.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersRepository } from './users.repository';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Secrets are passed per-sign call in AuthService so access and refresh
    // paths cannot accidentally share one.
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccountFlowsService, AuthTokensService, JwtStrategy, UsersRepository],
  exports: [AuthService],
})
export class AuthModule {}
