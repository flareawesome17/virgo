import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ListQueryDto } from '../../common/dto/list-query.dto';

const EVENT_TYPES = [
  'shoot',
  'editing',
  'review',
  'delivery',
  'meeting',
] as const;

/** HH:MM or HH:MM:SS — matches Postgres `time`. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class CreateScheduleEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsDateString({ strict: true })
  event_date!: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'event_time must be HH:MM or HH:MM:SS' })
  event_time?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  event_type?: (typeof EVENT_TYPES)[number];
}

export class UpdateScheduleEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  event_date?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'event_time must be HH:MM or HH:MM:SS' })
  event_time?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  event_type?: (typeof EVENT_TYPES)[number];
}

export class ListScheduleEventsDto extends ListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  workspace_id?: string;

  @IsOptional()
  @IsIn(EVENT_TYPES)
  event_type?: (typeof EVENT_TYPES)[number];

  /** Supplying both switches the endpoint to range mode. */
  @IsOptional()
  @IsDateString({ strict: true })
  from?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  to?: string;
}
