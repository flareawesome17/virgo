import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { VisitsService } from './visits.service';

class VisitDto {
  @IsString() @MaxLength(200) path!: string;
  @IsOptional() @IsString() @MaxLength(120) host?: string;
  @IsOptional() @IsString() @MaxLength(500) referrer?: string;
}

/**
 * Where site visits come in.
 *
 * A beacon the pages call, rather than middleware counting every request: a
 * server-side counter would also count asset fetches, prefetches, health
 * checks and every bot that ever hits the origin, and report a number nobody
 * could act on.
 *
 * The client sends a path; it is normalised here, on the server, before it
 * touches the database. Doing that on the client would mean trusting a page to
 * strip its own share token, and one page that forgets is a live gallery
 * credential in a table.
 */
@Public()
@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @HttpCode(204)
  @Post()
  async record(@Body() dto: VisitDto, @Req() req: Request) {
    // Cloudflare sits in front, so req.ip is the edge unless trust proxy is
    // configured. The header is the honest source here; it is only ever
    // hashed, never stored.
    const ip =
      (req.headers['cf-connecting-ip'] as string) ||
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      'unknown';

    await this.visits.record({
      host: dto.host || (req.headers.host ?? 'unknown'),
      path: dto.path,
      referrer: dto.referrer,
      ip,
      userAgent: req.headers['user-agent'] ?? '',
    });
  }
}
