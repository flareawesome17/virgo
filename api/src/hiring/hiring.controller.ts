import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { HiringService } from './hiring.service';

/** Ten million centavos is ₱100,000 — well past any rate on this market. */
const MAX_BUDGET = 100_000_00;

export class CreateJobDto {
  @IsString()
  @MinLength(8, { message: 'Give the job a title people can scan' })
  @MaxLength(120)
  title!: string;

  @IsString()
  @MinLength(30, { message: 'Say what the job actually involves' })
  @MaxLength(4000)
  description!: string;

  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  rolesWanted!: string[];

  /** A calendar day, not an instant — see the same note on hire enquiries. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2026-11-14' })
  eventDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  location?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_BUDGET)
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MAX_BUDGET)
  budgetMax?: number;
}

export class SetJobStatusDto {
  @IsIn(['open', 'filled', 'closed'])
  status!: 'open' | 'filled' | 'closed';
}

export class ApplyDto {
  @IsString()
  @MinLength(20, { message: 'Tell them why you are right for this' })
  @MaxLength(2000)
  message!: string;
}

export class RespondDto {
  @IsIn(['shortlisted', 'accepted', 'declined'])
  status!: 'shortlisted' | 'accepted' | 'declined';
}

export class ReportDto {
  @IsIn(['spam', 'scam', 'offensive', 'not-a-job', 'other'])
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * The public job board.
 *
 * Its own controller so the `@Public()` blast radius is two routes rather than
 * a class — auth is deny-by-default here and these are the exceptions.
 */
@Controller('jobs')
export class PublicJobsController {
  constructor(private readonly hiring: HiringService) {}

  /** Slugs for the sitemap. Before `:slug`, or it reads as somebody's post. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('sitemap')
  async sitemap() {
    const data = await this.hiring.openSlugs();
    return { data, total: data.length };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  list(
    @Query('roles') roles?: string,
    @Query('location') location?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.hiring.list({
      // Comma-separated in the query string; the service drops anything that
      // is not a known role, so a junk value narrows to nothing rather than
      // reaching SQL.
      roles: roles ? roles.split(',').map((r) => r.trim()) : [],
      location,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.hiring.bySlug(slug);
  }
}

/** Posting and managing jobs. Authenticated, and verified — it reaches people. */
@Controller('me/jobs')
export class MyJobsController {
  constructor(private readonly hiring: HiringService) {}

  @Get()
  async mine(@CurrentUser('id') userId: string) {
    const data = await this.hiring.mine(userId);
    return { data, total: data.length };
  }

  /** Everything the caller has applied to. */
  @Get('applications')
  async myApplications(@CurrentUser('id') userId: string) {
    const data = await this.hiring.myApplications(userId);
    return { data, total: data.length };
  }

  /**
   * Five posts an hour.
   *
   * Bucketed per account, so a studio sharing one office line does not share
   * one allowance. The board being empty is the real risk at this size; this
   * only stops one account flooding it.
   */
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  @HttpCode(201)
  @Post()
  create(@CurrentUser('id') userId: string, @Body() dto: CreateJobDto) {
    return this.hiring.create(userId, dto);
  }

  @HttpCode(200)
  @Patch(':id/status')
  setStatus(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: SetJobStatusDto,
  ) {
    return this.hiring.setStatus(userId, id, dto.status);
  }

  @HttpCode(200)
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.hiring.remove(userId, id);
  }

  /** Applications on one of the caller's own posts. */
  @Get(':id/applications')
  async applications(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    const data = await this.hiring.applicationsFor(userId, id);
    return { data, total: data.length };
  }
}

/** Applying, answering, and reporting. */
@Controller('jobs')
export class JobActionsController {
  constructor(private readonly hiring: HiringService) {}

  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  @HttpCode(201)
  @Post(':slug/apply')
  apply(
    @CurrentUser('id') userId: string,
    @Param('slug') slug: string,
    @Body() dto: ApplyDto,
  ) {
    return this.hiring.apply(userId, slug, dto.message);
  }

  @HttpCode(200)
  @Post('applications/:id/respond')
  respond(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: RespondDto,
  ) {
    return this.hiring.respond(userId, id, dto.status);
  }

  @Throttle({ default: { limit: 10, ttl: 3_600_000 } })
  @HttpCode(202)
  @Post(':id/report')
  report(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReportDto,
  ) {
    return this.hiring.report(userId, id, dto.reason, dto.note);
  }
}
