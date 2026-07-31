import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from './auth.service';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Whatever this returns becomes `request.user`. No database lookup on purpose:
   * the signature already proves the claims are ours, and a per-request query
   * would put the database on the hot path of every authenticated call. The
   * trade-off is that a deleted user's access token stays valid until it
   * expires — bounded by JWT_ACCESS_TTL, 15 minutes by default.
   */
  validate(payload: JwtPayload): AuthenticatedUser {
    return { id: payload.sub, email: payload.email };
  }
}
