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
  ValidateIf,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser } from '../auth/current-user.decorator';
import { HiringService } from './hiring.service';

/** Ten million centavos is ₱100,000 — well past any rate on this market. */
const MAX_BUDGET = 100_000_00;

/**
 * Editing a live post.
 *
 * Every field optional, and `undefined` means "leave it alone" — distinct from
 * `null`, which clears an optional column. Without that distinction a client
 * sending a partial patch would wipe the date and budget it did not mention.
 */
export class UpdateJobDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'Give the job a title people can scan' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(30, { message: 'Say what the job actually involves' })
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @IsString({ each: true })
  rolesWanted?: string[];

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a date like 2026-11-14' })
  eventDate?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  location?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  budgetMin?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  budgetMax?: number | null;
}

export class CreateJobDto {
  @IsString()
  // Short on purpose: the brief carries the detail, so the title only has to
  // be a recognisable label. Mirrored by JOB_TITLE_MIN on both clients.
  @MinLength(3, { message: 'Give the job a title people can scan' })
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
 * Reading the job board.
 *
 * Signed-in only. The board was briefly open to anybody — good for search,
 * and the reason the slugs and structured data exist — but every post names a
 * real person, a date, a place and a budget, and that is a directory of who is
 * where and worth how much. Requiring an account is the whole mitigation: it
 * puts a verified identity and a rate limit behind every read.
 *
 * The `sitemap` route is gone with it. A sitemap of pages a crawler cannot
 * fetch is worse than none — it advertises the addresses while serving 401s.
 */
@Controller('jobs')
export class PublicJobsController {
  constructor(private readonly hiring: HiringService) {}

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  list(
    @CurrentUser('id') userId: string,
    @Query('roles') roles?: string,
    @Query('location') location?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.hiring.list(userId, {
      // Comma-separated in the query string; the service drops anything that
      // is not a known role, so a junk value narrows to nothing rather than
      // reaching SQL.
      roles: roles ? roles.split(',').map((r) => r.trim()) : [],
      location,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  /**
   * The badge counts. Before `:slug`, or "unseen" reads as a post's slug.
   *
   * Two numbers: postings you have not seen, and applications waiting on an
   * answer from you. The second used to be missing entirely, so somebody
   * applying to your job produced a socket frame and an email and nothing
   * else — if the app was closed when it arrived, there was no trace of it
   * anywhere in the UI.
   *
   * Polled on a short interval by both clients, so it stays one round trip.
   */
  @Get('unseen')
  unseen(@CurrentUser('id') userId: string) {
    return this.hiring.unseenCount(userId);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':slug')
  bySlug(@CurrentUser('id') userId: string, @Param('slug') slug: string) {
    return this.hiring.bySlug(userId, slug);
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

  /** Clears the badge. Called when the Jobs tab is opened. */
  @HttpCode(200)
  @Post('seen')
  markSeen(@CurrentUser('id') userId: string) {
    return this.hiring.markSeen(userId);
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

  /**
   * How many people filling or closing this would answer.
   *
   * The clients ask before doing it, so the confirmation can name the number
   * rather than a bare "are you sure" — ending a post ends other people's
   * applications, and that should be stated.
   */
  @Get(':id/pending-applicants')
  pendingApplicants(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.hiring.endingCost(userId, id);
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

  /**
   * Edit a post that is already up.
   *
   * Declared before `:id/status` would be wrong — Nest matches in declaration
   * order and a bare `:id` PATCH does not collide with `:id/status`, but
   * keeping it after leaves the more specific route first regardless.
   */
  @HttpCode(200)
  @Patch(':id')
  update(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
  ) {
    return this.hiring.update(userId, id, dto);
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
