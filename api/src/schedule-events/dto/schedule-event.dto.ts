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
  'event',
  'editing',
  'review',
  'delivery',
  'meeting',
  /** Free text, carried in `event_type_other`. */
  'other',
] as const;

/**
 * The label on an `other` event.
 *
 * Not validated against `event_type` here: a PATCH may send either field
 * without the other, and a DTO cannot see the stored row to know which type it
 * is being combined with. ScheduleEventsService resolves the pair against the
 * event as it stands and rejects the combinations that make no sense.
 */
const OTHER_LABEL_MAX = 40;

/** Matches hiring_posts.location, so the same venue fits in both. */
const LOCATION_MAX = 120;

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

  @IsOptional()
  @IsString()
  @MaxLength(OTHER_LABEL_MAX)
  event_type_other?: string;

  /** Where it happens. Same 120 cap as a job post's location. */
  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  location?: string;
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

  /** Null clears it, which is what switching away from `other` does. */
  @IsOptional()
  @IsString()
  @MaxLength(OTHER_LABEL_MAX)
  event_type_other?: string | null;

  /** Null clears it — an event can stop having a location. */
  @IsOptional()
  @IsString()
  @MaxLength(LOCATION_MAX)
  location?: string | null;
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
